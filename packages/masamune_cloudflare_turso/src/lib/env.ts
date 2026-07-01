import { Context } from "hono";
import { TursoWorkersOptions } from "./types";

interface TursoWorkersEnv {
  TURSO_ORGANIZATION_NAME?: string | undefined;
  TURSO_GROUP_NAME?: string | undefined;
  TURSO_PLATFORM_API_TOKEN?: string | undefined;
}

export function resolveTursoWorkersOptionsFromEnv(
  context: Context,
  options: TursoWorkersOptions,
): TursoWorkersOptions {
  const env = (context.env ?? {}) as TursoWorkersEnv;
  return {
    ...options,
    organizationName: firstNonEmpty(
      env.TURSO_ORGANIZATION_NAME,
      options.organizationName,
    ),
    groupName: firstNonEmpty(env.TURSO_GROUP_NAME, options.groupName),
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
