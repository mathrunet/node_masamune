import { Context } from "hono";
import { TursoWorkersOptions } from "./types";

interface TursoWorkersEnv {
  TURSO_ORGANIZATION?: string | undefined;
  TURSO_GROUP?: string | undefined;
  TURSO_PLATFORM_API_TOKEN?: string | undefined;
  TURSO_SERVER_TOKEN_TTL_SECONDS?: string | undefined;
}

export function resolveTursoWorkersOptionsFromEnv(
  context: Context,
  options: TursoWorkersOptions,
): TursoWorkersOptions {
  const env = (context.env ?? {}) as TursoWorkersEnv;
  return {
    ...options,
    organization: firstNonEmpty(
      env.TURSO_ORGANIZATION,
      options.organization,
    ),
    group: firstNonEmpty(env.TURSO_GROUP, options.group),
    platformApiToken: firstNonEmpty(
      env.TURSO_PLATFORM_API_TOKEN,
      options.platformApiToken,
    ),
    serverTokenTtlSeconds: firstPositiveInteger(
      env.TURSO_SERVER_TOKEN_TTL_SECONDS,
      options.serverTokenTtlSeconds,
    ),
  };
}

function firstNonEmpty(
  ...values: (string | undefined)[]
): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

function firstPositiveInteger(
  envValue: string | undefined,
  optionValue: number | undefined,
): number | undefined {
  if (envValue !== undefined && envValue.trim().length > 0) {
    const parsed = Number(envValue);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return Number.isSafeInteger(optionValue) && (optionValue ?? 0) > 0
    ? optionValue
    : undefined;
}
