import { TursoWorkersOptions } from "./types";
import type { TursoDatabaseTokenAuthorization } from "./rules";

export interface IssuedToken {
  token: string;
  expiresAt: number;
}

export async function issueDatabaseToken({
  database,
  authorization,
  ttlSeconds,
  options,
}: {
  database: string;
  authorization: TursoDatabaseTokenAuthorization;
  ttlSeconds?: number | undefined;
  options: TursoWorkersOptions;
}): Promise<IssuedToken> {
  const now = Math.floor(Date.now() / 1000);
  const maxTtl = options.maxTtlSeconds ?? 3600;
  const ttl = Math.max(1, Math.min(ttlSeconds ?? 600, maxTtl));
  const expiresAt = now + ttl;
  const jwt = await issuePlatformDatabaseToken({
    database,
    ttlSeconds: ttl,
    authorization,
    options,
  });
  return {
    token: jwt,
    expiresAt,
  };
}

async function issuePlatformDatabaseToken({
  database,
  ttlSeconds,
  authorization,
  options,
}: {
  database: string;
  ttlSeconds: number;
  authorization: TursoDatabaseTokenAuthorization;
  options: TursoWorkersOptions;
}): Promise<string> {
  const databaseName = `${options.databaseNamePrefix ?? ""}${database}`;
  const organizationName = options.organizationName;
  const platformApiToken = options.platformApiToken;
  if (!organizationName || !platformApiToken) {
    throw new Error("organizationName and platformApiToken are required.");
  }
  const response = await fetch(
    "https://api.turso.tech/v1/organizations/" +
      `${encodeURIComponent(organizationName)}/databases/${encodeURIComponent(databaseName)}` +
      `/auth/tokens?expiration=${ttlSeconds}s&authorization=${authorization}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${platformApiToken}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to issue Turso token: ${response.status}`);
  }
  const body = (await response.json()) as { jwt?: string };
  if (!body.jwt) {
    throw new Error("Turso token response did not include jwt.");
  }
  return body.jwt;
}
