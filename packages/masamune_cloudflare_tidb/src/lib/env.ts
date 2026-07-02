import { Context } from "hono";
import { TidbWorkersOptions } from "./types";

interface TidbWorkersEnv {
  TIDB_CONNECTION_URL?: string | undefined;
  TIDB_JWT_ISSUER?: string | undefined;
  TIDB_JWT_KID?: string | undefined;
  TIDB_JWT_PRIVATE_KEY_PEM?: string | undefined;
  TIDB_JWT_PRIVATE_KEY_JWK?: string | undefined;
  TIDB_DIRECT_READ_USERNAME?: string | undefined;
  TIDB_DIRECT_WRITE_USERNAME?: string | undefined;
  TIDB_DIRECT_READ_WRITE_USERNAME?: string | undefined;
}

export function resolveTidbWorkersOptionsFromEnv(
  context: Context,
  options: TidbWorkersOptions,
): TidbWorkersOptions {
  const env = (context.env ?? {}) as TidbWorkersEnv;
  return {
    ...options,
    connectionUrl: firstNonEmpty(env.TIDB_CONNECTION_URL, options.connectionUrl),
    jwtIssuer: firstNonEmpty(env.TIDB_JWT_ISSUER, options.jwtIssuer),
    jwtKid: firstNonEmpty(env.TIDB_JWT_KID, options.jwtKid),
    jwtPrivateKeyPem: firstNonEmpty(
      env.TIDB_JWT_PRIVATE_KEY_PEM,
      options.jwtPrivateKeyPem,
    ),
    jwtPrivateKeyJwk: firstNonEmpty(
      env.TIDB_JWT_PRIVATE_KEY_JWK,
      options.jwtPrivateKeyJwk,
    ),
    directReadUsername: firstNonEmpty(
      env.TIDB_DIRECT_READ_USERNAME,
      options.directReadUsername,
    ),
    directWriteUsername: firstNonEmpty(
      env.TIDB_DIRECT_WRITE_USERNAME,
      options.directWriteUsername,
    ),
    directReadWriteUsername: firstNonEmpty(
      env.TIDB_DIRECT_READ_WRITE_USERNAME,
      options.directReadWriteUsername,
    ),
  };
}

function firstNonEmpty(
  ...values: (string | undefined)[]
): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0);
}
