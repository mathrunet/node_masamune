import { TidbDatabaseConnection, TidbWorkersOptions } from "./types";
import { HttpError, validateLogicalName } from "./request";

declare const require: (id: string) => {
  connect: (config: { url: string; fullResult?: boolean }) => {
    execute(
      sql: string,
      args?: SqlValue[],
      options?: { fullResult?: boolean },
    ): Promise<TidbServerlessResult>;
  };
};

export interface TidbResultSet {
  columns?: string[];
  columnTypes?: string[];
  rows: unknown[];
  rowsAffected?: number | null;
  lastInsertRowid?: string | null;
}

interface TidbServerlessResult {
  types: Record<string, string> | null;
  rows: unknown[] | null;
  rowCount: number | null;
  rowsAffected: number | null;
  lastInsertId: string | null;
}

export interface TidbClient {
  execute(
    statement: string | { sql: string; args?: SqlValue[] },
  ): Promise<TidbResultSet>;
  execute(sql: string, args?: SqlValue[]): Promise<TidbResultSet>;
}

export type SqlValue = null | string | number | bigint | boolean | Date;

const connectionCache = new Map<string, TidbDatabaseConnection>();
const readyRetryDelaysMs = [250, 500, 1000, 2000, 4000];

export function createTidbClient(
  connection: TidbDatabaseConnection,
): TidbClient {
  const { connect } = require("@tidbcloud/serverless");
  const client = connect({ url: connection.url, fullResult: true });
  return {
    async execute(
      statement: string | { sql: string; args?: SqlValue[] },
      args?: SqlValue[],
    ): Promise<TidbResultSet> {
      const sql = typeof statement === "string" ? statement : statement.sql;
      const sqlArgs = typeof statement === "string" ? args : statement.args;
      const result = await client.execute(sql, sqlArgs ?? [], {
        fullResult: true,
      });
      return normalizeResult(result);
    },
  };
}

export async function resolveDatabaseConnection(
  database: string,
  options: TidbWorkersOptions,
): Promise<TidbDatabaseConnection> {
  const normalizedDatabase = resolveDatabaseName(database, options);
  const cached = connectionCache.get(normalizedDatabase);
  if (cached) {
    return cached;
  }
  const connection = buildConnection(normalizedDatabase, options);
  await assertDatabaseExists(connection);
  cacheDatabaseConnection(normalizedDatabase, options, connection);
  return connection;
}

export function cacheDatabaseConnection(
  database: string,
  options: TidbWorkersOptions,
  connection: TidbDatabaseConnection,
): void {
  connectionCache.set(resolveDatabaseName(database, options), connection);
}

export function clearDatabaseConnectionCache(
  database: string,
  options: TidbWorkersOptions,
): void {
  connectionCache.delete(resolveDatabaseName(database, options));
}

export async function waitForDatabaseReady(client: TidbClient): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= readyRetryDelaysMs.length; attempt++) {
    try {
      await client.execute("SELECT 1");
      return;
    } catch (error) {
      lastError = error;
      if (
        !isTransientTidbError(error) ||
        attempt === readyRetryDelaysMs.length
      ) {
        throw error;
      }
      await sleep(readyRetryDelaysMs[attempt]);
    }
  }
  throw lastError;
}

export function resolveDefaultDatabase(options: TidbWorkersOptions): string {
  const url = resolveConnectionUrl(options);
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!database) {
    throw new HttpError(500, "TIDB_CONNECTION_URL must include database path.");
  }
  return validateLogicalName(database, "database");
}

function resolveDatabaseName(
  database: string,
  options: TidbWorkersOptions,
): string {
  const normalizedDatabase = validateLogicalName(database, "database");
  return `${options.databasePrefix ?? ""}${normalizedDatabase}`;
}

function buildConnection(
  databaseName: string,
  options: TidbWorkersOptions,
): TidbDatabaseConnection {
  const url = resolveConnectionUrl(options);
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  return {
    url: url.toString(),
    database: databaseName,
    host: url.hostname,
    port: url.port ? Number(url.port) : 4000,
  };
}

function resolveConnectionUrl(options: TidbWorkersOptions): URL {
  const connectionUrl = options.connectionUrl;
  if (!connectionUrl) {
    throw new HttpError(500, "TIDB_CONNECTION_URL is required.");
  }
  try {
    const url = new URL(connectionUrl);
    if (url.protocol !== "mysql:") {
      throw new Error("invalid protocol");
    }
    return url;
  } catch (_) {
    throw new HttpError(500, "TIDB_CONNECTION_URL must be a mysql:// URL.");
  }
}

async function assertDatabaseExists(
  connection: TidbDatabaseConnection,
): Promise<void> {
  try {
    const client = createTidbClient(connection);
    const result = await client.execute({
      sql: "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?",
      args: [connection.database],
    });
    if (result.rows.length === 0) {
      throw new HttpError(404, `Database was not found: ${connection.database}`);
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (isMissingDatabaseError(error)) {
      throw new HttpError(404, `Database was not found: ${connection.database}`);
    }
    throw error;
  }
}

function normalizeResult(result: TidbServerlessResult): TidbResultSet {
  const rows = result.rows ?? [];
  const columns = result.types
    ? Object.keys(result.types)
    : rows.length > 0 && rows[0] && typeof rows[0] === "object" && !Array.isArray(rows[0])
      ? Object.keys(rows[0] as Record<string, unknown>)
      : [];
  return {
    columns,
    columnTypes: result.types ? Object.values(result.types) : undefined,
    rows,
    rowsAffected: result.rowsAffected,
    lastInsertRowid: result.lastInsertId,
  };
}

export function isTransientTidbError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /(?:HTTP error! status|Tidb database|TiDB database|TiDB Serverless): (409|425|429|500|502|503|504)/i.test(
      message,
    ) ||
    /status=?(409|425|429|500|502|503|504)\b/.test(message) ||
    /Bad Gateway|Service Unavailable|Gateway Timeout/i.test(message)
  );
}

function isMissingDatabaseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Unknown database|database .* doesn't exist|schema .* doesn't exist/i.test(
    message,
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
