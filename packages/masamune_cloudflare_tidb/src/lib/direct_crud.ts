import { nativeVectorSpec, nativeNearest, normalizeVectorValue, isUnloadedVector } from "@mathrunet/masamune_cloudflare";
import { TidbDirectClient, SchemaTable, decodeDirectRow, quoteIdentifier } from "./direct_client";
import { HttpError } from "./http_error";
import { TidbCrudMethod, TidbRequestBody } from "./types";

type Request = Required<Pick<TidbRequestBody, "database" | "table">> & TidbRequestBody;
export type DirectExecutor = Pick<TidbDirectClient, "table" | "column" | "execute">;
const encode = (value: unknown) => value == null ? null : typeof value === "boolean" ? Number(value) :
  typeof value === "object" ? JSON.stringify(value) : value;

/** 同一カラムの複数条件もANDで保持する。値や識別子を文字列連結しない。 */
export function directWhere(client: DirectExecutor, schema: SchemaTable, request: Request): { sql: string; parameters: unknown[] } {
  const conditions = [...(request.indexKey ? [{ key: "id", value: request.indexKey, type: "equalTo" }] : []), ...(request.where ?? [])];
  const parameters: unknown[] = [];
  const parts = conditions.map(condition => {
    const key = client.column(schema, condition.key ?? "");
    const value = condition.value;
    const type = condition.type ?? "equalTo";
    if (["isNull", "isNotNull"].includes(type) || (value === null && ["equalTo", "notEqualTo"].includes(type))) {
      return `${key} IS ${["isNotNull", "notEqualTo"].includes(type) ? "NOT " : ""}NULL`;
    }
    const operator = { equalTo: "=", notEqualTo: "<>", lessThan: "<", lessThanOrEqualTo: "<=", greaterThan: ">", greaterThanOrEqualTo: ">=" }[type];
    if (operator) {
      parameters.push(encode(value));
      return type === "notEqualTo" ? `(${key} <> ? OR ${key} IS NULL)` : `${key} ${operator} ?`;
    }
    if (type === "whereIn" || type === "whereNotIn") {
      if (!Array.isArray(value) || !value.length || value.length > 1000) throw new HttpError(400, "whereIn/whereNotIn requires 1-1000 values.");
      const nonNull = value.filter(v => v !== null);
      parameters.push(...nonNull.map(encode));
      const membership = nonNull.length ? `${key} ${type === "whereNotIn" ? "NOT " : ""}IN (${nonNull.map(() => "?").join(", ")})` : type === "whereIn" ? "FALSE" : "TRUE";
      if (type === "whereIn") return value.includes(null) ? `(${membership} OR ${key} IS NULL)` : membership;
      return value.includes(null) ? `(${membership} AND ${key} IS NOT NULL)` : `(${membership} OR ${key} IS NULL)`;
    }
    if (type === "like") {
      parameters.push(String(value ?? ""));
      return `LOCATE(?, COALESCE(${key}, '')) > 0`;
    }
    if (type === "arrayContains" || type === "arrayContainsAny") {
      if (schema.columns.find(c => c.name === condition.key)?.sqlType.toUpperCase() !== "JSON") throw new HttpError(400, "Array conditions require JSON columns.");
      const values = type === "arrayContains" ? [value] : value;
      if (!Array.isArray(values) || !values.length || values.length > 1000) throw new HttpError(400, "Array condition requires 1-1000 values.");
      parameters.push(...values.map(v => JSON.stringify([v])));
      return `(JSON_TYPE(${key}) = 'ARRAY' AND (${values.map(() => `JSON_CONTAINS(${key}, CAST(? AS JSON))`).join(" OR ")}))`;
    }
    throw new HttpError(400, "Unsupported where condition.");
  });
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", parameters };
}
function tableSql(schema: SchemaTable) { return `${quoteIdentifier(schema.database)}.${quoteIdentifier(schema.table)}`; }
function limitRows(maxScanRows: number): number {
  if (!Number.isSafeInteger(maxScanRows) || maxScanRows < 1 || maxScanRows > 1999) throw new HttpError(500, "maxScanRows must be between 1 and 1999.");
  return maxScanRows;
}
export async function selectDirectRows(client: DirectExecutor, request: Request, maxScanRows = 1000): Promise<Record<string, unknown>[]> {
  const schema = client.table(request.database, request.table);
  const where = directWhere(client, schema, request);
  const max = limitRows(maxScanRows);
  if (request.limit !== undefined && (!Number.isSafeInteger(request.limit) || request.limit < 1)) throw new HttpError(400, "Invalid limit.");
  let nearest;
  try { nearest = nativeNearest(request, schema.columns.flatMap(c => nativeVectorSpec(c.name, c.sqlType, c.vectorMetric) ?? [])); }
  catch (error) { throw new HttpError(400, String(error)); }
  if (nearest) {
    const field = client.column(schema, nearest.spec.field);
    const filter = where.sql + (where.sql ? " AND " : " WHERE ") + `${field} IS NOT NULL`;
    const fn = nearest.spec.metric === "euclidean" ? "VEC_L2_DISTANCE" : "VEC_COSINE_DISTANCE";
    const rows = await client.execute(schema.database,
      `SELECT * FROM ${tableSql(schema)}${filter} ORDER BY ${fn}(${field}, VEC_FROM_TEXT(?)) ASC, \`id\` ASC LIMIT ?`,
      [...where.parameters, JSON.stringify(nearest.value), nearest.limit]);
    return rows.map(row => decodeDirectRow(row, schema));
  }
  const order = request.orderBy?.length ? ` ORDER BY ${request.orderBy.map(o => `${client.column(schema, o.key ?? "")} ${o.descending ? "DESC" : "ASC"}`).join(", ")}` : "";
  const rows = await client.execute(schema.database, `SELECT * FROM ${tableSql(schema)}${where.sql}${order} LIMIT ?`,
    [...where.parameters, Math.min(request.limit ?? max + 1, max + 1)]);
  if (rows.length > max) throw new HttpError(413, "TiDB scan exceeded maxScanRows.");
  return rows.map(row => decodeDirectRow(row, schema));
}
export async function fetchDirectDocumentForRules(client: DirectExecutor, request: Request, maxScanRows = 1000): Promise<Record<string, unknown> | null> {
  return (await selectDirectRows(client, { ...request, limit: 1 }, maxScanRows))[0] ?? null;
}
export async function executeDirectCrud({ client, method, request, maxScanRows = 1000 }: {
  client: DirectExecutor; method: TidbCrudMethod; request: Request; maxScanRows?: number;
}): Promise<unknown> {
  const schema = client.table(request.database, request.table);
  limitRows(maxScanRows);
  if (request.nearest !== undefined && (method !== "GET" || request.count)) throw new HttpError(400, "nearest is read-only and cannot count.");
  if (method === "GET") {
    if (!request.count) return selectDirectRows(client, request, maxScanRows);
    const where = directWhere(client, schema, request);
    const rows = await client.execute(schema.database, `SELECT COUNT(*) AS count FROM ${tableSql(schema)}${where.sql}`, where.parameters);
    const count = Number(rows[0]?.count);
    if (!Number.isSafeInteger(count) || count < 0) throw new HttpError(502, "Invalid count.");
    return count;
  }
  if (method === "POST") {
    const value = vectorWriteValue(schema, requireValue(request.value));
    const now = Date.now();
    const row = { ...value, id: request.indexKey ?? value.id ?? crypto.randomUUID(), created_at: value.created_at ?? now, updated_at: value.updated_at ?? now };
    if (typeof row.id !== "string" || !row.id.length) throw new HttpError(400, "id must be a non-empty string.");
    for (const key of Object.keys(row)) client.column(schema, key);
    const columns = schema.columns.map(c => c.name);
    const updates = columns.filter(c => c !== "id" && c !== "created_at" &&
      (!schema.columns.find(col => col.name === c)?.sqlType.startsWith("VECTOR(") || Object.hasOwn(value, c)));
    await client.execute(schema.database,
      `INSERT INTO ${tableSql(schema)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON DUPLICATE KEY UPDATE ${updates.map(c => `${quoteIdentifier(c)} = VALUES(${quoteIdentifier(c)})`).join(", ")}`,
      columns.map(c => encode((row as Record<string, unknown>)[c])));
    return [decodeDirectRow(row, schema)];
  }
  if (!request.indexKey && !request.where?.length) throw new HttpError(400, `${method} requires indexKey or where.`);
  const value = method === "PUT" ? vectorWriteValue(schema, requireValue(request.value)) : {};
  for (const key of Object.keys(value)) client.column(schema, key);
  const rows = await selectDirectRows(client, { ...request, limit: undefined, orderBy: undefined }, maxScanRows);
  if (method === "DELETE") {
    // Freeze the selected IDs and retain the original filter so concurrent
    // inserts or rows that no longer match cannot expand the deletion scope.
    const ids = rows.map(row => {
      if (typeof row.id !== "string") throw new HttpError(502, "Row requires a string id.");
      return row.id;
    });
    const where = directWhere(client, schema, request);
    for (let start = 0; start < ids.length; start += 100) {
      const batch = ids.slice(start, start + 100);
      await client.execute(schema.database,
        `DELETE FROM ${tableSql(schema)}${where.sql} AND ${client.column(schema, "id")} IN (${batch.map(() => "?").join(", ")})`,
        [...where.parameters, ...batch]);
    }
    return [];
  }
  const result: Record<string, unknown>[] = [];
  for (const old of rows) {
    if (typeof old.id !== "string") throw new HttpError(502, "Row requires a string id.");
    const where = directWhere(client, schema, { ...request, indexKey: old.id });
    const patch = { ...value, updated_at: value.updated_at ?? Date.now() };
    const keys = Object.keys(patch).filter(k => k !== "id" && k !== "created_at");
    await client.execute(schema.database, `UPDATE ${tableSql(schema)} SET ${keys.map(k => `${client.column(schema, k)} = ?`).join(", ")}${where.sql}`,
      [...keys.map(k => encode((patch as Record<string, unknown>)[k])), ...where.parameters]);
    result.push(decodeDirectRow({ ...old, ...Object.fromEntries(keys.map(k => [k, (patch as Record<string, unknown>)[k]])) }, schema));
  }
  return result;
}
function requireValue(value?: Record<string, unknown>): Record<string, unknown> {
  if (!value || !Object.keys(value).length) throw new HttpError(400, "value is required.");
  return value;
}

function vectorWriteValue(schema: SchemaTable, value: Record<string, unknown>): Record<string, unknown> {
  const result = { ...value };
  for (const column of schema.columns) {
    const spec = nativeVectorSpec(column.name, column.sqlType, column.vectorMetric);
    if (!spec || !Object.hasOwn(result, column.name)) continue;
    const raw = result[column.name];
    if (isUnloadedVector(raw)) { delete result[column.name]; continue; }
    if (raw === null) continue;
    try { result[column.name] = normalizeVectorValue(raw, spec); }
    catch (error) { throw new HttpError(400, String(error)); }
  }
  return result;
}
