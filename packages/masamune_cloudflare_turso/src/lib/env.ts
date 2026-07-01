import { Context } from "hono";
import { TursoWorkersOptions } from "./types";

interface TursoWorkersEnv {
  TURSO_ORGANIZATION?: string | undefined;
  TURSO_GROUP?: string | undefined;
  TURSO_PLATFORM_API_TOKEN?: string | undefined;
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
  };
}

function firstNonEmpty(
  ...values: (string | undefined)[]
): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0);
}
