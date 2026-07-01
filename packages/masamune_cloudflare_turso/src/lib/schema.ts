import { HttpError, validateIdentifier } from "./request";
import { SqlValue, TursoClient } from "./turso_client";

export interface ColumnDefinition {
  name: string;
  type: string;
}

const reservedFields = new Set(["id", "created_at", "updated_at"]);

export async function ensureTableSchema({
  client,
  table,
  value,
  autoCreateTable,
  autoMigrateAddColumns,
}: {
  client: TursoClient;
  table: string;
  value: Record<string, unknown>;
  autoCreateTable: boolean;
  autoMigrateAddColumns: boolean;
}): Promise<void> {
  const tableName = validateIdentifier(table, "table");
  const columns = buildColumnDefinitions(value);
  if (autoCreateTable) {
    await createTableIfNotExists(client, tableName, columns);
    await createMigrationTableIfNotExists(client);
  }
  if (autoMigrateAddColumns) {
    await addMissingColumns(client, tableName, columns);
  }
}

export function encodeSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return JSON.stringify(value);
}

export function decodeRow(
  row: unknown,
  columns: readonly string[] = [],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (columns.length > 0 && isArrayLikeRow(row)) {
    for (const [index, column] of columns.entries()) {
      result[column] = decodeSqlValue(row[index]);
    }
    return result;
  }
  if (!row || typeof row !== "object") {
    return result;
  }
  for (const [key, value] of Object.entries(row)) {
    if (/^\d+$/.test(key)) {
      continue;
    }
    result[key] = decodeSqlValue(value);
  }
  return result;
}

function isArrayLikeRow(row: unknown): row is { [index: number]: unknown } {
  if (Array.isArray(row)) {
    return true;
  }
  if (!row || typeof row !== "object") {
    return false;
  }
  const record = row as Record<string, unknown>;
  return "0" in record || typeof record.length === "number";
}

function decodeSqlValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

function buildColumnDefinitions(value: Record<string, unknown>): ColumnDefinition[] {
  return Object.entries(value)
    .filter(([key]) => !reservedFields.has(key))
    .map(([key, item]) => ({
      name: validateIdentifier(key, "column"),
      type: inferSqlType(item),
    }));
}

function inferSqlType(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? "INTEGER" : "REAL";
  }
  if (typeof value === "boolean") {
    return "INTEGER";
  }
  if (typeof value === "bigint") {
    return "INTEGER";
  }
  return "TEXT";
}

async function createTableIfNotExists(
  client: TursoClient,
  table: string,
  columns: ColumnDefinition[],
): Promise<void> {
  const columnSql = columns
    .map((column) => `${quoteIdentifier(column.name)} ${column.type}`)
    .join(", ");
  const additionalColumns = columnSql.length > 0 ? `, ${columnSql}` : "";
  await client.execute(
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table)} (` +
    "id TEXT PRIMARY KEY, " +
    "created_at INTEGER, " +
    "updated_at INTEGER" +
    additionalColumns +
    ")",
  );
}

async function createMigrationTableIfNotExists(client: TursoClient): Promise<void> {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS __masamune_schema_migrations (" +
    "id TEXT PRIMARY KEY, " +
    "database_name TEXT, " +
    "table_name TEXT, " +
    "column_name TEXT, " +
    "column_type TEXT, " +
    "operation TEXT, " +
    "created_at INTEGER" +
    ")",
  );
}

async function addMissingColumns(
  client: TursoClient,
  table: string,
  columns: ColumnDefinition[],
): Promise<void> {
  const existing = await getColumns(client, table);
  for (const column of columns) {
    const current = existing.get(column.name);
    if (!current) {
      await client.execute(
        `ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column.name)} ${column.type}`,
      );
      await client.execute({
        sql: "INSERT OR IGNORE INTO __masamune_schema_migrations " +
          "(id, database_name, table_name, column_name, column_type, operation, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [
          `${table}:${column.name}`,
          "",
          table,
          column.name,
          column.type,
          "add_column",
          Date.now(),
        ],
      });
      continue;
    }
    if (!isCompatibleType(current, column.type)) {
      throw new HttpError(400, `Column type mismatch: ${column.name}`);
    }
  }
}

async function getColumns(client: TursoClient, table: string): Promise<Map<string, string>> {
  const result = await client.execute(`PRAGMA table_info(${quoteIdentifier(table)})`);
  const columns = new Map<string, string>();
  for (const rawRow of result.rows) {
    const row = decodeRow(rawRow, result.columns);
    const name = row.name;
    const type = row.type;
    if (typeof name === "string" && typeof type === "string") {
      columns.set(name, type.toUpperCase());
    }
  }
  return columns;
}

function isCompatibleType(existing: string, next: string): boolean {
  if (existing === next) {
    return true;
  }
  if (existing === "TEXT") {
    return true;
  }
  return false;
}

export function quoteIdentifier(identifier: string): string {
  return `"${validateIdentifier(identifier, "identifier").replace(/"/g, "\"\"")}"`;
}
