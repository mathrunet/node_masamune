import { TursoDatabaseConnection, TursoWorkersOptions } from "./types";
import { HttpError, validateLogicalName } from "./request";
import { resolvePhysicalDatabaseName } from "./database_name";

interface TursoNativeConnection {
  execute(sql: string, args?: SqlValue[]): Promise<TursoResultSet>;
  transaction<T>(callback: () => Promise<T>): {
    concurrent(): Promise<T>;
  };
  close(): Promise<void>;
}

declare const require: (id: string) => {
  connect: (config: TursoDatabaseConnection) => TursoNativeConnection;
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
  concurrent<T>(callback: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type SqlValue =
  null | string | number | bigint | ArrayBuffer | boolean | Uint8Array | Date;

const connectionCache = new Map<string, TursoDatabaseConnection>();
const databaseEndpointCache = new Map<string, string>();
const connectionRefreshes = new Map<
  string,
  Promise<TursoDatabaseConnection>
>();
// In-flight cold resolutions, de-duplicated per database.
//
// Resolving a database that is not cached yet costs 2〜4 sequential round trips
// to the Turso Platform API. A client that loads several tables of the same
// database concurrently on a cold isolate would otherwise repeat that whole
// sequence once per caller, multiplying external latency by the number of
// concurrent loads. Callers arriving while a resolution is running share it.
const connectionResolutions = new Map<
  string,
  Promise<TursoDatabaseConnection>
>();
const endpointResolutions = new Map<
  string,
  Promise<Pick<TursoDatabaseConnection, "url" | "created">>
>();
// Guards a cache write issued by a resolution that started before a cache
// clear. Without this, a resolution already in flight would repopulate
// [connectionCache] immediately after [clearDatabaseConnectionCache] emptied
// it, resurrecting the connection the caller asked to discard.
const connectionCacheEpochs = new Map<string, number>();
const readyRetryDelaysMs = [250, 500, 1000, 2000, 4000, 8000];
const writeRetryDelaysMs = [10, 25, 50, 100, 250, 500];
const defaultServerTokenTtlSeconds = 3600;
const tokenRefreshWindowSeconds = 60;

export function createTursoClient(
  connection: TursoDatabaseConnection,
): TursoClient {
  const { connect } = require("@tursodatabase/serverless");
  const client = connect({
    url: connection.url,
    authToken: connection.authToken,
  });
  return {
    execute: (
      statement: string | { sql: string; args?: SqlValue[] },
      args?: SqlValue[],
    ) => typeof statement === "string"
      ? args === undefined
        ? client.execute(statement)
        : client.execute(statement, args)
      : statement.args === undefined
        ? client.execute(statement.sql)
        : client.execute(statement.sql, statement.args),
    concurrent: <T>(callback: () => Promise<T>) =>
      client.transaction(callback).concurrent(),
    close: () => client.close(),
  };
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
  // Share a single cold resolution with every concurrent caller. A joiner
  // receives the leader's `created` verdict unchanged, so a freshly created
  // database still instructs every caller to wait for readiness before use.
  const inFlight = connectionResolutions.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }
  const resolution = resolveColdDatabaseConnection(
    database,
    normalizedDatabase,
    cacheKey,
    options,
  );
  connectionResolutions.set(cacheKey, resolution);
  try {
    return await resolution;
  } finally {
    // Never retain a settled promise. A rejection therefore reaches every
    // joiner while a later retry starts a fresh resolution.
    if (connectionResolutions.get(cacheKey) === resolution) {
      connectionResolutions.delete(cacheKey);
    }
  }
}

async function resolveColdDatabaseConnection(
  database: string,
  normalizedDatabase: string,
  cacheKey: string,
  options: TursoWorkersOptions,
): Promise<TursoDatabaseConnection> {
  const epoch = connectionCacheEpoch(cacheKey);
  const endpoint = await resolveDatabaseEndpoint(normalizedDatabase, options);
  const organizationName = options.organization;
  const platformApiToken = options.platformApiToken;
  if (!organizationName || !platformApiToken) {
    throw new HttpError(
      500,
      "organization and platformApiToken are required to create Turso database tokens.",
    );
  }
  const databaseName = await resolvePhysicalDatabaseName(
    normalizedDatabase,
    options,
  );
  const baseUrl =
    `https://api.turso.tech/v1/organizations/${encodeURIComponent(organizationName)}`;
  const authToken = await createDatabaseToken(
    baseUrl,
    databaseName,
    {
      Authorization: `Bearer ${platformApiToken}`,
      "Content-Type": "application/json",
    },
    options.serverTokenTtlSeconds,
  );
  if (!authToken.token) {
    throw new HttpError(
      500,
      "Turso database auth token was not found in Platform API response.",
    );
  }
  const connection: TursoDatabaseConnection = {
    url: endpoint.url,
    authToken: authToken.token,
    authTokenExpiresAt: authToken.expiresAt,
    created: endpoint.created,
  };
  if (!endpoint.created && epoch === connectionCacheEpoch(cacheKey)) {
    cacheDatabaseConnection(database, options, connection);
  }
  return connection;
}

export async function resolveDatabaseEndpoint(
  database: string,
  options: TursoWorkersOptions,
): Promise<Pick<TursoDatabaseConnection, "url" | "created">> {
  const normalizedDatabase = validateLogicalName(database, "database");
  const cacheKey = databaseCacheKey(normalizedDatabase, options);
  const connected = connectionCache.get(cacheKey);
  if (connected) {
    return { url: connected.url, created: false };
  }
  const cachedUrl = databaseEndpointCache.get(cacheKey);
  if (cachedUrl) {
    return { url: cachedUrl, created: false };
  }
  // The token endpoint resolves here on every cold client request, so this is
  // the hot path for a client that loads several tables concurrently at boot.
  const inFlight = endpointResolutions.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }
  const resolution = resolveColdDatabaseEndpoint(
    normalizedDatabase,
    cacheKey,
    options,
  );
  endpointResolutions.set(cacheKey, resolution);
  try {
    return await resolution;
  } finally {
    if (endpointResolutions.get(cacheKey) === resolution) {
      endpointResolutions.delete(cacheKey);
    }
  }
}

