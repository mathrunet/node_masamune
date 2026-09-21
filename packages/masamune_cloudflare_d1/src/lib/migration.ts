import { vectorTables, vectorTriggers } from "./vector";
import { createHash } from "node:crypto";
import { quote, validateManifest } from "./client";
import type { SchemaManifest } from "./types";
export type Row = Record<string, unknown>;
export interface MigrationTarget { accountId: string; databaseId: string; database: string; environment: "dev" | "prod" }
export interface Snapshot { objects: { name: string; type: string; sql: string }[]; columns: Record<string, Row[]> }
export interface Migration { version: string; target: MigrationTarget; before: Snapshot; after: SchemaManifest; sql: string[]; hash: string }
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
export const schemaQuery = "SELECT name,type,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name NOT GLOB 'd1_*' AND (name NOT GLOB '_masamune_*' OR name GLOB '_masamune_vector_*') AND sql IS NOT NULL ORDER BY type,name";
export async function inspect(query: (sql: string) => Promise<Row[]>): Promise<Snapshot> {
  const objects = await query(schemaQuery) as Snapshot["objects"]; const columns: Snapshot["columns"] = {};
  for(const t of objects.filter(o => o.type === "table")) columns[t.name] = await query(`PRAGMA table_info(${quote(t.name)})`);
  return { objects, columns };
}
function storage(type: string) { return type === "JSON" ? "TEXT" : type === "BOOLEAN" ? "INTEGER" : type; }
export function diff(snapshot: Snapshot, manifest: SchemaManifest, database: string): string[] {
  validateManifest(manifest); const tables = manifest.tables.filter(t => t.database === database); const statements: string[] = [];
  if(!tables.length) throw new Error("対象DBのschemaがありません。");
  for(const old of snapshot.objects.filter(o => o.type === "table" && !o.name.startsWith("_masamune_vector_"))) if(!tables.some(t => t.table === old.name)) throw new Error("table削除は通常migrationでは実行できません。");
  for(const table of tables) {
    const old = snapshot.columns[table.table];
    if(!old) { statements.push(`CREATE TABLE ${quote(table.table)} (${table.columns.map(c => `${quote(c.name)} ${storage(c.sqlType)}${c.nullable ? "" : " NOT NULL"}${c.name === "id" ? " PRIMARY KEY" : ""}`).join(", ")})`); }
    else {
      for(const c of old) { const next = table.columns.find(n => n.name === c.name); if(!next || storage(next.sqlType) !== String(c.type).toUpperCase() || Number(c.notnull) !== Number(!next.nullable) || Number(c.pk) !== Number(next.name === "id")) throw new Error("カラム削除・型・制約変更は通常migrationでは実行できません。"); }
      for(const c of table.columns.filter(c => !old.some(o => o.name === c.name))) { if(!c.nullable) throw new Error("NOT NULL追加には既存データの移行が必要です。"); statements.push(`ALTER TABLE ${quote(table.table)} ADD COLUMN ${quote(c.name)} ${storage(c.sqlType)}`); }
    }
    for(const index of table.indexes ?? []) {
      if(index.unique) throw new Error("UNIQUE追加は通常migrationでは実行できません。");
      const name = `${table.table}__${index.name}`; const sql = `CREATE INDEX ${quote(name)} ON ${quote(table.table)} (${index.columns.map(quote).join(", ")})`;
      const existing = snapshot.objects.find(o => o.name === name && o.type === "index"); if(existing && existing.sql !== sql) throw new Error("indexの変更には個別移行が必要です。"); if(!existing) statements.push(sql);
    }
    for(const o of snapshot.objects.filter(o => o.type === "index" && o.name.startsWith(`${table.table}__`))) if(!(table.indexes ?? []).some(i => o.name === `${table.table}__${i.name}`)) throw new Error("index削除は通常migrationでは実行できません。");
  }
  const vectorObjects = tables.some(t => t.vectors?.length) ? [...vectorTables, ...tables.flatMap(vectorTriggers)] : [];
  for(const sql of vectorObjects) {
    const name = sql.match(/CREATE (?:TABLE|INDEX|TRIGGER) "([^"]+)"/)![1];
    const old = snapshot.objects.find(o => o.name === name);
    if(old && old.sql !== sql) throw new Error("vector内部schemaの変更には個別移行が必要です。");
    if(!old) statements.push(sql);
  }
  for(const old of snapshot.objects.filter(o => o.name.startsWith("_masamune_vector_"))) if(!vectorObjects.some(sql => sql.includes(`"${old.name}"`))) throw new Error("vector定義の削除には個別移行が必要です。");
  return statements;
}
export function createMigration(version: string, target: MigrationTarget, before: Snapshot, after: SchemaManifest): Migration {
  if(!/^[0-9]{8,20}_[a-z][a-z0-9_]*$/.test(version)) throw new Error("versionは日時_名前で指定してください。");
  const base = { version, target, before, after, sql: diff(before, after, target.database) }; return { ...base, hash: digest(base) };
}
export function verify(m: Migration, target: MigrationTarget): void {
  const { hash, ...base } = m;
  if(hash !== digest(base) || JSON.stringify(m.target) !== JSON.stringify(target) || JSON.stringify(m.sql) !== JSON.stringify(diff(m.before, m.after, target.database))) throw new Error("migrationのhash・接続先・SQLが一致しません。");
}
/** Wranglerが一つのmigrationをtransactionとして実行する。schemaガードとledgerも同じtransactionへ入れる。 */
export function applySql(m: Migration, current: Snapshot, mark = false): string {
  if(mark) { if(diff(current, m.after, m.target.database).length) throw new Error("mark対象の実schemaが一致しません。"); }
  else if(digest(current) !== digest(m.before)) throw new Error("生成時と実schemaが一致しません。再生成してください。");
  const predicates = [`(SELECT COUNT(*) FROM (${schemaQuery}))=${current.objects.length}`, ...current.objects.map(o => `EXISTS (SELECT 1 FROM (${schemaQuery}) WHERE name=${literal(o.name)} AND type=${literal(o.type)} AND sql=${literal(o.sql)})`)];
  return [
    'CREATE TABLE IF NOT EXISTS "_masamune_migrations" (version TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL, target TEXT NOT NULL)',
    'CREATE TABLE "_masamune_guard" (ok INTEGER CHECK(ok=1))',
    `INSERT INTO "_masamune_guard" VALUES (CASE WHEN ${predicates.join(" AND ")} THEN 1 ELSE 0 END)`,
    ...(mark ? [] : m.sql),
    `INSERT INTO "_masamune_migrations" VALUES (${literal(m.version)},${literal(m.hash)},${literal(JSON.stringify(m.target))})`,
    'DROP TABLE "_masamune_guard"',
  ].map(s => s + ";").join("\n");
}
