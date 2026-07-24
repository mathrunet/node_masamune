import { TursoDatabaseConnection, TursoWorkersOptions } from "./types";
import { HttpError, validateLogicalName } from "./request";
import { resolvePhysicalDatabaseName } from "./database_name";

declare const require: (id: string) => {
  createClient: (config: TursoDatabaseConnection) => TursoClient;
};
declare const process: { env?: Record<string, string | undefined> } | undefined;

export interface TursoResultSet {
  columns?: string[];
  columnTypes?: string[];
  rows: unknown[];
  rowsAffected?: number;
  lastInsertRowid?: bigint | undefined;
}

export interface TursoClient {
  execute(
    statement: string | { sql: string; args?: SqlValue[] },
  ): Promise<TursoResultSet>;
  execute(sql: string, args?: SqlValue[]): Promise<TursoResultSet>;
}

export type SqlValue =
  null | string | number | bigint | ArrayBuffer | boolean | Uint8Array | Date;

const connectionCache = new Map<string, TursoDatabaseConnection>();
const connectionRefreshes = new Map<
  string,
  Promise<TursoDatabaseConnection>
>();
const readyRetryDelaysMs = [250, 500, 1000, 2000, 4000, 8000];
const defaultServerTokenTtlSeconds = 3600;
const tokenRefreshWindowSeconds = 60;

export function createTursoClient(
  connection: TursoDatabaseConnection,
): TursoClient {
  const { createClient } = require("@tursodatabase/serverless/compat");
  return createClient({
    url: connection.url,
    authToken: connection.authToken,
  });
}

export async function resolveDatabaseConnection(
  database: string,
  options: TursoWorkersOptions,
): Promise<TursoDatabaseConnection> {
  const normalizedDatabase = validateLogicalName(database, "database");
  const cacheKey = databaseCacheKey(normalizedDatabase, options);
  const cached = connectionCache.get(cacheKey);
  if (cached) {
    if (shouldRefreshAuthToken(cached)) {
      return refreshDatabaseConnection(
        normalizedDatabase,
        cacheKey,
        cached,
        options,
      );
    }
    return {
      ...cached,
      created: false,
    };
  }
  const databaseName = await resolvePhysicalDatabaseName(
    normalizedDatabase,
    options,
  );
  const created = await ensurePlatformDatabase(databaseName, options);
  if (!created.created) {
    cacheDatabaseConnection(database, options, created);
  }
  return created;
}

export function cacheDatabaseConnection(
  database: string,
  options: TursoWorkersOptions,
  connection: TursoDatabaseConnection,
): void {
  const normalizedDatabase = validateLogicalName(database, "database");
  connectionCache.set(databaseCacheKey(normalizedDatabase, options), {
    url: connection.url,
    authToken: connection.authToken,
    authTokenExpiresAt: connection.authTokenExpiresAt,
    created: false,
  });
}

export function clearDatabaseConnectionCache(
  database: string,
  options: TursoWorkersOptions,
): void {
  const normalizedDatabase = validateLogicalName(database, "database");
  connectionCache.delete(databaseCacheKey(normalizedDatabase, options));
}

function databaseCacheKey(
  database: string,
  options: TursoWorkersOptions,
): string {
  return `${options.databasePrefix ?? ""}\u0000${database}`;
}

export async function waitForDatabaseReady(client: TursoClient): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= readyRetryDelaysMs.length; attempt++) {
    try {
      await client.execute("SELECT 1");
      return;
    } catch (error) {
      lastError = error;
      if (
        !isTransientTursoError(error) ||
        attempt === readyRetryDelaysMs.length
      ) {
        throw error;
      }
      await sleep(readyRetryDelaysMs[attempt]);
    }
  }
  throw lastError;
}

async function ensurePlatformDatabase(
  databaseName: string,
  options: TursoWorkersOptions,
): Promise<TursoDatabaseConnection> {
  const organizationName = options.organization;
  const platformApiToken = options.platformApiToken;
  if (!organizationName || !platformApiToken) {
    throw new HttpError(
      500,
      "organization and platformApiToken are required to create Turso databases.",
    );
  }
  const groupName = resolveDatabaseGroupName(options);
  const baseUrl = `https://api.turso.tech/v1/organizations/${encodeURIComponent(organizationName)}`;
  const headers = {
    Authorization: `Bearer ${platformApiToken}`,
    "Content-Type": "application/json",
  };
  let created = false;
  const existing = await fetch(
    `${baseUrl}/databases/${encodeURIComponent(databaseName)}`,
    {
      headers,
    },
  );
  if (existing.status === 404) {
    if (options.autoCreateDatabase !== true) {
      throw new HttpError(404, `Database was not found: ${databaseName}`);
    }
    const response = await fetch(`${baseUrl}/databases`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: databaseName,
        group: groupName,
      }),
    });
    if (!response.ok) {
      throw new HttpError(
        500,
        `Failed to create Turso database: ${response.status}`,
      );
    }
    created = true;
  } else if (!existing.ok) {
    throw new HttpError(
      500,
      `Failed to get Turso database: ${existing.status}`,
    );
  }

  const infoResponse = await fetch(
    `${baseUrl}/databases/${encodeURIComponent(databaseName)}`,
    {
      headers,
    },
  );
  if (!infoResponse.ok) {
    throw new HttpError(
      500,
      `Failed to resolve Turso database: ${infoResponse.status}`,
    );
  }
  const info = (await infoResponse.json()) as Record<string, unknown>;
  const url = findDatabaseUrl(info);
  if (!url) {
    throw new HttpError(
      500,
      "Turso database URL was not found in Platform API response.",
    );
  }
  const authToken = await createDatabaseToken(
    baseUrl,
    databaseName,
    headers,
    options.serverTokenTtlSeconds,
  );
  if (!authToken.token) {
    throw new HttpError(
      500,
      "Turso database auth token was not found in Platform API response.",
    );
  }
  return {
    url,
    authToken: authToken.token,
    authTokenExpiresAt: authToken.expiresAt,
    created,
  };
}

