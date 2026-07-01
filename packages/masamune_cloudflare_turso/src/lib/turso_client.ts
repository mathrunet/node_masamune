import { TursoDatabaseConnection, TursoWorkersOptions } from "./types";
import { HttpError, validateLogicalName } from "./request";

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
  const databaseName = `${options.databasePrefix ?? ""}${normalizedDatabase}`;
  const cached = connectionCache.get(databaseName);
  if (cached) {
    return cached;
  }
  const created = await ensurePlatformDatabase(databaseName, options);
  connectionCache.set(databaseName, created);
  return created;
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
  const existing = await fetch(
    `${baseUrl}/databases/${encodeURIComponent(databaseName)}`,
    {
      headers,
    },
  );
  if (existing.status === 404) {
    if (options.autoCreateDatabase === false) {
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
  const authToken = await createDatabaseToken(baseUrl, databaseName, headers);
  return {
    url,
    authToken,
  };
}

async function createDatabaseToken(
  baseUrl: string,
  databaseName: string,
  headers: Record<string, string>,
): Promise<string | undefined> {
  const response = await fetch(
    `${baseUrl}/databases/${encodeURIComponent(databaseName)}/auth/tokens`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    },
  );
  if (!response.ok) {
    return undefined;
  }
  const body = (await response.json()) as Record<string, unknown>;
  const token = body.jwt ?? body.token;
  return typeof token === "string" ? token : undefined;
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
    return hostname.startsWith("libsql://")
      ? hostname
      : `libsql://${hostname}`;
  }
  for (const item of Object.values(record)) {
    const found = findDatabaseUrl(item);
    if (found) {
      return found;
    }
  }
  return undefined;
}
