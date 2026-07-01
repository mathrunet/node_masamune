import { HttpError, validateIdentifier } from "./request";
import {
  decodeRow,
  encodeSqlValue,
  ensureTableSchema,
  quoteIdentifier,
} from "./schema";
import { SqlValue, TursoClient } from "./turso_client";
import { TursoOrderCondition, TursoRequestBody, TursoWhereCondition } from "./types";

export async function fetchDocumentForRules(
  client: TursoClient,
  request: Required<Pick<TursoRequestBody, "database" | "table">> & TursoRequestBody,
): Promise<Record<string, unknown> | null> {
  const rows = await selectRows(client, {
    ...request,
    count: false,
  }, true);
  return rows[0] ?? null;
}

export async function executeCrud({
  client,
  method,
  request,
  autoCreateTable,
  autoMigrateAddColumns,
}: {
  client: TursoClient;
  method: "GET" | "POST" | "PUT" | "DELETE";
  request: Required<Pick<TursoRequestBody, "database" | "table">> & TursoRequestBody;
  autoCreateTable: boolean;
  autoMigrateAddColumns: boolean;
}): Promise<unknown> {
  switch (method) {
    case "GET":
      if (request.count) {
        return await countRows(client, request);
      }
      return await selectRows(client, request);
    case "POST":
      if (request.indexKey) {
        return await updateRows(client, request, autoCreateTable, autoMigrateAddColumns);
      }
      return await insertRow(client, request, autoCreateTable, autoMigrateAddColumns);
    case "PUT":
      return await updateRows(client, request, autoCreateTable, autoMigrateAddColumns);
    case "DELETE":
      await deleteRows(client, request);
      return [];
  }
}

async function selectRows(
  client: TursoClient,
  request: Required<Pick<TursoRequestBody, "database" | "table">> & TursoRequestBody,
  single = false,
): Promise<Record<string, unknown>[]> {
  const { sql, args } = buildWhereClause(request);
  const orderBy = buildOrderByClause(request.orderBy ?? []);
  const limitValue = request.limit && request.limit > 0 ? request.limit : undefined;
  const limit = single ? " LIMIT 1" : limitValue ? ` LIMIT ${limitValue}` : "";
  const result = await client.execute({
    sql: `SELECT * FROM ${quoteIdentifier(request.table)}${sql}${orderBy}${limit}`,
    args,
  });
  return result.rows.map((row) => decodeRow(row, result.columns));
}

async function countRows(
  client: TursoClient,
  request: Required<Pick<TursoRequestBody, "database" | "table">> & TursoRequestBody,
): Promise<number> {
  const { sql, args } = buildWhereClause(request);
  const result = await client.execute({
    sql: `SELECT COUNT(*) AS count FROM ${quoteIdentifier(request.table)}${sql}`,
    args,
  });
  const row = result.rows[0] === undefined
    ? undefined
    : decodeRow(result.rows[0], result.columns);
  const count = row?.count;
  return typeof count === "number" ? count : Number(count ?? 0);
}

async function insertRow(
  client: TursoClient,
  request: Required<Pick<TursoRequestBody, "database" | "table">> & TursoRequestBody,
  autoCreateTable: boolean,
  autoMigrateAddColumns: boolean,
): Promise<Record<string, unknown>[]> {
  const value = requireValue(request.value);
  const now = Date.now();
  const row: Record<string, unknown> = {
    ...value,
    id: request.indexKey ?? value.id ?? crypto.randomUUID(),
    created_at: value.created_at ?? now,
    updated_at: value.updated_at ?? now,
  };
  await ensureTableSchema({
    client,
    table: request.table,
    value: row,
    autoCreateTable,
    autoMigrateAddColumns,
  });
  const keys = Object.keys(row).map((key) => validateIdentifier(key, "column"));
  const placeholders = keys.map(() => "?").join(", ");
  const result = await client.execute({
    sql: `INSERT OR REPLACE INTO ${quoteIdentifier(request.table)} ` +
      `(${keys.map(quoteIdentifier).join(", ")}) VALUES (${placeholders}) RETURNING *`,
    args: keys.map((key) => encodeSqlValue(row[key])),
  });
  return result.rows.map((item) => decodeRow(item, result.columns));
}

