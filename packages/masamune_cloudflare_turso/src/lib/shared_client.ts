import { HttpError } from "./http_error";
import { resolveWorkerDatabaseBinding } from "./database_name";
import { TursoDatabaseAdapter } from "./database_adapter";
import {
  createTursoClient,
  resolveDatabaseConnection,
  TursoClient,
} from "./turso_client";
import { TursoWorkersOptions } from "./types";

export type { TursoClient, TursoResultSet, SqlValue } from "./turso_client";

/**
 * Database bindings of a shared Turso database per environment.
 */
export type TursoDatabaseBindings = NonNullable<TursoWorkersOptions["databaseBindings"]>;

/**
 * Worker environment variables used by [createTursoSharedClient].
 */
export interface TursoSharedEnvironment {
  /** `dev` or `prod`. Selects the entry of the database bindings. */
  FLAVOR?: string | undefined;
  /** Turso organization. */
  TURSO_ORGANIZATION?: string | undefined;
  /** Turso Platform API token used to issue the server database token. */
  TURSO_PLATFORM_API_TOKEN?: string | undefined;
  /** TTL in seconds of the server database token. */
  TURSO_SERVER_TOKEN_TTL_SECONDS?: string | undefined;
  /**
   * JSON of the database bindings used when `options.databaseBindings` is omitted.
   * `katana apply` writes it to `wrangler.region.jsonc` for the shared database.
   */
  TURSO_DATABASE_BINDINGS?: string | undefined;
}

/**
 * Options for [createTursoSharedClient] and [createTursoSharedDatabaseAdapter].
 */
export interface TursoSharedClientOptions {
  /**
   * Fixed databases per environment. Defaults to `TURSO_DATABASE_BINDINGS`.
   */
  databaseBindings?: TursoDatabaseBindings | undefined;
  /**
   * Logical database name to connect to. Defaults to `shared`.
   */
  database?: string | undefined;
  /** Turso organization. Defaults to `TURSO_ORGANIZATION`. */
  organization?: string | undefined;
  /** Turso Platform API token. Defaults to `TURSO_PLATFORM_API_TOKEN`. */
  platformApiToken?: string | undefined;
  /** TTL in seconds of the server database token. */
  serverTokenTtlSeconds?: number | undefined;
}

/**
 * Default logical name of the shared Turso database.
 */
export const defaultTursoSharedDatabase = "shared";

/**
 * Connects to the fixed shared Turso database from a custom region Worker function.
 *
 * The physical database is selected from the database bindings and `FLAVOR`.
 * The database is never created automatically. The returned client has full
 * access to the shared database, so use it only in server-side code that
 * enforces its own authorization (e.g. billing or permission updates).
 * Close the client with `close()` after use.
 *
 * ```ts
 * const client = await createTursoSharedClient(env);
 * try {
 *   await client.execute("UPDATE ranking SET score = ? WHERE id = ?", [10, "user-1"]);
 * } finally {
 *   await client.close();
 * }
 * ```
 */
export async function createTursoSharedClient(
  env: TursoSharedEnvironment | undefined | null,
  options: TursoSharedClientOptions = {},
): Promise<TursoClient> {
  const database = options.database ?? defaultTursoSharedDatabase;
  const resolved = resolveTursoSharedOptions(env, options, database);
  const connection = await resolveDatabaseConnection(database, resolved);
  return createTursoClient(connection);
}

/**
 * Creates a [TursoDatabaseAdapter] bound to the fixed shared Turso database.
 *
 * Paths must use the bound logical database name, e.g. `database/shared/ranking/{id}`.
 */
export function createTursoSharedDatabaseAdapter(
  env: TursoSharedEnvironment | undefined | null,
  options: TursoSharedClientOptions = {},
): TursoDatabaseAdapter {
  const database = options.database ?? defaultTursoSharedDatabase;
  // Validate the configuration eagerly so that misconfiguration fails early.
  resolveTursoSharedOptions(env, options, database);
  return new TursoDatabaseAdapter({
    options: {
      databaseBindings: resolveBindings(env, options),
      organization: firstNonEmpty(options.organization, env?.TURSO_ORGANIZATION),
      platformApiToken: firstNonEmpty(options.platformApiToken, env?.TURSO_PLATFORM_API_TOKEN),
      serverTokenTtlSeconds: resolveTtl(env, options),
    },
    flavor: resolveFlavor(env),
  });
}

function resolveTursoSharedOptions(
  env: TursoSharedEnvironment | undefined | null,
  options: TursoSharedClientOptions,
  database: string,
): TursoWorkersOptions {
  const base: TursoWorkersOptions = {
    databaseBindings: resolveBindings(env, options),
    organization: firstNonEmpty(options.organization, env?.TURSO_ORGANIZATION),
    platformApiToken: firstNonEmpty(options.platformApiToken, env?.TURSO_PLATFORM_API_TOKEN),
    serverTokenTtlSeconds: resolveTtl(env, options),
  };
  return resolveWorkerDatabaseBinding(base, undefined, resolveFlavor(env), database);
}

function resolveBindings(
  env: TursoSharedEnvironment | undefined | null,
  options: TursoSharedClientOptions,
): TursoDatabaseBindings {
  if (options.databaseBindings !== undefined) {
    return options.databaseBindings;
  }
  const raw = env?.TURSO_DATABASE_BINDINGS;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new HttpError(
      500,
      "databaseBindings or TURSO_DATABASE_BINDINGS is required to connect to the shared Turso database.",
    );
  }
  try {
    return JSON.parse(raw) as TursoDatabaseBindings;
  } catch {
    throw new HttpError(500, "TURSO_DATABASE_BINDINGS must be a JSON object.");
  }
}

function resolveFlavor(env: TursoSharedEnvironment | undefined | null): "dev" | "prod" | undefined {
  const flavor = env?.FLAVOR?.trim();
  return flavor === "dev" || flavor === "prod" ? flavor : undefined;
}

function resolveTtl(
  env: TursoSharedEnvironment | undefined | null,
  options: TursoSharedClientOptions,
): number | undefined {
  if (options.serverTokenTtlSeconds !== undefined) {
    return options.serverTokenTtlSeconds;
  }
  const parsed = Number(env?.TURSO_SERVER_TOKEN_TTL_SECONDS);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  return values
    .map((value) => value?.trim())
    .find((value) => typeof value === "string" && value.length > 0);
}
