import { HttpError } from "./http_error";
import { TidbWorkersOptions } from "./types";

export function normalizeDatabasePrefix(
  value: unknown,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "prefix must be a string.");
  }
  const normalized = value.trim().replace(/_+$/, "");
  if (normalized.length === 0) {
    return undefined;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new HttpError(400, `Invalid prefix: ${value}`);
  }
  return `${normalized}_`;
}

export function applyRequestDatabasePrefix(
  options: TidbWorkersOptions,
  prefix: string | undefined,
): TidbWorkersOptions {
  if (!prefix) {
    return options;
  }
  return {
    ...options,
    databasePrefix: `${options.databasePrefix ?? ""}${prefix}`,
  };
}
