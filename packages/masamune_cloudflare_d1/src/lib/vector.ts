import { D1Client, decode, quote } from "./client";
import { directWhere } from "./crud";
import { HttpError } from "./http_error";
import type { SchemaTable, VectorField, VectorIndex, CrudRequest } from "./types";
import { normalizeVectorValue, resolveVectorIndex, vectorNamespace as sharedVectorNamespace, vectorRetryAt } from "@mathrunet/masamune_cloudflare";

/** 世代別IDは不変。遅れたupsertも現行世代を書き換えない。 */
export const vectorTables = [
  `CREATE TABLE "_masamune_vector_state" (table_name TEXT NOT NULL, field TEXT NOT NULL, document_id TEXT NOT NULL, generation TEXT NOT NULL, PRIMARY KEY(table_name,field,document_id))`,
  `CREATE TABLE "_masamune_vector_jobs" (generation TEXT PRIMARY KEY NOT NULL, table_name TEXT NOT NULL, field TEXT NOT NULL, document_id TEXT NOT NULL, next_attempt INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', mutation_id TEXT)`,
  `CREATE INDEX "_masamune_vector_due" ON "_masamune_vector_jobs" (next_attempt,generation)`,
];
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
export function vectorTriggers(table: SchemaTable): string[] {
  return (table.vectors ?? []).flatMap(v => ["INSERT", "UPDATE", "DELETE"].map(op => {
    const row = op === "DELETE" ? "OLD" : "NEW";
    const key = `table_name=${lit(table.table)} AND field=${lit(v.field)} AND document_id=${row}."id"`;
    // UPDATE OFで通常カラムだけの変更による不要な再indexを避ける。
    return `CREATE TRIGGER "_masamune_vector_${table.table}_${v.field}_${op.toLowerCase()}" AFTER ${op === "UPDATE" ? `UPDATE OF ${quote(v.field)}` : op} ON ${quote(table.table)} BEGIN SELECT '${v.dimensions}:${v.metric}:${v.binding}'; ` +
      `UPDATE "_masamune_vector_jobs" SET next_attempt=0,status='pending' WHERE ${key}; ` +
      `INSERT INTO "_masamune_vector_state" VALUES (${lit(table.table)},${lit(v.field)},${row}."id",lower(hex(randomblob(16)))) ON CONFLICT(table_name,field,document_id) DO UPDATE SET generation=excluded.generation; ` +
      `INSERT INTO "_masamune_vector_jobs" (generation,table_name,field,document_id) SELECT generation,table_name,field,document_id FROM "_masamune_vector_state" WHERE ${key}; END`;
  }));
}
export function vectorValues(value: unknown, spec: VectorField): number[] {
  try { return normalizeVectorValue(value, spec); }
  catch(error) { throw new HttpError(400, error instanceof Error ? error.message : "ベクトルが不正です。"); }
}
export function validateVectors(table: SchemaTable, value: Record<string, unknown>): void {
  for(const v of table.vectors ?? []) if(Object.hasOwn(value, v.field) && value[v.field] !== null) vectorValues(value[v.field], v);
}
export function indexFor(env: Record<string, unknown>, spec: VectorField): VectorIndex {
  try { return resolveVectorIndex(env, spec) as VectorIndex; }
  catch { throw new HttpError(500, "Vectorize bindingがありません。"); }
}
/** namespaceはDB/table/field単位。実データや認可情報をmetadataへ複製しない。 */
export async function vectorNamespace(database: string, table: string, field: string): Promise<string> {
  return sharedVectorNamespace([database, table, field]);
}
export async function drainVectors(client: D1Client, env: Record<string, unknown>, limit = 10, now = Date.now()) {
  if(!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, "処理件数は1〜100です。");
  const jobs = await client.execute('SELECT * FROM "_masamune_vector_jobs" WHERE next_attempt<=? ORDER BY next_attempt,generation LIMIT ?', [now, limit]);
  const result = { accepted: 0, failed: 0 };
  for(const job of jobs) {
    try {
      const table = client.table(client.database, String(job.table_name));
      const spec = table.vectors?.find(v => v.field === job.field);
      if(!spec) throw new HttpError(500, "再試行対象のvector定義がありません。");
      const index = indexFor(env, spec);
      const rows = await client.execute(`SELECT t.${quote(spec.field)} AS value FROM ${quote(table.table)} t JOIN "_masamune_vector_state" s ON s.document_id=t.id WHERE s.table_name=? AND s.field=? AND s.generation=?`, [table.table, spec.field, job.generation]);
      const value = rows[0]?.value;
      const mutation = value == null
        ? await index.deleteByIds([String(job.generation)])
        : await index.upsert([{ id: String(job.generation), values: vectorValues(value, spec), namespace: await vectorNamespace(client.database, table.table, spec.field) }]);
      // 受付後にも定期照合する。遅延した旧upsertや削除・再作成を回収できる。
      await client.execute('UPDATE "_masamune_vector_jobs" SET next_attempt=?,status=\'accepted\',attempts=0,mutation_id=? WHERE generation=?', [now + 3600000, mutation.mutationId, job.generation]);
      result.accepted++;
    } catch {
      await client.execute('UPDATE "_masamune_vector_jobs" SET next_attempt=?,status=\'failed\',attempts=attempts+1 WHERE generation=?', [vectorRetryAt(now, Number(job.attempts)), job.generation]);
      result.failed++;
    }
  }
  return result;
}
/** 既存行も含め、主キーcursorで再開可能。現行世代だけを作業対象へ追加する。 */
export async function rebuildVectors(client: D1Client, tableName: string, after = "", limit = 100) {
  const table = client.table(client.database, tableName);
  if(!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, "再構築件数は1〜100です。");
  const rows = await client.execute(`SELECT id FROM ${quote(tableName)} WHERE id>? ORDER BY id LIMIT ?`, [after, limit]);
  for(const row of rows) for(const spec of table.vectors ?? []) {
    const parameters = [tableName, spec.field, row.id];
    await client.session.batch([
      client.session.prepare(`INSERT INTO "_masamune_vector_state" SELECT ?,?,?,lower(hex(randomblob(16))) WHERE EXISTS (SELECT 1 FROM ${quote(tableName)} WHERE id=?) ON CONFLICT(table_name,field,document_id) DO NOTHING`).bind(...parameters, row.id),
      client.session.prepare('INSERT INTO "_masamune_vector_jobs" (generation,table_name,field,document_id) SELECT generation,table_name,field,document_id FROM "_masamune_vector_state" WHERE table_name=? AND field=? AND document_id=? ON CONFLICT(generation) DO UPDATE SET next_attempt=0,status=\'pending\'').bind(...parameters),
    ]);
  }
  return { cursor: rows.length ? String(rows[rows.length - 1].id) : after, done: rows.length < limit };
}
export async function searchVectors(client: D1Client, env: Record<string, unknown>, request: CrudRequest, allowed: (id: string) => Promise<boolean>) {
  const table = client.table(client.database, request.table);
  const nearest = request.nearest!;
  const spec = table.vectors?.find(v => v.field === nearest.key);
  if(!spec || request.count || request.orderBy?.length || request.indexKey) throw new HttpError(400, "ベクトル検索の条件が不正です。");
  const limit = request.limit ?? 10;
  if(!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, "検索件数は1〜100です。");
  const where = directWhere(client, table, request);
  const batchSize = 98 - where.parameters.length;
  if(batchSize < 1) throw new HttpError(400, "近傍検索の条件がD1のbind上限を超えています。");
  const matches = await indexFor(env, spec).query(vectorValues(nearest.value, spec), { topK: 100, namespace: await vectorNamespace(client.database, table.table, spec.field), returnMetadata: "none", returnValues: false });
  const ids = [...new Set(matches.matches.slice(0, 100).map(m => m.id))];
  const candidates = new Map<string, string>();
  for(let offset = 0; offset < ids.length; offset += 98) {
    const batch = ids.slice(offset, offset + 98);
    const states = await client.execute(`SELECT generation,document_id FROM "_masamune_vector_state" WHERE table_name=? AND field=? AND generation IN (${batch.map(() => "?").join(",")})`, [table.table, spec.field, ...batch]);
    for(const state of states) if(await allowed(String(state.document_id))) candidates.set(String(state.generation), String(state.document_id));
  }
  const generations = [...candidates.keys()];
  const documents = new Map<string, Record<string, unknown>>();
  let generationColumn = "__d1_vector_generation";
  while(table.columns.some(c => c.name === generationColumn)) generationColumn += "_";
  for(let offset = 0; offset < generations.length; offset += batchSize) {
    const batch = generations.slice(offset, offset + batchSize);
    // 認可待機中の更新も拒否する。本文・条件・世代は同じSQLで照合する。
    const rows = await client.execute(`SELECT * FROM (SELECT t.*, s.generation AS ${quote(generationColumn)} FROM ${quote(table.table)} t JOIN "_masamune_vector_state" s ON s.document_id=t.id AND s.table_name=? AND s.field=?)${where.sql || " WHERE 1=1"} AND ${quote(generationColumn)} IN (${batch.map(() => "?").join(",")})`, [table.table, spec.field, ...where.parameters, ...batch]);
    for(const row of rows) {
      const generation = String(row[generationColumn]); delete row[generationColumn];
      documents.set(generation, decode(row, table));
    }
  }
  const returned = new Set<string>();
  return ids.flatMap(id => {
    const row = documents.get(id);
    if(!row || returned.has(String(row.id))) return [];
    returned.add(String(row.id)); return [row];
  }).slice(0, limit);
}
