import { quote, validateManifest } from "./client";
import { HttpError } from "./http_error";
import type { DoStorage, DoRevision, SchemaManifest } from "./types";
export const canonical = (value: unknown): string => JSON.stringify(value);
export async function hash(value: unknown): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value))))].map(v => v.toString(16).padStart(2, "0")).join("");
}
const storageType = (type: string) => type === "JSON" ? "TEXT" : type === "BOOLEAN" ? "INTEGER" : type;
/** 初期生成とnullable列・非unique indexの追加だけを許可する。 */
export function schemaDiff(before: SchemaManifest | null, after: SchemaManifest, database: string): string[] {
  validateManifest(after); if(before) validateManifest(before);
  const previous = before?.tables.filter(t => t.database === database) ?? [];
  const next = after.tables.filter(t => t.database === database); const sql: string[] = [];
  if(!next.length) throw new HttpError(400, "対象DBのschemaがありません。");
  for(const old of previous) if(!next.some(t => t.table === old.table)) throw new HttpError(400, "table削除は禁止です。");
  for(const table of next) {
    const old = previous.find(t => t.table === table.table);
    if(!old) sql.push(`CREATE TABLE ${quote(table.table)} (${table.columns.map(c => `${quote(c.name)} ${storageType(c.sqlType)}${c.nullable ? "" : " NOT NULL"}${c.name === "id" ? " PRIMARY KEY" : ""}`).join(", ")})`);
    else {
      for(const col of old.columns) if(canonical(col) !== canonical(table.columns.find(c => c.name === col.name))) throw new HttpError(400, "列削除・型・制約変更は禁止です。");
      for(const col of table.columns.filter(c => !old.columns.some(o => o.name === c.name))) {
        if(!col.nullable) throw new HttpError(400, "NOT NULL追加は禁止です。");
        sql.push(`ALTER TABLE ${quote(table.table)} ADD COLUMN ${quote(col.name)} ${storageType(col.sqlType)}`);
      }
      for(const index of old.indexes ?? []) if(canonical(index) !== canonical(table.indexes?.find(i => i.name === index.name))) throw new HttpError(400, "index削除・変更は禁止です。");
    }
    for(const index of table.indexes ?? []) {
      if(index.unique) throw new HttpError(400, "UNIQUE追加は禁止です。");
      if(!old?.indexes?.some(i => i.name === index.name)) sql.push(`CREATE INDEX ${quote(table.table+'__'+index.name)} ON ${quote(table.table)} (${index.columns.map(quote).join(', ')})`);
    }
  }
  return sql;
}
export async function revision(version: string, database: string, before: SchemaManifest | null, after: SchemaManifest): Promise<DoRevision> {
  if(!/^[0-9]{8,20}_[a-z][a-z0-9_]*$/.test(version)) throw new HttpError(400, "versionは日時_名前で指定します。");
  const base = { version, database, before, after, sql: schemaDiff(before, after, database) };
  return { ...base, hash: await hash(base) };
}
export async function verifyRevisions(revisions: DoRevision[]): Promise<void> {
  const versions = new Set<string>(); const heads = new Map<string, SchemaManifest>();
  for(const r of revisions) {
    const expected = await revision(r.version, r.database, r.before, r.after);
    if(versions.has(r.database+'/'+r.version) || canonical(r) !== canonical(expected) || canonical(r.before) !== canonical(heads.get(r.database) ?? null)) throw new HttpError(409, "migration履歴・hash・SQLが一致しません。");
    versions.add(r.database+'/'+r.version); heads.set(r.database, r.after);
  }
}
/** 実体を照合するため、ローカル履歴だけで適用済みにしない。 */
export function checkSchema(store: DoStorage, manifest: SchemaManifest, database: string): void {
  const tables = manifest.tables.filter(t => t.database === database);
  const objects = store.sql.exec("SELECT name,type,sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name NOT GLOB '__cf_*' AND name != '__miniflare_do_name' AND name NOT GLOB '_masamune_*' AND sql IS NOT NULL").toArray();
  if(objects.filter(o => o.type === 'table').length !== tables.length || objects.some(o => !['table','index'].includes(String(o.type)))) throw new HttpError(409, "実schemaに未管理のオブジェクトがあります。");
  for(const table of tables) {
    const cols = store.sql.exec(`PRAGMA table_info(${quote(table.table)})`).toArray();
    if(cols.length !== table.columns.length || table.columns.some(c => !cols.some(o => o.name === c.name && o.type === storageType(c.sqlType) && Number(o.notnull) === Number(!c.nullable) && Number(o.pk) === Number(c.name === 'id')))) throw new HttpError(409, "実schemaのカラムが一致しません。");
    const indexes = objects.filter(o => o.type === 'index' && String(o.name).startsWith(table.table+'__'));
    if(indexes.length !== (table.indexes ?? []).length) throw new HttpError(409, "実schemaのindexが一致しません。");
    for(const i of table.indexes ?? []) {
      const actual = indexes.find(o => o.name === table.table+'__'+i.name);
      const expected = `CREATE INDEX ${quote(table.table+'__'+i.name)} ON ${quote(table.table)} (${i.columns.map(quote).join(', ')})`;
      if(actual?.sql !== expected) throw new HttpError(409, "indexのSQLが一致しません。");
    }
  }
}
export function applyRevisions(store: DoStorage, revisions: DoRevision[], manifest: SchemaManifest, database: string): void {
  store.transactionSync(() => {
    store.sql.exec('CREATE TABLE IF NOT EXISTS _masamune_schema (version TEXT PRIMARY KEY, hash TEXT NOT NULL, manifest TEXT NOT NULL)');
    const applied = store.sql.exec('SELECT * FROM _masamune_schema ORDER BY rowid').toArray();
    const plans = revisions.filter(r => r.database === database);
    if(!plans.length || applied.length > plans.length) throw new HttpError(409, "承認済みmigrationがありません。");
    applied.forEach((a,i) => { if(a.version !== plans[i].version || a.hash !== plans[i].hash || a.manifest !== canonical(plans[i].after)) throw new HttpError(409, "適用履歴が一致しません。"); });
    if(applied.length) checkSchema(store, plans[applied.length-1].after, database);
    else if(store.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name != '__miniflare_do_name' AND name NOT GLOB '_masamune_*' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name NOT GLOB '__cf_*'").toArray().length) throw new HttpError(409, "未管理の既存tableがあります。");
    for(const r of plans.slice(applied.length)) {
      for(const sql of r.sql) store.sql.exec(sql);
      checkSchema(store, r.after, database);
      store.sql.exec('INSERT INTO _masamune_schema VALUES (?,?,?)', r.version, r.hash, canonical(r.after));
    }
    if(canonical(plans.at(-1)!.after) !== canonical(manifest)) throw new HttpError(409, "配備manifestとmigrationが一致しません。");
    checkSchema(store, manifest, database);
  });
}
