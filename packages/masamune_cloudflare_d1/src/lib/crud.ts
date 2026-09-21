import { validateVectors, vectorValues } from "./vector";
import { D1Client, encode, decode, quote } from "./client";
import { HttpError } from "./http_error";
import type { SchemaTable, CrudRequest as Request, D1CrudMethod } from "./types";
/** 同一カラムの複数条件もANDで保持する。値や識別子を文字列連結しない。 */
export function directWhere(client: D1Client, schema: SchemaTable, request: Request): { sql: string; parameters: unknown[] } {
  const conditions = [...(request.indexKey ? [{ key: "id", value: request.indexKey, type: "equalTo" }] : []), ...(request.where ?? [])];
  const parameters: unknown[] = [];
  const parts = conditions.map(condition => {
    const key = client.column(schema, condition.key ?? "");
    const value = condition.value;
    const type = condition.type ?? "equalTo";
    if(["isNull", "isNotNull"].includes(type) || (value === null && ["equalTo", "notEqualTo"].includes(type))) {
      return `${key} IS ${["isNotNull", "notEqualTo"].includes(type) ? "NOT " : ""}NULL`;
    }
    const operator = { equalTo: "=", notEqualTo: "<>", lessThan: "<", lessThanOrEqualTo: "<=", greaterThan: ">", greaterThanOrEqualTo: ">=" }[type];
    if(operator) {
      parameters.push(encode(value));
      return type === "notEqualTo" ? `(${key} <> ? OR ${key} IS NULL)` : `${key} ${operator} ?`;
    }
    if(type === "whereIn" || type === "whereNotIn") {
      if(!Array.isArray(value) || !value.length || value.length > 1000) throw new HttpError(400, "whereIn/whereNotIn requires 1-1000 values.");
      const nonNull = value.filter(v => v !== null);
      parameters.push(...nonNull.map(v => encode(v)));
      const membership = nonNull.length ? `${key} ${type === "whereNotIn" ? "NOT " : ""}IN (${nonNull.map(() => "?").join(", ")})` : type === "whereIn" ? "FALSE" : "TRUE";
      if(type === "whereIn") return value.includes(null) ? `(${membership} OR ${key} IS NULL)` : membership;
      return value.includes(null) ? `(${membership} AND ${key} IS NOT NULL)` : `(${membership} OR ${key} IS NULL)`;
    }
    if(type === "like") {
      parameters.push(String(value ?? ""));
      return `instr(COALESCE(${key}, ''), ?) > 0`;
    }
    if(type === "arrayContains" || type === "arrayContainsAny") {
      if(schema.columns.find(c => c.name === condition.key)?.sqlType.toUpperCase() !== "JSON") throw new HttpError(400, "Array conditions require JSON columns.");
      const values = type === "arrayContains" ? [value] : value;
      if(!Array.isArray(values) || !values.length || values.length > 1000) throw new HttpError(400, "Array condition requires 1-1000 values.");
      parameters.push(...values.map(v => JSON.stringify(v)));
      return `(json_type(${key}) = 'array' AND (${values.map(() => `EXISTS (SELECT 1 FROM json_each(${key}) AS j WHERE j.value IS json_extract(?, '$'))`).join(" OR ")}))`;
    }
    throw new HttpError(400, "Unsupported where condition.");
  });
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", parameters };
}
function tableSql(schema: SchemaTable) { return quote(schema.table); }
function limitRows(maxScanRows: number): number {
  if(!Number.isSafeInteger(maxScanRows) || maxScanRows < 1 || maxScanRows > 1999) throw new HttpError(500, "maxScanRows must be between 1 and 1999.");
  return maxScanRows;
}
export async function selectDirectRows(client: D1Client, request: Request, maxScanRows = 1000): Promise<Record<string, unknown>[]> {
  const schema = client.table(request.database, request.table);
  const where = directWhere(client, schema, request);
  const max = limitRows(maxScanRows);
  if(request.limit !== undefined && (!Number.isSafeInteger(request.limit) || request.limit < 1)) throw new HttpError(400, "Invalid limit.");
  const order = request.orderBy?.length ? ` ORDER BY ${request.orderBy.map(o => `${client.column(schema, o.key ?? "")} ${o.descending ? "DESC" : "ASC"}`).join(", ")}` : "";
  const rows = await client.execute(`SELECT * FROM ${tableSql(schema)}${where.sql}${order} LIMIT ?`,
    [...where.parameters, Math.min(request.limit ?? max + 1, max + 1)]);
  if(rows.length > max) throw new HttpError(413, "D1 scan exceeded maxScanRows.");
  return rows.map(row => decode(row, schema));
}
export async function fetchDirectDocumentForRules(client: D1Client, request: Request, maxScanRows = 1000): Promise<Record<string, unknown> | null> {
  return (await selectDirectRows(client, { ...request, limit: 1 }, maxScanRows))[0] ?? null;
}

