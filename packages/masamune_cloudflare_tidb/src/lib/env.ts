import { Context } from "hono";
import { TidbWorkersOptions } from "./types";

interface TidbWorkersEnv {
  TIDB_CONNECTION_URL?: string | undefined;
  TIDB_MODE?: string | undefined;
  TIDB_DATA_SERVICE_APP_ID?: string | undefined;
  TIDB_DATA_SERVICE_REGION?: string | undefined;
  TIDB_DATA_SERVICE_BASE_URL?: string | undefined;
  TIDB_DATA_SERVICE_PUBLIC_KEY?: string | undefined;
  TIDB_DATA_SERVICE_PRIVATE_KEY?: string | undefined;
  TIDB_DATA_SERVICE_MAX_SCAN_ROWS?: string | undefined;
}

export function resolveTidbWorkersOptionsFromEnv(
  context: Context,
  options: TidbWorkersOptions,
): TidbWorkersOptions {
  const env = (context.env ?? {}) as TidbWorkersEnv;
  return {
    ...options,
    connectionUrl: firstNonEmpty(env.TIDB_CONNECTION_URL, options.connectionUrl),
    mode: resolveMode(env.TIDB_MODE, options.mode),
    dataServiceAppId: firstNonEmpty(
      env.TIDB_DATA_SERVICE_APP_ID,
      options.dataServiceAppId,
    ),
    dataServiceRegion: firstNonEmpty(
      env.TIDB_DATA_SERVICE_REGION,
      options.dataServiceRegion,
    ),
    dataServiceBaseUrl: firstNonEmpty(
      env.TIDB_DATA_SERVICE_BASE_URL,
      options.dataServiceBaseUrl,
    ),
    dataServicePublicKey: firstNonEmpty(
      env.TIDB_DATA_SERVICE_PUBLIC_KEY,
      options.dataServicePublicKey,
    ),
    dataServicePrivateKey: firstNonEmpty(
      env.TIDB_DATA_SERVICE_PRIVATE_KEY,
      options.dataServicePrivateKey,
    ),
    maxScanRows: firstPositiveInteger(
      env.TIDB_DATA_SERVICE_MAX_SCAN_ROWS,
      options.maxScanRows,
    ),
  };
}

function firstNonEmpty(
  ...values: (string | undefined)[]
): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

function resolveMode(
  envValue: string | undefined,
  optionValue: TidbWorkersOptions["mode"],
): TidbWorkersOptions["mode"] {
  const value = firstNonEmpty(envValue, optionValue);
  if (value === "data-service" || value === "data_service") {
    return "data-service";
  }
  return "direct";
}

function firstPositiveInteger(
  envValue: string | undefined,
  optionValue: number | undefined,
): number | undefined {
  const parsed = envValue ? Number(envValue) : optionValue;
  return Number.isSafeInteger(parsed) && (parsed ?? 0) > 0
    ? parsed
    : undefined;
}
