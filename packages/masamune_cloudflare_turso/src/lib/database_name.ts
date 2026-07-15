import { validateLogicalName } from "./request";
import { TursoWorkersOptions } from "./types";

const tursoDatabaseNamePattern = /^[a-z0-9-]{1,56}$/;

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
  options: Pick<TursoWorkersOptions, "databasePrefix"> = {},
): Promise<string> {
  const logicalName = validateLogicalName(database, "database");
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