/** 一つの変更はRETURNINGを含む一文で実行する。batchでも同じ文を使う。 */
export function mutation(client: D1Client, method: D1CrudMethod, request: Request): { sql: string; parameters: unknown[]; schema: SchemaTable } {
  const schema = client.table(request.database, request.table);
  const value = { ...request.value };
  for(const spec of schema.vectors ?? []) {
    if(Object.hasOwn(value, spec.field) && value[spec.field] !== null) value[spec.field] = {
      "@type": "ModelVectorValue", "@vector": vectorValues(value[spec.field], spec),
      "@measure": spec.metric === "dot-product" ? "dotProduct" : spec.metric, "@source": "server"
    };
  }
  validateVectors(schema, value);
  for(const key of Object.keys(value)) client.column(schema, key);
  if(method === "POST") {
    const id = request.indexKey ?? value.id;
    if(typeof id !== "string" || !id.length || id.includes("/")) throw new HttpError(400, "保存にはidが必要です。");
    const row: Record<string, unknown> = { ...value, id, created_at: value.created_at ?? Date.now(), updated_at: value.updated_at ?? Date.now() };
    const columns = schema.columns;
    const updates = columns.filter(c => c.name !== "id" && c.name !== "created_at" && (!schema.vectorFields.includes(c.name) || Object.hasOwn(value, c.name)));
    return { schema, sql: `INSERT INTO ${quote(schema.table)} (${columns.map(c => quote(c.name)).join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT ("id") DO UPDATE SET ${updates.map(c => `${quote(c.name)}=excluded.${quote(c.name)}`).join(",")} RETURNING *`, parameters: columns.map(c => encode(row[c.name], c)) };
  }
  if(!request.indexKey) throw new HttpError(400, "更新・削除はドキュメントIDを指定してください。");
  const where = directWhere(client, schema, request);
  if(method === "DELETE") return { schema, sql: `DELETE FROM ${quote(schema.table)}${where.sql} RETURNING *`, parameters: where.parameters };
  if(method !== "PUT" || !Object.keys(value).length) throw new HttpError(400, "更新値が必要です。");
  if(Object.hasOwn(value, "id") || Object.hasOwn(value, "created_at")) throw new HttpError(400, "主キー・作成日時は更新できません。");
  const patch = { ...value, updated_at: value.updated_at ?? Date.now() };
  return { schema, sql: `UPDATE ${quote(schema.table)} SET ${Object.keys(patch).map(k => `${client.column(schema, k)}=?`).join(",")}${where.sql} RETURNING *`, parameters: [...Object.entries(patch).map(([k, v]) => encode(v, schema.columns.find(c => c.name === k))), ...where.parameters] };
}
export async function executeCrud(client: D1Client, method: D1CrudMethod, request: Request, max = 1000): Promise<unknown> {
  if(method === "GET") {
    if(!request.count) return selectDirectRows(client, request, max);
    const schema = client.table(request.database, request.table);
    const where = directWhere(client, schema, request);
    const rows = await client.execute(`SELECT COUNT(*) AS count FROM ${quote(schema.table)}${where.sql}`, where.parameters);
    return rows[0].count;
  }
  const statement = mutation(client, method, request);
  const rows = await client.execute(statement.sql, statement.parameters);
  return method === "DELETE" ? [] : rows.map(r => decode(r, statement.schema));
}