async function createDatabaseToken(
  baseUrl: string,
  databaseName: string,
  headers: Record<string, string>,
  ttlSeconds = defaultServerTokenTtlSeconds,
): Promise<{ token: string | undefined; expiresAt: number }> {
  const normalizedTtl = normalizeServerTokenTtl(ttlSeconds);
  const response = await fetch(
    `${baseUrl}/databases/${encodeURIComponent(databaseName)}/auth/tokens` +
      `?expiration=${normalizedTtl}s&authorization=full-access`,
    {
      method: "POST",
      headers,
    },
  );
  if (!response.ok) {
    throw new HttpError(
      500,
      `Failed to create Turso database token: ${response.status}`,
    );
  }
  const body = (await response.json()) as Record<string, unknown>;
  const token = body.jwt ?? body.token;
  return {
    token: typeof token === "string" ? token : undefined,
    expiresAt: Math.floor(Date.now() / 1000) + normalizedTtl,
  };
}

async function refreshDatabaseConnection(
  database: string,
  cacheKey: string,
  cached: TursoDatabaseConnection,
  options: TursoWorkersOptions,
): Promise<TursoDatabaseConnection> {
  const refreshing = connectionRefreshes.get(cacheKey);
  if (refreshing) {
    return refreshing;
  }
  const refresh = (async () => {
    const organizationName = options.organization;
    const platformApiToken = options.platformApiToken;
    if (!organizationName || !platformApiToken) {
      throw new HttpError(
        500,
        "organization and platformApiToken are required to refresh Turso database tokens.",
      );
    }
    const databaseName = await resolvePhysicalDatabaseName(database, options);
    const baseUrl =
      `https://api.turso.tech/v1/organizations/${encodeURIComponent(organizationName)}`;
    const token = await createDatabaseToken(
      baseUrl,
      databaseName,
      {
        Authorization: `Bearer ${platformApiToken}`,
        "Content-Type": "application/json",
      },
      options.serverTokenTtlSeconds,
    );
    if (!token.token) {
      throw new HttpError(
        500,
        "Turso database auth token was not found in Platform API response.",
      );
    }
    const connection: TursoDatabaseConnection = {
      url: cached.url,
      authToken: token.token,
      authTokenExpiresAt: token.expiresAt,
      created: false,
    };
    connectionCache.set(cacheKey, connection);
    return connection;
  })();
  connectionRefreshes.set(cacheKey, refresh);
  try {
    return await refresh;
  } finally {
    if (connectionRefreshes.get(cacheKey) === refresh) {
      connectionRefreshes.delete(cacheKey);
    }
  }
}

function shouldRefreshAuthToken(
  connection: TursoDatabaseConnection,
): boolean {
  return (
    connection.authTokenExpiresAt === undefined ||
    connection.authTokenExpiresAt - Math.floor(Date.now() / 1000) <=
      tokenRefreshWindowSeconds
  );
}

function normalizeServerTokenTtl(ttlSeconds: number | undefined): number {
  if (
    ttlSeconds === undefined ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds <= tokenRefreshWindowSeconds
  ) {
    return defaultServerTokenTtlSeconds;
  }
  return ttlSeconds;
}

function resolveDatabaseGroupName(options: TursoWorkersOptions): string {
  const groupName = firstNonEmpty(
    options.group,
    typeof process !== "undefined" ? process.env?.TURSO_GROUP : undefined,
  );
  if (!groupName) {
    throw new HttpError(
      500,
      "group or TURSO_GROUP is required to create Turso databases.",
    );
  }
  return groupName;
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

export function isTransientTursoError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /(?:HTTP error! status|Turso database|Turso database token|Turso database:): (404|409|425|429|500|502|503|504)/.test(
      message,
    ) ||
    /status=?(404|409|425|429|500|502|503|504)\b/.test(message) ||
    /no route configured for host/i.test(message)
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function findDatabaseUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^libsql:\/\//.test(value)) {
    return value;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const hostname = record.Hostname ?? record.hostname;
  if (typeof hostname === "string" && hostname.length > 0) {
    return hostname.startsWith("libsql://") ? hostname : `libsql://${hostname}`;
  }
  for (const item of Object.values(record)) {
    const found = findDatabaseUrl(item);
    if (found) {
      return found;
    }
  }
  return undefined;
}
