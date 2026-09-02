import { HttpError } from "./http_error";
import { TursoWorkersOptions } from "./types";

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
  options: TursoWorkersOptions,
  prefix: string | undefined,
): TursoWorkersOptions {
  if (!prefix) {
    return options;
  }
  return {
    ...options,
    databasePrefix: `${options.databasePrefix ?? ""}${prefix}`,
  };
}

export function resolveWorkerDatabasePrefix(
  options: TursoWorkersOptions,
  requestPrefix: string | undefined,
  flavor: unknown,
): TursoWorkersOptions {
  const resolvedFlavor = flavor === undefined ? "prod" : flavor;
  if (resolvedFlavor !== "dev" && resolvedFlavor !== "prod") {
    throw new HttpError(500, "Worker FLAVOR must be dev or prod.");
  }
  const expectedPrefix = resolvedFlavor === "dev" ? "dev_" : undefined;
  if (requestPrefix !== expectedPrefix) {
    throw new HttpError(
      400,
      `Request prefix does not match FLAVOR=${resolvedFlavor}.`,
    );
  }
  if (options.databasePrefix !== undefined &&
      options.databasePrefix !== expectedPrefix) {
    throw new HttpError(
      500,
      `Server prefix does not match FLAVOR=${resolvedFlavor}.`,
    );
  }
  return {
    ...options,
    databasePrefix: expectedPrefix,
  };
}
