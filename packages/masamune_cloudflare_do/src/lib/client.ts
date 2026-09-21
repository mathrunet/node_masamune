import { HttpError } from "./http_error";
import type { DoStorage, SchemaManifest, SchemaTable, SchemaColumn } from "./types";
export function quote(value: string): string {
  if(["__proto__", "constructor", "prototype"].includes(value)) throw new HttpError(400, "予約識別子です。");
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new HttpError(400, "不正なSQL識別子です。");
  return `"${value}"`;
}
export function validateManifest(manifest: SchemaManifest): void {
  if(manifest.version !== "1" || manifest.dialect !== "sqlite" || !Array.isArray(manifest.tables)) throw new HttpError(500, "Do schemaが不正です。");
  const seen = new Set<string>();
  for(const t of manifest.tables) {
    quote(t.database); quote(t.table);
    if(["_masamune_", "_cf_", "sqlite_", "d1_"].some(p => t.table.startsWith(p)) || seen.has(`${t.database}/${t.table}`)) throw new HttpError(500, "予約・重複tableです。");
    seen.add(`${t.database}/${t.table}`);
    if(JSON.stringify(t.primaryKey) !== '["id"]' || !t.columns.some(c => c.name === "id" && c.sqlType === "TEXT" && !c.nullable)) throw new HttpError(500, "主キーはTEXT idです。");
    const cols = new Set<string>();
    for(const c of t.columns) {
      quote(c.name);
      if(cols.has(c.name) || !["TEXT", "INTEGER", "REAL", "BOOLEAN", "JSON"].includes(c.sqlType)) throw new HttpError(500, "Doのカラム定義が不正です。");
      cols.add(c.name);
    }
    if((t.vectors?.length ?? 0) !== t.vectorFields.length) throw new HttpError(500, "vector定義が一致しません。");
    for(const vector of t.vectors ?? []) {
      if(!cols.has(vector.field) || !t.vectorFields.includes(vector.field) || t.columns.find(c => c.name === vector.field)?.sqlType !== "JSON" || !Number.isInteger(vector.dimensions) || vector.dimensions < 32 || vector.dimensions > 1536 || !["cosine", "euclidean", "dot-product"].includes(vector.metric) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(vector.binding)) throw new HttpError(500, "DOのvector定義が不正です。");
    }
    const indices = new Set<string>();
    for(const i of t.indexes ?? []) {
      quote(i.name);
      if(indices.has(i.name) || !i.columns.length || i.columns.some(c => !cols.has(c))) throw new HttpError(500, "indexが不正です。");
      indices.add(i.name);
    }
  }
}
export function encode(value: unknown, column?: SchemaColumn): unknown {
  if(value == null) return null;
  switch(column?.sqlType) {
    case "JSON": {
      return JSON.stringify(value);
    }
    case "BOOLEAN":
      if(![true, false, 0, 1].includes(value as never)) throw new HttpError(400, "BOOLEAN値が不正です。");
      return Number(value);
    case "INTEGER":
      if(!Number.isSafeInteger(value)) throw new HttpError(400, "整数はsafe integer範囲内にしてください。大きな整数はTEXTで保持してください。");
      return value;
    case "REAL":
      if(typeof value !== "number" || !Number.isFinite(value)) throw new HttpError(400, "REAL値が不正です。");
      return value;
    case "TEXT":
      if(typeof value !== "string") throw new HttpError(400, "TEXT値が不正です。");
      return value;
    default:
      if(typeof value === "boolean") return Number(value);
      if(typeof value === "number" && !Number.isFinite(value)) throw new HttpError(400, "数値が不正です。");
      return typeof value === "object" ? JSON.stringify(value) : value;
  }
}
export function decode(row: Record<string, unknown>, table: SchemaTable): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const type = table.columns.find(c => c.name === key)?.sqlType;
    if(value != null && type === "INTEGER" && !Number.isSafeInteger(value)) throw new HttpError(502, "整数の精度を保持できません。");
    if(value != null && type === "BOOLEAN") {
      if(value !== 0 && value !== 1) throw new HttpError(502, "BOOLEAN応答が不正です。");
      value = value === 1;
    }
    if(value != null && type === "JSON" && typeof value === "string") value = JSON.parse(value);
    return [key, value];
  }));
}
export class DoClient {
  constructor(readonly session: DoStorage, readonly manifest: SchemaManifest, readonly database: string) { validateManifest(manifest); }
  table(database: string, name: string): SchemaTable {
    if(database !== this.database) throw new HttpError(400, "異なるDBの操作は混在できません。");
    const table = this.manifest.tables.find(t => t.database === database && t.table === name);
    if(!table) throw new HttpError(400, "schemaにないtableです。");
    return table;
  }
  column(t: SchemaTable, name: string): string {
    if(!t.columns.some(c => c.name === name)) throw new HttpError(400, "schemaにないcolumnです。");
    return quote(name);
  }
  execute(sql: string, parameters: unknown[] = []): Record<string, unknown>[] {
    if(parameters.length > 100) throw new HttpError(400, "bind値は100個までです。");
    return this.session.sql.exec(sql, ...parameters).toArray();
  }
}