async function resolveColdDatabaseEndpoint(
  normalizedDatabase: string,
  cacheKey: string,
  options: TursoWorkersOptions,
): Promise<Pick<TursoDatabaseConnection, "url" | "created">> {
  const databaseName = await resolvePhysicalDatabaseName(
    normalizedDatabase,
    options,
  );
  const endpoint = await ensurePlatformDatabase(databaseName, options);
  if (!endpoint.created) {
    databaseEndpointCache.set(cacheKey, endpoint.url);
  }
  return endpoint;
}

export function cacheDatabaseEndpoint(
  database: string,
  options: TursoWorkersOptions,
  url: string,
): void {
  const normalizedDatabase = validateLogicalName(database, "database");
  databaseEndpointCache.set(databaseCacheKey(normalizedDatabase, options), url);
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
  databaseEndpointCache.set(
    databaseCacheKey(normalizedDatabase, options),
    connection.url,
  );
}

export function clearDatabaseConnectionCache(
  database: string,
  options: TursoWorkersOptions,
): void {
  const normalizedDatabase = validateLogicalName(database, "database");
  const cacheKey = databaseCacheKey(normalizedDatabase, options);
  connectionCache.delete(cacheKey);
  // Abandon in-flight work so the next caller resolves a fresh connection, and
  // invalidate the epoch so a resolution or refresh that is already running
  // cannot write its result back over this clear. The endpoint cache is left
  // untouched on purpose: a transient error invalidates the token, not the URL.
  connectionResolutions.delete(cacheKey);
  connectionRefreshes.delete(cacheKey);
  connectionCacheEpochs.set(cacheKey, connectionCacheEpoch(cacheKey) + 1);
}

function connectionCacheEpoch(cacheKey: string): number {
  return connectionCacheEpochs.get(cacheKey) ?? 0;
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

export async function executeConcurrentWrite<T>(
  client: TursoClient,
  callback: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= writeRetryDelaysMs.length; attempt++) {
    try {
      return await client.concurrent(callback);
    } catch (error) {
      lastError = error;
      if (!isTursoWriteConflict(error) || attempt === writeRetryDelaysMs.length) {
        throw error;
      }
      await sleep(writeRetryDelaysMs[attempt]);
    }
  }
  throw lastError;
}

async function ensurePlatformDatabase(
  databaseName: string,
  options: TursoWorkersOptions,
): Promise<Pick<TursoDatabaseConnection, "url" | "created">> {
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
  let info: Record<string, unknown> | undefined;
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
        use_tursodb: true,
      }),
    });
    if (!response.ok) {
      const detail = await readPlatformError(response);
      throw new HttpError(
        500,
        `Failed to create TursoDB database: ${response.status}${detail}. ` +
          "Enable Concurrent Writes in Turso Dashboard Settings > General before creating databases.",
      );
    }
    created = true;
  } else if (!existing.ok) {
    throw new HttpError(
      500,
      `Failed to get Turso database: ${existing.status}`,
    );
  } else {
    info = (await existing.json()) as Record<string, unknown>;
  }

  if (!info) {
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
    info = (await infoResponse.json()) as Record<string, unknown>;
  }
  assertTursoDatabase(info, databaseName);
  const url = findDatabaseUrl(info);
  if (!url) {
    throw new HttpError(
      500,
      "Turso database URL was not found in Platform API response.",
    );
  }
  return {
    url,
    created,
  };
}

function assertTursoDatabase(
  info: Record<string, unknown>,
  databaseName: string,
): void {
  const databaseId = findDatabaseId(info);
  if (!databaseId) {
    throw new HttpError(
      500,
      `Could not verify that database is TursoDB: ${databaseName}. ` +
        "Refusing to fall back to a SQLite database.",
    );
  }
  if (!isTursoDatabaseId(databaseId)) {
    throw new HttpError(
      409,
      `Database is a legacy SQLite database, not TursoDB: ${databaseName}. ` +
        "Create a new database with `turso db create --tursodb <name>` and migrate the data.",
    );
  }
}

export function isTursoDatabaseId(databaseId: string): boolean {
  const hex = databaseId.replaceAll("-", "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    return false;
  }
  return Number.parseInt(hex.slice(10, 12), 16) === 0x10;
}

function findDatabaseId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const id = record.DbId ?? record.dbId ?? record.id ?? record.ID;
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  for (const item of Object.values(record)) {
    const found = findDatabaseId(item);
    if (found) {
      return found;
    }
  }
  return undefined;
}

async function readPlatformError(response: Response): Promise<string> {
  try {
    const body = await response.clone().text();
    return body.trim().length > 0 ? `: ${body.trim()}` : "";
  } catch (_) {
    return "";
  }
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
  const epoch = connectionCacheEpoch(cacheKey);
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
    if (epoch === connectionCacheEpoch(cacheKey)) {
      connectionCache.set(cacheKey, connection);
    }
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

export function isTursoWriteConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:SQLITE_BUSY|SQLITE_BUSY_SNAPSHOT|write conflict|transaction conflict|conflict at commit|database is locked)/i
    .test(message);
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
