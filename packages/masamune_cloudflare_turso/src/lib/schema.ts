import { HttpError, validateIdentifier } from "./request";
import { SqlValue, TursoClient } from "./turso_client";
import type { TursoSchemaManifest } from "./types";

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
  declaredColumns,
  schemaVersion = "runtime",
}: {
  client: TursoClient;
  table: string;
  value: Record<string, unknown>;
  autoCreateTable: boolean;
  autoMigrateAddColumns: boolean;
  declaredColumns?: readonly ColumnDefinition[] | undefined;
  schemaVersion?: string | undefined;
}): Promise<void> {
  const tableName = validateIdentifier(table, "table");
  const columns = buildColumnDefinitions(value, declaredColumns);
  if (autoCreateTable) {
    await createTableIfNotExists(client, tableName, columns);
  }
  if (autoMigrateAddColumns) {
    await createMigrationTableIfNotExists(client);
    await addMissingColumns(client, tableName, columns, schemaVersion);
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

function buildColumnDefinitions(
  value: Record<string, unknown>,
  declaredColumns: readonly ColumnDefinition[] = [],
): ColumnDefinition[] {
  const columns = new Map<string, ColumnDefinition>();
  for (const column of declaredColumns) {
    const name = validateIdentifier(column.name, "column");
    if (reservedFields.has(name)) {
      continue;
    }
    columns.set(name, { name, type: normalizeDeclaredType(column.type) });
  }
  for (const [key, item] of Object.entries(value)) {
    if (reservedFields.has(key) || columns.has(key)) {
      continue;
    }
    columns.set(key, {
      name: validateIdentifier(key, "column"),
      type: inferSqlType(item, key),
    });
  }
  return [...columns.values()];
}

function normalizeDeclaredType(type: string): string {
  const normalized = type.trim().toUpperCase();
  if (/^(?:TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)(?:\b|\()/i.test(normalized)) {
    return "INTEGER";
  }
  if (/^(?:FLOAT|DOUBLE|REAL|DECIMAL|NUMERIC)(?:\b|\()/i.test(normalized)) {
    return "REAL";
  }
  if (/^(?:TEXT|CHAR|VARCHAR|JSON)(?:\b|\()/i.test(normalized)) {
    return "TEXT";
  }
  if (normalized === "BLOB") {
    return normalized;
  }
  throw new HttpError(400, `Unsupported Turso schema type: ${type}`);
}

function inferSqlType(value: unknown, column: string): string {
  if (value === null || value === undefined) {
    throw new HttpError(
      400,
      `Cannot infer SQL type for column ${column} from null. Provide a schema manifest.`,
    );
  }
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
  schemaVersion: string,
): Promise<void> {
  const existing = await getColumns(client, table);
  for (const column of columns) {
    const current = existing.get(column.name);
    if (!current) {
      try {
        await client.execute(
          `ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column.name)} ${column.type}`,
        );
      } catch (error) {
        if (!isDuplicateColumnError(error)) {
          throw error;
        }
        const latest = await getColumns(client, table);
        const migrated = latest.get(column.name);
        if (!migrated || !isCompatibleType(migrated, column.type)) {
          throw error;
        }
      }
      await client.execute({
        sql: "INSERT OR IGNORE INTO __masamune_schema_migrations " +
          "(id, database_name, table_name, column_name, column_type, operation, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [
          `${schemaVersion}:${table}:${column.name}`,
          "",
          table,
          column.name,
          column.type,
          `add_column@${schemaVersion}`,
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

export function resolveTursoSchema(
  manifest: TursoSchemaManifest | undefined,
  database: string,
  table: string,
): { columns: ColumnDefinition[]; version: string } | undefined {
  if (!manifest) {
    return undefined;
  }
  const match = Object.values(manifest.tables).find((item) =>
    item.table === table && matchesDatabase(item.database, database)
  );
  return match
    ? { columns: match.columns.map((column) => ({ ...column })), version: manifest.version }
    : undefined;
}

function matchesDatabase(pattern: string, database: string): boolean {
  if (pattern === "*") {
    return true;
  }
  const source = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "[^/]+");
  return new RegExp(`^${source}$`).test(database);
}

function isDuplicateColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate column(?: name)?/i.test(message);
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