async function updateRows(
  client: TursoClient,
  request: Required<Pick<TursoRequestBody, "database" | "table">> & TursoRequestBody,
  autoCreateTable: boolean,
  autoMigrateAddColumns: boolean,
): Promise<Record<string, unknown>[]> {
  const value = requireValue(request.value);
  const row: Record<string, unknown> = {
    ...value,
    updated_at: value.updated_at ?? Date.now(),
  };
  await ensureTableSchema({
    client,
    table: request.table,
    value: row,
    autoCreateTable,
    autoMigrateAddColumns,
  });
  const where = buildWhereClause(request);
  if (!where.sql) {
    throw new HttpError(400, "PUT requires indexKey or where.");
  }
  const keys = Object.keys(row).map((key) => validateIdentifier(key, "column"));
  const setSql = keys.map((key) => `${quoteIdentifier(key)} = ?`).join(", ");
  const args = [
    ...keys.map((key) => encodeSqlValue(row[key])),
    ...where.args,
  ];
  const result = await client.execute({
    sql: `UPDATE ${quoteIdentifier(request.table)} SET ${setSql}${where.sql} RETURNING *`,
    args,
  });
  return result.rows.map((item) => decodeRow(item, result.columns));
}

async function deleteRows(
  client: TursoClient,
  request: Required<Pick<TursoRequestBody, "database" | "table">> & TursoRequestBody,
): Promise<void> {
  const where = buildWhereClause(request);
  if (!where.sql) {
    throw new HttpError(400, "DELETE requires indexKey or where.");
  }
  await client.execute({
    sql: `DELETE FROM ${quoteIdentifier(request.table)}${where.sql}`,
    args: where.args,
  });
}

function buildWhereClause(
  request: Required<Pick<TursoRequestBody, "database" | "table">> & TursoRequestBody,
): { sql: string; args: SqlValue[] } {
  const conditions: TursoWhereCondition[] = [];
  if (request.indexKey) {
    conditions.push({
      type: "equalTo",
      key: "id",
      value: request.indexKey,
    });
  }
  conditions.push(...(request.where ?? []));
  if (conditions.length === 0) {
    return {
      sql: "",
      args: [],
    };
  }
  const clauses = conditions.map((condition) => {
    const key = validateIdentifier(condition.key ?? "", "where.key");
    const column = quoteIdentifier(key);
    switch (condition.type ?? "equalTo") {
      case "equalTo":
        return `${column} = ?`;
      case "notEqualTo":
        return `${column} != ?`;
      case "lessThan":
        return `${column} < ?`;
      case "lessThanOrEqualTo":
        return `${column} <= ?`;
      case "greaterThan":
        return `${column} > ?`;
      case "greaterThanOrEqualTo":
        return `${column} >= ?`;
      case "whereIn":
      case "whereNotIn": {
        const values = condition.value;
        if (!Array.isArray(values) || values.length === 0) {
          throw new HttpError(400, `${condition.type} requires non-empty array.`);
        }
        return `${column} ${condition.type === "whereNotIn" ? "NOT " : ""}IN (${values.map(() => "?").join(", ")})`;
      }
      case "isNull":
        return `${column} IS NULL`;
      case "isNotNull":
        return `${column} IS NOT NULL`;
      case "like":
        return `${column} LIKE ?`;
      case "arrayContains":
      case "arrayContainsAny":
        throw new HttpError(400, `${condition.type} is not supported by Turso SQL yet.`);
      default:
        throw new HttpError(400, `Unsupported where condition: ${condition.type}`);
    }
  });
  return {
    sql: ` WHERE ${clauses.join(" AND ")}`,
    args: conditions.flatMap((condition) => {
      switch (condition.type ?? "equalTo") {
        case "whereIn":
        case "whereNotIn":
          return (condition.value as unknown[]).map(encodeSqlValue);
        case "isNull":
        case "isNotNull":
        case "arrayContains":
        case "arrayContainsAny":
          return [];
        case "like":
          return [encodeSqlValue(`%${String(condition.value ?? "").replace(/%/g, "\\%")}%`)];
        default:
          return [encodeSqlValue(condition.value)];
      }
    }),
  };
}

function buildOrderByClause(orderBy: TursoOrderCondition[]): string {
  if (orderBy.length === 0) {
    return "";
  }
  return ` ORDER BY ${orderBy.map((condition) => {
    const key = validateIdentifier(condition.key ?? "", "orderBy.key");
    return `${quoteIdentifier(key)} ${condition.descending ? "DESC" : "ASC"}`;
  }).join(", ")}`;
}

function requireValue(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value || Object.keys(value).length === 0) {
    throw new HttpError(400, "value is required.");
  }
  return value;
}
