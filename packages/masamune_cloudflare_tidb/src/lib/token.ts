import { importJWK, importPKCS8, JWK, SignJWT } from "jose";
import { TidbWorkersOptions } from "./types";
import type { TidbDatabaseTokenAuthorization } from "./rules";

export interface IssuedToken {
  token: string;
  expiresAt: number;
  username: string;
}

export async function issueDatabaseToken({
  database,
  authorization,
  ttlSeconds,
  options,
  readMode,
  writeMode,
}: {
  database: string;
  authorization: TidbDatabaseTokenAuthorization;
  ttlSeconds?: number | undefined;
  options: TidbWorkersOptions;
  readMode: string;
  writeMode: string;
}): Promise<IssuedToken> {
  const now = Math.floor(Date.now() / 1000);
  const maxTtl = options.maxTtlSeconds ?? 3600;
  const ttl = Math.max(1, Math.min(ttlSeconds ?? 600, maxTtl));
  const expiresAt = now + ttl;
  const username = resolveUsername(options, readMode, writeMode);
  const issuer = options.jwtIssuer;
  if (!issuer) {
    throw new Error("TIDB_JWT_ISSUER is required.");
  }
  const key = await importSigningKey(options);
  const jwt = await new SignJWT({
    tidb_database: database,
    tidb_authorization: authorization,
  })
    .setProtectedHeader({
      alg: "RS256",
      ...(options.jwtKid ? { kid: options.jwtKid } : {}),
    })
    .setIssuer(issuer)
    .setSubject(username)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(key);
  return {
    token: jwt,
    expiresAt,
    username,
  };
}

function resolveUsername(
  options: TidbWorkersOptions,
  readMode: string,
  writeMode: string,
): string {
  if (readMode === "direct" && writeMode === "direct") {
    return resolveTidbCloudUsername(
      options,
      required(
        options.directReadWriteUsername,
        "TIDB_DIRECT_READ_WRITE_USERNAME",
      ),
    );
  }
  if (writeMode === "direct") {
    return resolveTidbCloudUsername(
      options,
      required(options.directWriteUsername, "TIDB_DIRECT_WRITE_USERNAME"),
    );
  }
  if (readMode === "direct") {
    return resolveTidbCloudUsername(
      options,
      required(options.directReadUsername, "TIDB_DIRECT_READ_USERNAME"),
    );
  }
  throw new Error("Direct TiDB access is not allowed by rules.");
}

function resolveTidbCloudUsername(
  options: TidbWorkersOptions,
  username: string,
): string {
  if (username.includes(".")) {
    return username;
  }
  const prefix = resolveTidbCloudUsernamePrefix(options);
  return prefix ? `${prefix}.${username}` : username;
}

function resolveTidbCloudUsernamePrefix(
  options: TidbWorkersOptions,
): string | undefined {
  const connectionUrl = options.connectionUrl;
  if (!connectionUrl) {
    return undefined;
  }
  try {
    const url = new URL(connectionUrl);
    const username = decodeURIComponent(url.username);
    const separator = username.indexOf(".");
    if (separator <= 0) {
      return undefined;
    }
    return username.substring(0, separator);
  } catch (_) {
    return undefined;
  }
}

async function importSigningKey(options: TidbWorkersOptions): Promise<CryptoKey> {
  if (options.jwtPrivateKeyPem) {
    return await importPKCS8(options.jwtPrivateKeyPem, "RS256");
  }
  if (options.jwtPrivateKeyJwk) {
    const jwk = JSON.parse(options.jwtPrivateKeyJwk) as JWK;
    return await importJWK(jwk, "RS256") as CryptoKey;
  }
  throw new Error("TIDB_JWT_PRIVATE_KEY_PEM or TIDB_JWT_PRIVATE_KEY_JWK is required.");
}

function required(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}
