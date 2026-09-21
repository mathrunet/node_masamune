import { normalizeVectorValue, resolveVectorIndex, vectorNamespace, vectorRetryAt } from "@mathrunet/masamune_cloudflare";
import { DoClient, decode, quote } from "./client";
import { directWhere } from "./crud";
import { HttpError } from "./http_error";
import type { CrudRequest, DoIdentity, DoStorage, SchemaManifest, SchemaTable, VectorField, VectorIndex } from "./types";

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function vectorValues(value: unknown, spec: VectorField): number[] {
  try { return normalizeVectorValue(value, spec); }
  catch(error) { throw new HttpError(400, error instanceof Error ? error.message : "ベクトルが不正です。"); }
}

export function validateVectors(table: SchemaTable, value: Record<string, unknown>): void {
  for (const vector of table.vectors ?? []) if (Object.hasOwn(value, vector.field) && value[vector.field] !== null) vectorValues(value[vector.field], vector);
}

export function initializeVectors(store: DoStorage, manifest: SchemaManifest, database: string): void {
  store.sql.exec('CREATE TABLE IF NOT EXISTS "_masamune_vector_state" (table_name TEXT NOT NULL, field TEXT NOT NULL, document_id TEXT NOT NULL, generation TEXT NOT NULL, PRIMARY KEY(table_name,field,document_id))');
  store.sql.exec('CREATE TABLE IF NOT EXISTS "_masamune_vector_jobs" (generation TEXT PRIMARY KEY NOT NULL, table_name TEXT NOT NULL, field TEXT NOT NULL, document_id TEXT NOT NULL, next_attempt INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT \'pending\', mutation_id TEXT)');
  store.sql.exec('CREATE INDEX IF NOT EXISTS "_masamune_vector_due" ON "_masamune_vector_jobs" (next_attempt,generation)');
  for (const table of manifest.tables.filter(t => t.database === database)) for (const vector of table.vectors ?? []) for (const operation of ["INSERT", "UPDATE", "DELETE"] as const) {
    const row = operation === "DELETE" ? "OLD" : "NEW";
    const key = `table_name=${literal(table.table)} AND field=${literal(vector.field)} AND document_id=${row}."id"`;
    const update = operation === "UPDATE" ? `UPDATE OF ${quote(vector.field)}` : operation;
    store.sql.exec(`CREATE TRIGGER IF NOT EXISTS "_masamune_vector_${table.table}_${vector.field}_${operation.toLowerCase()}" AFTER ${update} ON ${quote(table.table)} BEGIN UPDATE "_masamune_vector_jobs" SET next_attempt=0,status='pending' WHERE ${key}; INSERT INTO "_masamune_vector_state" VALUES (${literal(table.table)},${literal(vector.field)},${row}."id",lower(hex(randomblob(16)))) ON CONFLICT(table_name,field,document_id) DO UPDATE SET generation=excluded.generation; INSERT INTO "_masamune_vector_jobs" (generation,table_name,field,document_id) SELECT generation,table_name,field,document_id FROM "_masamune_vector_state" WHERE ${key}; END`);
  }
}

function indexFor(env: Record<string, unknown>, spec: VectorField): VectorIndex {
  try { return resolveVectorIndex(env, spec) as VectorIndex; }
  catch { throw new HttpError(500, "Vectorize bindingがありません。"); }
}

const namespaceFor = (identity: DoIdentity, table: string, field: string) => vectorNamespace(identity.topic === undefined ? [identity.environment, identity.database, identity.userId, table, field] : ["shared", identity.environment, identity.database, identity.topic, table, field]);

export async function drainVectors(client: DoClient, identity: DoIdentity, env: Record<string, unknown>, limit = 10, now = Date.now()) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, "処理件数は1〜100です。");
  const jobs = client.execute('SELECT * FROM "_masamune_vector_jobs" WHERE next_attempt<=? ORDER BY next_attempt,generation LIMIT ?', [now, limit]);
  const result = { accepted: 0, failed: 0 };
  for (const job of jobs) {
    try {
      const table = client.table(identity.database, String(job.table_name));
      const spec = table.vectors?.find(v => v.field === job.field);
      if (!spec) throw new HttpError(500, "再試行対象のvector定義がありません。");
      const rows = client.execute(`SELECT t.${quote(spec.field)} AS value FROM ${quote(table.table)} t JOIN "_masamune_vector_state" s ON s.document_id=t.id WHERE s.table_name=? AND s.field=? AND s.generation=?`, [table.table, spec.field, job.generation]);
      const value = rows[0]?.value;
      const mutation = value == null
        ? await indexFor(env, spec).deleteByIds([String(job.generation)])
        : await indexFor(env, spec).upsert([{ id: String(job.generation), values: vectorValues(value, spec), namespace: await namespaceFor(identity, table.table, spec.field) }]);
      client.execute('UPDATE "_masamune_vector_jobs" SET next_attempt=?,status=\'accepted\',attempts=0,mutation_id=? WHERE generation=?', [now + 3600000, mutation.mutationId, job.generation]);
      result.accepted++;
    } catch {
      client.execute('UPDATE "_masamune_vector_jobs" SET next_attempt=?,status=\'failed\',attempts=attempts+1 WHERE generation=?', [vectorRetryAt(now, Number(job.attempts)), job.generation]);
      result.failed++;
    }
  }
  return result;
}

