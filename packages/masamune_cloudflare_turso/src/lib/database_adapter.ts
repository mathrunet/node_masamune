import {
  DatabaseAdapterBase,
  DatabaseDocument,
  DatabaseIncrement,
  DatabaseQueryResult,
  DatabaseWhereCondition,
} from "@mathrunet/masamune_cloudflare";
import { HttpError, validateLogicalName } from "./request";
import {
  decodeRow,
  encodeSqlValue,
  ensureTableSchema,
  quoteIdentifier,
} from "./schema";
import {
  createTursoClient,
  resolveDatabaseConnection,
  SqlValue,
  TursoClient,
} from "./turso_client";
import { TursoWorkersOptions } from "./types";

declare const process: { env?: Record<string, string | undefined> } | undefined;

const reservedColumns = new Set([
  "id",
  "parent_id",
  "created_at",
  "updated_at",
]);
const atMarkColumnPrefix = "mf_at_";

/**
 * [DatabaseAdapterBase] implementation for Turso.
 *
 * Maps `database/{database}/{collection}/{document}` paths to Turso databases
 * and SQL tables. Collection names after the database prefix are joined with
 * `__` to form the table name, and document IDs are stored in the `id` /
 * `parent_id` columns.
 *
 * e.g. `database/{uid}/user/{uid}` -> database `{uid}`, table `user`
 * (id = uid), `database/{uid}/user/{uid}/transaction/{tid}` -> database
 * `{uid}`, table `user__transaction` (id = tid, parent_id = uid)
 *
 * Turso用の[DatabaseAdapterBase]の実装。
 *
 * `database/{database}/{collection}/{document}` 形式のパスをTursoデータベースと
 * SQLテーブルにマッピングします。データベースプレフィックスより後のコレクション名は
 * `__`で連結され、ドキュメントIDは`id`/`parent_id`カラムに保存されます。
 *
 * 例: `database/{uid}/user/{uid}` -> DB `{uid}`、テーブル`user`（id = uid）、
 * `database/{uid}/user/{uid}/transaction/{tid}` -> DB `{uid}`、
 * テーブル`user__transaction`（id = tid、parent_id = uid）
 */
export class TursoDatabaseAdapter extends DatabaseAdapterBase {
  /**
   * [DatabaseAdapterBase] implementation for Turso.
   *
   * Turso用の[DatabaseAdapterBase]の実装。
   *
   * @param config.options
   * Turso connection options (organization, group, platformApiToken, etc.).
   *
   * Tursoの接続オプション（organization、group、platformApiTokenなど）。
   *
   * @param config.client
   * Directly injected Turso client. Used for testing only and shared by every
   * database path handled by this adapter.
   *
   * 直接注入するTursoクライアント。テスト時のみ使用し、このアダプターが処理する
   * すべてのデータベースパスで共有します。
   */
  constructor({
    options,
    client,
  }: {
    options?: TursoWorkersOptions | undefined;
    client?: TursoClient | undefined;
  } = {}) {
    super();
    this.options = options ?? {};
    this.injectedClient = client ?? null;
  }

  /**
   * Turso connection options.
   *
   * Tursoの接続オプション。
   */
  readonly options: TursoWorkersOptions;

  private readonly injectedClient: TursoClient | null;

  private async client(database: string): Promise<TursoClient> {
    if (this.injectedClient) {
      return this.injectedClient;
    }
    const connection = await resolveDatabaseConnection(
      database,
      this.resolveOptions(),
    );
    return createTursoClient(connection);
  }

  // 接続時にオプションを解決します。オプションで指定されていない項目は
  // `process.env`（nodejs_compatで注入されるWorkersシークレット）から補完します。
  private resolveOptions(): TursoWorkersOptions {
    const env = typeof process !== "undefined" ? (process.env ?? {}) : {};
    return {
      ...this.options,
      organization: firstNonEmptyValue(
        this.options.organization,
        env["TURSO_ORGANIZATION"],
      ),
      group: firstNonEmptyValue(this.options.group, env["TURSO_GROUP"]),
      platformApiToken: firstNonEmptyValue(
        this.options.platformApiToken,
        env["TURSO_PLATFORM_API_TOKEN"],
      ),
    };
  }

  async getDocument(path: string): Promise<DatabaseDocument | null> {
    const { database, table, id, parentId } = parseDocumentPath(path);
    const client = await this.client(database);
    let result;
    try {
      result = await client.execute({
        sql: `SELECT * FROM ${quoteIdentifier(table)} WHERE id = ? AND parent_id = ? LIMIT 1`,
        args: [id, parentId],
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        return null;
      }
      throw error;
    }
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      path: path,
      data: decodeDocumentData(decodeRow(row, result.columns)),
    };
  }

