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
  options: Pick<TidbWorkersOptions, "databasePrefix" | "clusterIsolated">,
  prefix: string | undefined,
): Pick<TidbWorkersOptions, "databasePrefix" | "clusterIsolated"> {
  if (!prefix) {
    return options;
  }
  return {
    ...options,
    databasePrefix: `${options.databasePrefix ?? ""}${prefix}`,
  };
}

export function resolveWorkerDatabasePrefix(
  options: Pick<TidbWorkersOptions, "databasePrefix" | "clusterIsolated">,
  requestPrefix: string | undefined,
  flavor: unknown,
): Pick<TidbWorkersOptions, "databasePrefix" | "clusterIsolated"> {
  const resolvedFlavor = flavor === undefined ? "prod" : flavor;
  if (resolvedFlavor !== "dev" && resolvedFlavor !== "prod") {
    throw new HttpError(500, "Worker FLAVOR must be dev or prod.");
  }
  const boundary = options.clusterIsolated ? "" : resolvedFlavor === "dev" ? "dev_" : "";
  const serverPrefix = options.databasePrefix;
  if (serverPrefix !== undefined && serverPrefix !== "") {
    if (boundary === "") {
      throw new HttpError(
        500,
        `Server prefix does not match FLAVOR=${resolvedFlavor}.`,
      );
    }
    if (serverPrefix !== boundary && !serverPrefix.startsWith(boundary)) {
      throw new HttpError(
        500,
        `Server prefix does not match FLAVOR=${resolvedFlavor}.`,
      );
    }
  }
  const serverSuffix =
    serverPrefix === undefined ? "" : serverPrefix.slice(boundary.length);
  const request = requestPrefix ?? "";
  const combined = `${boundary}${serverSuffix}${request}`;
  return {
    ...options,
    databasePrefix: combined.length === 0 ? undefined : combined,
  };
}