export function nextVectorAlarm(client: DoClient): number | undefined {
  const row = client.execute('SELECT MIN(next_attempt) AS next_attempt FROM "_masamune_vector_jobs"')[0];
  return typeof row?.next_attempt === "number" ? row.next_attempt : undefined;
}

export async function rebuildVectors(client: DoClient, identity: DoIdentity, tableName: string, after = "", limit = 100) {
  const table = client.table(identity.database, tableName);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, "再構築件数は1〜100です。");
  const rows = client.execute(`SELECT id FROM ${quote(tableName)} WHERE id>? ORDER BY id LIMIT ?`, [after, limit]);
  client.session.transactionSync(() => {
    for (const row of rows) for (const spec of table.vectors ?? []) {
      const parameters = [tableName, spec.field, row.id];
      client.execute(`INSERT INTO "_masamune_vector_state" SELECT ?,?,?,lower(hex(randomblob(16))) WHERE EXISTS (SELECT 1 FROM ${quote(tableName)} WHERE id=?) ON CONFLICT(table_name,field,document_id) DO NOTHING`, [...parameters, row.id]);
      client.execute('INSERT INTO "_masamune_vector_jobs" (generation,table_name,field,document_id) SELECT generation,table_name,field,document_id FROM "_masamune_vector_state" WHERE table_name=? AND field=? AND document_id=? ON CONFLICT(generation) DO UPDATE SET next_attempt=0,status=\'pending\'', parameters);
    }
  });
  return { cursor: rows.length ? String(rows.at(-1)!.id) : after, done: rows.length < limit };
}

/** 現行世代・通常whereを照合した候補を返す。文書rulesは外側Workerが候補ごとに評価する。 */
export async function searchVectors(client: DoClient, identity: DoIdentity, env: Record<string, unknown>, request: CrudRequest) {
  const table = client.table(identity.database, request.table);
  const nearest = request.nearest!;
  const spec = table.vectors?.find(v => v.field === nearest.key);
  if (!spec || request.count || request.orderBy?.length || request.indexKey) throw new HttpError(400, "ベクトル検索の条件が不正です。");
  if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100)) throw new HttpError(400, "検索件数は1〜100です。");
  const where = directWhere(client, table, request);
  if (where.parameters.length > 97) throw new HttpError(400, "近傍検索の条件がDOのbind上限を超えています。");
  const matches = await indexFor(env, spec).query(vectorValues(nearest.value, spec), { topK: 100, namespace: await namespaceFor(identity, table.table, spec.field), returnMetadata: "none", returnValues: false });
  const ids = [...new Set(matches.matches.slice(0, 100).map(match => match.id))];
  if (!ids.length) return [];
  const generations = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 98) {
    const batch = ids.slice(offset, offset + 98);
    for (const state of client.execute(`SELECT generation,document_id FROM "_masamune_vector_state" WHERE table_name=? AND field=? AND generation IN (${batch.map(() => "?").join(",")})`, [table.table, spec.field, ...batch])) generations.set(String(state.generation), String(state.document_id));
  }
  const documents = new Map<string, Record<string, unknown>>();
  for (let offset = 0; offset < ids.length; offset += 98 - where.parameters.length) {
    const batch = ids.slice(offset, offset + 98 - where.parameters.length).filter(id => generations.has(id));
    if (!batch.length) continue;
    const rows = client.execute(`SELECT t.*,s.generation AS __masamune_vector_generation FROM ${quote(table.table)} t JOIN "_masamune_vector_state" s ON s.document_id=t.id AND s.table_name=? AND s.field=?${where.sql || " WHERE 1=1"} AND s.generation IN (${batch.map(() => "?").join(",")})`, [table.table, spec.field, ...where.parameters, ...batch]);
    for (const row of rows) { const generation = String(row.__masamune_vector_generation); delete row.__masamune_vector_generation; documents.set(generation, decode(row, table)); }
  }
  return ids.flatMap(id => documents.has(id) ? [documents.get(id)!] : []);
}