  async saveDocument(
    path: string,
    data: { [key: string]: any },
    options?: { merge?: boolean | undefined },
  ): Promise<void> {
    const { database, table, id, parentId } = parseDocumentPath(path);
    const merge = options?.merge ?? false;
    const client = await this.client(database);
    const existing = await this.loadExistingRow(client, table, id, parentId);
    const now = Date.now();
    const row: Record<string, unknown> =
      merge && existing ? { ...existing } : {};
    for (const [key, value] of Object.entries(data)) {
      const column = encodeColumnName(key);
      if (value instanceof DatabaseIncrement) {
        const current = row[column] ?? existing?.[column];
        const base =
          typeof current === "number" ? current : Number(current ?? 0);
        row[column] = (Number.isFinite(base) ? base : 0) + value.value;
      } else {
        row[column] = value;
      }
    }
    delete row["id"];
    delete row["parent_id"];
    const createdAt = existing?.["created_at"];
    row["id"] = id;
    row["parent_id"] = parentId;
    row["created_at"] = typeof createdAt === "number" ? createdAt : now;
    row["updated_at"] = now;
    await ensureTableSchema({
      client,
      table,
      value: row,
      autoCreateTable: this.options.autoCreateTable ?? true,
      autoMigrateAddColumns: this.options.autoMigrateAddColumns ?? true,
    });
    const keys = Object.keys(row);
    const placeholders = keys.map(() => "?").join(", ");
    await client.execute({
      sql:
        `INSERT OR REPLACE INTO ${quoteIdentifier(table)} ` +
        `(${keys.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`,
      args: keys.map((key) => encodeSqlValue(row[key])),
    });
  }

  async query(
    collectionPath: string,
    options?: {
      wheres?: DatabaseWhereCondition[] | undefined;
      limit?: number | undefined;
      cursor?: string | null | undefined;
    },
  ): Promise<DatabaseQueryResult> {
    const { database, table, parentId } = parseCollectionPath(collectionPath);
    const client = await this.client(database);
    const clauses: string[] = ["parent_id = ?"];
    const args: SqlValue[] = [parentId];
    for (const where of options?.wheres ?? []) {
      const built = buildWhereCondition(where);
      clauses.push(built.sql);
      args.push(...built.args);
    }
    if (options?.cursor) {
      clauses.push("id > ?");
      args.push(options.cursor);
    }
    const limit =
      options?.limit && options.limit > 0 ? ` LIMIT ${options.limit}` : "";
    let result;
    try {
      result = await client.execute({
        sql: `SELECT * FROM ${quoteIdentifier(table)} WHERE ${clauses.join(" AND ")} ORDER BY id ASC${limit}`,
        args,
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        return { docs: [], cursor: null };
      }
      throw error;
    }
    const docs: DatabaseDocument[] = result.rows.map((row) => {
      const decoded = decodeRow(row, result.columns);
      const id = String(decoded["id"] ?? "");
      return {
        path: `${collectionPath}/${id}`,
        data: decodeDocumentData(decoded),
      };
    });
    const cursor =
      options?.limit && docs.length >= options.limit
        ? String(docs[docs.length - 1].path.split("/").pop() ?? "")
        : null;
    return { docs, cursor };
  }

  private async loadExistingRow(
    client: TursoClient,
    table: string,
    id: string,
    parentId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const result = await client.execute({
        sql: `SELECT * FROM ${quoteIdentifier(table)} WHERE id = ? AND parent_id = ? LIMIT 1`,
        args: [id, parentId],
      });
      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }
      return decodeRow(row, result.columns);
    } catch (error) {
      if (isMissingTableError(error)) {
        return null;
      }
      throw error;
    }
  }
}

/**
 * Parse a document path into a table name, document ID and parent document ID.
 *
 * ドキュメントパスをテーブル名、ドキュメントID、親ドキュメントIDにパースします。
 */
export function parseDocumentPath(path: string): {
  database: string;
  table: string;
  id: string;
  parentId: string;
} {
  const { database, segments } = splitDatabasePath(path, "document");
  if (segments.length < 2 || segments.length % 2 !== 0) {
    throw new HttpError(400, `Invalid document path: ${path}`);
  }
  const collections: string[] = [];
  const documentIds: string[] = [];
  for (let i = 0; i < segments.length; i += 2) {
    collections.push(segments[i]);
    documentIds.push(segments[i + 1]);
  }
  return {
    database,
    table: collections.join("__"),
    id: documentIds[documentIds.length - 1],
    parentId: documentIds.length > 1 ? documentIds[documentIds.length - 2] : "",
  };
}

