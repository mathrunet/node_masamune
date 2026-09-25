import { SchemaManifest, TidbDirectClient } from "./direct_client";

/**
 * Worker environment variables used by [createTidbDirectClient].
 */
export interface TidbDirectEnvironment {
  /** TiDB host name. */
  TIDB_HOST?: string;
  /** TiDB user name. */
  TIDB_USERNAME?: string;
  /** TiDB password. */
  TIDB_PASSWORD?: string;
}

/**
 * Options for [createTidbDirectClient].
 */
export interface TidbDirectEnvironmentOptions {
  /** Schema manifest that lists the tables and columns the client may use. */
  manifest: SchemaManifest;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
}

/**
 * Create a [TidbDirectClient] from `TIDB_HOST`, `TIDB_USERNAME`, and `TIDB_PASSWORD` in the Worker environment.
 *
 * Surrounding whitespace in the values is removed. Throws when a credential is missing.
 */
export function createTidbDirectClient(
  env: TidbDirectEnvironment | undefined | null,
  options: TidbDirectEnvironmentOptions,
): TidbDirectClient {
  return new TidbDirectClient({
    host: env?.TIDB_HOST?.trim() ?? "",
    username: env?.TIDB_USERNAME?.trim() ?? "",
    password: env?.TIDB_PASSWORD?.trim() ?? "",
    manifest: options.manifest,
    timeoutMs: options.timeoutMs,
    fetch: options.fetch,
  });
}
