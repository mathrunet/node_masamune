import { HttpError, validateIdentifier } from "./request";
import { SqlValue, TidbClient } from "./tidb_client";

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
  client: TidbClient;
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
  columnTypes: readonly string[] = [],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (columns.length > 0 && isArrayLikeRow(row)) {
    for (const [index, column] of columns.entries()) {
      result[column] = decodeSqlValue(row[index], columnTypes[index]);
    }
    return result;
  }
  if (!row || typeof row !== "object") {
    return result;
  }
  const typeByColumn = new Map(
    columns.map((column, index) => [column, columnTypes[index]]),
  );
  for (const [key, value] of Object.entries(row)) {
    if (/^\d+$/.test(key)) {
      continue;
    }
    result[key] = decodeSqlValue(value, typeByColumn.get(key));
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

function decodeSqlValue(value: unknown, columnType?: string): unknown {
  if (typeof value === "bigint") {
    return toSafeNumberOrString(value.toString());
  }
  if (isBooleanColumnType(columnType)) {
    return toBoolean(value);
  }
  if (typeof value === "string" && isNumericColumnType(columnType)) {
    return toSafeNumberOrString(value);
  }
  return value;
}

function isBooleanColumnType(columnType?: string): boolean {
  return columnType !== undefined && /^TINYINT(?:\b|\()/i.test(columnType);
}

function isNumericColumnType(columnType?: string): boolean {
  return columnType !== undefined &&
    /^(?:SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|FLOAT|DOUBLE|DECIMAL|NUMERIC)(?:\b|\()/i.test(columnType);
}

function toBoolean(value: unknown): boolean | unknown {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "bigint") {
    return value !== 0n;
  }
  if (typeof value === "string") {
    return value !== "0" && value.toLowerCase() !== "false";
  }
  return value;
}

function toSafeNumberOrString(value: string): number | string {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) || Number.isFinite(parsed) && value.includes(".")
    ? parsed
    : value;
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
    return Number.isInteger(value) ? "BIGINT" : "DOUBLE";
  }
  if (typeof value === "boolean") {
    return "TINYINT";
  }
  if (typeof value === "bigint") {
    return "BIGINT";
  }
  return "TEXT";
}

async function createTableIfNotExists(
  client: TidbClient,
  table: string,
  columns: ColumnDefinition[],
): Promise<void> {
  const columnSql = columns
    .map((column) => `${quoteIdentifier(column.name)} ${column.type}`)
    .join(", ");
  const additionalColumns = columnSql.length > 0 ? `, ${columnSql}` : "";
  await client.execute(
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table)} (` +
    "id VARCHAR(255) PRIMARY KEY, " +
    "created_at BIGINT, " +
    "updated_at BIGINT" +
    additionalColumns +
    ")",
  );
}

async function createMigrationTableIfNotExists(client: TidbClient): Promise<void> {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS __masamune_schema_migrations (" +
    "id VARCHAR(255) PRIMARY KEY, " +
    "database_name TEXT, " +
    "table_name TEXT, " +
    "column_name TEXT, " +
    "column_type TEXT, " +
    "operation TEXT, " +
    "created_at BIGINT" +
    ")",
  );
}

async function addMissingColumns(
  client: TidbClient,
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
        sql: "INSERT IGNORE INTO __masamune_schema_migrations " +
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

async function getColumns(client: TidbClient, table: string): Promise<Map<string, string>> {
  const result = await client.execute(`SHOW COLUMNS FROM ${quoteIdentifier(table)}`);
  const columns = new Map<string, string>();
  for (const rawRow of result.rows) {
    const row = decodeRow(rawRow, result.columns, result.columnTypes ?? []);
    const name = row.Field ?? row.field;
    const type = row.Type ?? row.type;
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
  return `\`${validateIdentifier(identifier, "identifier").replace(/`/g, "``")}\``;
}
