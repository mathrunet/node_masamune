import { Context } from "hono";
import { HttpError } from "./http_error";
import { TursoWorkersOptions } from "./types";

/**
 * Default header name that marks the request as a server request.
 */
export const defaultTursoServerAccessHeader = "x-masamune-server-token";

/**
 * Returns true when the request presents the configured server access token.
 *
 * When no `serverAccessToken` is configured, every request is treated as a
 * client request. The comparison does not leak the matched length by timing.
 */
export function isTursoServerRequest(
  context: Context,
  options: Pick<TursoWorkersOptions, "serverAccessToken" | "serverAccessHeader">,
): boolean {
  const token = options.serverAccessToken;
  if (typeof token !== "string" || token.length === 0) {
    return false;
  }
  const header = options.serverAccessHeader && options.serverAccessHeader.length > 0
    ? options.serverAccessHeader
    : defaultTursoServerAccessHeader;
  const presented = context.req.header(header);
  if (typeof presented !== "string" || presented.length === 0) {
    return false;
  }
  return timingSafeEqual(presented, token);
}

/**
 * Resolves the `server` flag used for rules evaluation.
 *
 * - With `databaseBindings` or `serverAccessToken`, only requests that present
 *   the server access token are evaluated as server requests. A shared
 *   database without a configured token never grants `"server"` rules.
 * - Without both, the legacy behavior (`server: true`) is kept for
 *   per-user databases on the edge Worker.
 */
export function resolveTursoRulesServerFlag(
  context: Context,
  options: Pick<TursoWorkersOptions, "databaseBindings" | "serverAccessToken" | "serverAccessHeader">,
): boolean {
  const hasToken = typeof options.serverAccessToken === "string" &&
    options.serverAccessToken.length > 0;
  if (options.databaseBindings === undefined && !hasToken) {
    return true;
  }
  return isTursoServerRequest(context, options);
}

/**
 * Throws HTTP 400 `reserved_database` when [database] is listed in
 * `reservedDatabases`. Call this before any database is resolved or created.
 */
export function assertTursoDatabaseNotReserved(
  options: Pick<TursoWorkersOptions, "reservedDatabases">,
  database: string,
): void {
  const reserved = options.reservedDatabases;
  if (reserved === undefined) {
    return;
  }
  if (!Array.isArray(reserved) ||
      reserved.some((name) => typeof name !== "string" || name.length === 0)) {
    throw new HttpError(500, "reservedDatabases must be an array of non-empty strings.");
  }
  if (reserved.includes(database)) {
    throw new HttpError(400, "reserved_database");
  }
}

function timingSafeEqual(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    mismatch |= (left.charCodeAt(i) | 0) ^ (right.charCodeAt(i) | 0);
  }
  return mismatch === 0;
}