/**
 * Parse a collection path into a table name and parent document ID.
 *
 * コレクションパスをテーブル名と親ドキュメントIDにパースします。
 */
export function parseCollectionPath(path: string): {
  database: string;
  table: string;
  parentId: string;
} {
  const { database, segments } = splitDatabasePath(path, "collection");
  if (segments.length < 1 || segments.length % 2 !== 1) {
    throw new HttpError(400, `Invalid collection path: ${path}`);
  }
  const collections: string[] = [];
  let parentId = "";
  for (let i = 0; i < segments.length; i += 2) {
    collections.push(segments[i]);
    if (i > 0) {
      parentId = segments[i - 1];
    }
  }
  return {
    database,
    table: collections.join("__"),
    parentId,
  };
}

/**
 * Encode a field key into a column name.
 *
 * Keys starting with `@` (e.g. `@time`, `@uid`) are prefixed with `mf_at_` because they cannot be used as SQL identifiers.
 *
 * フィールドキーをカラム名にエンコードします。
 *
 * `@`で始まるキー（例: `@time`、`@uid`）はSQL識別子として使用できないため、`mf_at_`のプレフィックスが付けられます。
 */
export function encodeColumnName(key: string): string {
  if (key.startsWith("@")) {
    return `${atMarkColumnPrefix}${key.substring(1)}`;
  }
  return key;
}

/**
 * Decode a column name back into a field key.
 *
 * カラム名をフィールドキーにデコードします。
 */
export function decodeColumnName(column: string): string {
  if (column.startsWith(atMarkColumnPrefix)) {
    return `@${column.substring(atMarkColumnPrefix.length)}`;
  }
  return column;
}

function firstNonEmptyValue(
  ...values: (string | undefined)[]
): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

function splitPath(path: string): string[] {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function splitDatabasePath(
  path: string,
  kind: "document" | "collection",
): { database: string; segments: string[] } {
  const segments = splitPath(path);
  if (segments.length < 3 || segments[0] !== "database") {
    throw new HttpError(400, `Invalid ${kind} path: ${path}`);
  }
  const database = validateLogicalName(segments[1], "database");
  return {
    database,
    segments: segments.slice(2),
  };
}

function decodeDocumentData(row: Record<string, unknown>): {
  [key: string]: any;
} {
  const data: { [key: string]: any } = {};
  for (const [column, value] of Object.entries(row)) {
    if (reservedColumns.has(column)) {
      continue;
    }
    data[decodeColumnName(column)] = decodeStoredValue(value);
  }
  return data;
}

function decodeStoredValue(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
  }
  return value;
}

function buildWhereCondition(condition: DatabaseWhereCondition): {
  sql: string;
  args: SqlValue[];
} {
  const column = quoteIdentifier(encodeColumnName(condition.key));
  switch (condition.type) {
    case "equalTo":
      return { sql: `${column} = ?`, args: [encodeSqlValue(condition.value)] };
    case "notEqualTo":
      return { sql: `${column} != ?`, args: [encodeSqlValue(condition.value)] };
    case "lessThan":
      return { sql: `${column} < ?`, args: [encodeSqlValue(condition.value)] };
    case "lessThanOrEqualTo":
      return { sql: `${column} <= ?`, args: [encodeSqlValue(condition.value)] };
    case "greaterThan":
      return { sql: `${column} > ?`, args: [encodeSqlValue(condition.value)] };
    case "greaterThanOrEqualTo":
      return { sql: `${column} >= ?`, args: [encodeSqlValue(condition.value)] };
    case "whereIn":
    case "whereNotIn": {
      const values = condition.value;
      if (!Array.isArray(values) || values.length === 0) {
        throw new HttpError(400, `${condition.type} requires non-empty array.`);
      }
      return {
        sql: `${column} ${condition.type === "whereNotIn" ? "NOT " : ""}IN (${values.map(() => "?").join(", ")})`,
        args: values.map(encodeSqlValue),
      };
    }
    case "isNull":
      return { sql: `${column} IS NULL`, args: [] };
    case "isNotNull":
      return { sql: `${column} IS NOT NULL`, args: [] };
    case "arrayContains":
    case "arrayContainsAny":
      throw new HttpError(
        400,
        `${condition.type} is not supported by Turso SQL yet.`,
      );
    default:
      throw new HttpError(
        400,
        `Unsupported where condition: ${condition.type}`,
      );
  }
}

function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("no such table");
}
