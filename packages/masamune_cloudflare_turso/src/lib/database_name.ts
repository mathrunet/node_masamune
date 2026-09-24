import { validateLogicalName } from "./request";
import { TursoWorkersOptions } from "./types";
import { HttpError } from "./http_error";

const tursoDatabaseNamePattern = /^[a-z0-9-]{1,56}$/;
const resolvedBinding = Symbol("resolvedTursoDatabaseBinding");
type BoundOptions = TursoWorkersOptions & {
  [resolvedBinding]?: { logical: string; physical: string; group: string; flavor: "dev" | "prod" };
};

/** サーバーの環境と許可表から既存DBを選び、要求が指定できる接続先を固定します。 */
export function resolveWorkerDatabaseBinding(
  options: TursoWorkersOptions,
  requestPrefix: string | undefined,
  flavor: unknown,
  database: string | undefined,
): TursoWorkersOptions {
  if (flavor !== "dev" && flavor !== "prod") {
    throw new HttpError(500, "databaseBindings requires an explicit dev/prod FLAVOR.");
  }
  if (requestPrefix !== undefined) {
    throw new HttpError(400, "Client prefix cannot override databaseBindings.");
  }
  if (options.databasePrefix !== undefined) {
    throw new HttpError(500, "databaseBindings cannot be combined with databasePrefix.");
  }
  const bindings = options.databaseBindings;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings) ||
      Object.keys(bindings).length === 0) {
    throw new HttpError(500, "databaseBindings must be a non-empty environment map.");
  }
  const physicalNames = new Set<string>();
  for (const [environment, entries] of Object.entries(bindings)) {
    if ((environment !== "dev" && environment !== "prod") ||
        !entries || typeof entries !== "object" || Array.isArray(entries) ||
        Object.keys(entries).length === 0) {
      throw new HttpError(500, "databaseBindings must contain non-empty dev/prod maps.");
    }
    for (const [logical, entry] of Object.entries(entries)) {
      // 同じ物理DBを別の論理名や環境に割り当てるとrulesの境界を迂回できるため拒否します。
      if (!/^[A-Za-z0-9_-]+$/.test(logical) || !entry ||
          typeof entry.database !== "string" || !tursoDatabaseNamePattern.test(entry.database) ||
          typeof entry.group !== "string" || !/^[A-Za-z0-9_-]+$/.test(entry.group) ||
          physicalNames.has(entry.database)) {
        throw new HttpError(500, "databaseBindings must have valid unique database names and groups.");
      }
      physicalNames.add(entry.database);
    }
  }
  const entries = bindings[flavor];
  if (!database || !entries || !Object.prototype.hasOwnProperty.call(entries, database)) {
    throw new HttpError(403, "Database is not bound to this Worker environment.");
  }
  const entry = entries[database];
  if ((options.group && options.group !== entry.group) ||
      (options.groups && !options.groups.some((item) => item.name === entry.group))) {
    throw new HttpError(500, "Bound database group does not match the configured groups.");
  }
  const result: BoundOptions = {
    ...options,
    group: entry.group,
    groups: [{ name: entry.group }],
    autoCreateDatabase: false,
    [resolvedBinding]: { logical: database, physical: entry.database, group: entry.group, flavor },
  };
  return result;
}

/** 接続先変更と環境の違いをキャッシュキーへ反映し、未解決の設定を拒否します。 */
export function databaseBindingCacheKey(database: string, options: TursoWorkersOptions): string {
  if (options.databaseBindings === undefined) return "";
  const binding = (options as BoundOptions)[resolvedBinding];
  if (!binding || binding.logical !== database) {
    throw new HttpError(500, "databaseBindings must be resolved for the requested database.");
  }
  return JSON.stringify([binding.flavor, binding.logical, binding.physical, binding.group]);
}

/**
 * Resolves an application-level logical database name to a Turso-compatible
 * physical database name.
 *
 * Logical names are kept unchanged when Turso already accepts them. Names
 * containing upper-case characters, underscores, or more than 56 characters
 * are mapped deterministically so that rules can continue to evaluate the
 * original logical name.
 */
export async function resolvePhysicalDatabaseName(
  database: string,
  options: Pick<TursoWorkersOptions, "databasePrefix" | "databaseBindings"> = {},
): Promise<string> {
  const logicalName = validateLogicalName(database, "database");
  if (options.databaseBindings !== undefined) {
    databaseBindingCacheKey(logicalName, options);
    return (options as BoundOptions)[resolvedBinding]!.physical;
  }
  const candidate = `${options.databasePrefix ?? ""}${logicalName}`;
  if (tursoDatabaseNamePattern.test(candidate)) {
    return candidate;
  }
  const bytes = new TextEncoder().encode(`masamune-turso:${candidate}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
  return `db-${hex.slice(0, 53)}`;
}
