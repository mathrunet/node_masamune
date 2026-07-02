import { Context } from "hono";
import { TidbWorkersOptions } from "./types";

interface TidbWorkersEnv {
  TIDB_CONNECTION_URL?: string | undefined;
}

export function resolveTidbWorkersOptionsFromEnv(
  context: Context,
  options: TidbWorkersOptions,
): TidbWorkersOptions {
  const env = (context.env ?? {}) as TidbWorkersEnv;
  return {
    ...options,
    connectionUrl: firstNonEmpty(env.TIDB_CONNECTION_URL, options.connectionUrl),
  };
}

function firstNonEmpty(
  ...values: (string | undefined)[]
): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0);
}
