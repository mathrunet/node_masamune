import { fetchWithDigest } from "./digest_auth";
import { HttpError } from "./request";
import { decodeRow } from "./schema";
import {
  TidbDataServiceEndpoint,
  TidbDataServiceManifest,
  TidbDataServiceOperation,
  TidbDataServiceTableManifest,
  TidbWorkersOptions,
} from "./types";

export interface TidbDataServiceResult {
  rows: Record<string, unknown>[];
  result?: Record<string, unknown> | undefined;
}

export class TidbDataServiceClient {
  private readonly appId: string;
  private readonly baseUrl: string;
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly manifest: TidbDataServiceManifest;

  constructor(options: TidbWorkersOptions) {
    this.appId = requireOption(options.dataServiceAppId, "dataServiceAppId");
    this.publicKey = requireOption(
      options.dataServicePublicKey,
      "dataServicePublicKey",
    );
    this.privateKey = requireOption(
      options.dataServicePrivateKey,
      "dataServicePrivateKey",
    );
    if (!options.dataServiceManifest) {
      throw new HttpError(
        500,
        "dataServiceManifest is required in data-service mode.",
      );
    }
    this.manifest = options.dataServiceManifest;
    this.baseUrl = resolveBaseUrl(options);
  }

  table(database: string, table: string): TidbDataServiceTableManifest {
    const manifest = this.manifest.tables[tableManifestKey(database, table)];
    if (!manifest) {
      throw new HttpError(
        404,
        `TiDB Data Service table is not deployed: ${database}.${table}`,
      );
    }
    return manifest;
  }

  async execute({
    database,
    table,
    operation,
    parameters,
  }: {
    database: string;
    table: string;
    operation: TidbDataServiceOperation;
    parameters?: Record<string, unknown> | undefined;
  }): Promise<TidbDataServiceResult> {
    const tableManifest = this.table(database, table);
    const endpoint = requireEndpoint(tableManifest, operation);
    const url = buildEndpointUrl(
      this.baseUrl,
      this.appId,
      endpoint,
      parameters ?? {},
    );
    const response = await fetchWithDigest(
      url,
      buildRequestInit(endpoint, parameters ?? {}),
      {
        username: this.publicKey,
        password: this.privateKey,
      },
    );
    const body = await readJson(response);
    if (!response.ok) {
      const message = findErrorMessage(body);
      throw new HttpError(
        response.status >= 500 ? 503 : response.status,
        `TiDB Data Service request failed (${response.status})${message ? `: ${message}` : ""}`,
      );
    }
    return normalizeDataServiceResponse(body);
  }
}

export function tableManifestKey(database: string, table: string): string {
  return `${database}\u0000${table}`;
}

function resolveBaseUrl(options: TidbWorkersOptions): string {
  const explicit = options.dataServiceBaseUrl?.replace(/\/+$/, "");
  if (explicit) {
    return explicit;
  }
  const region = requireOption(
    options.dataServiceRegion,
    "dataServiceRegion",
  );
  return `https://${region}.data.tidbcloud.com/api/v1beta`;
}

function requireOption(
  value: string | undefined,
  name: string,
): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new HttpError(500, `${name} is required in data-service mode.`);
  }
  return normalized;
}

function requireEndpoint(
  table: TidbDataServiceTableManifest,
  operation: TidbDataServiceOperation,
): TidbDataServiceEndpoint {
  const endpoint = table.endpoints[operation];
  if (!endpoint) {
    throw new HttpError(
      403,
      `TiDB Data Service operation is not deployed: ${operation}`,
    );
  }
  return endpoint;
}

function buildEndpointUrl(
  baseUrl: string,
  appId: string,
  endpoint: TidbDataServiceEndpoint,
  parameters: Record<string, unknown>,
): string {
  const path = endpoint.path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const url = new URL(
    `${baseUrl}/app/${encodeURIComponent(appId)}/endpoint/${path}`,
  );
  if (endpoint.method === "GET") {
    for (const [key, value] of Object.entries(parameters)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, serializeParameter(value));
    }
  }
  return url.toString();
}

function buildRequestInit(
  endpoint: TidbDataServiceEndpoint,
  parameters: Record<string, unknown>,
): RequestInit {
  if (endpoint.method === "GET") {
    return { method: "GET" };
  }
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parameters),
  };
}

function serializeParameter(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(",");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function normalizeDataServiceResponse(body: unknown): TidbDataServiceResult {
  const record = asRecord(body);
  const data = asRecord(record?.data);
  const rawRows = Array.isArray(data?.rows) ? data.rows : [];
  const rawColumns = Array.isArray(data?.columns) ? data.columns : [];
  const columnNames = rawColumns.map((column, index) => {
    if (typeof column === "string") {
      return column;
    }
    const entry = asRecord(column);
    const name = entry?.col ?? entry?.name;
    return typeof name === "string" ? name : String(index);
  });
  const columnTypes = rawColumns.map((column) => {
    const entry = asRecord(column);
    const type = entry?.data_type ?? entry?.type;
    return typeof type === "string" ? type : "";
  });
  const rows = rawRows.map((row) => {
    if (!Array.isArray(row)) {
      return decodeRecord(
        decodeRow(asRecord(row) ?? {}, columnNames, columnTypes),
      );
    }
    return decodeRecord(
      decodeRow(row, columnNames, columnTypes),
    );
  });
  return {
    rows,
    result: asRecord(data?.result),
  };
}

function decodeRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, decodeValue(value)]),
  );
}

function decodeValue(value: unknown): unknown {
  if (
    typeof value === "string" &&
    ((value.startsWith("{") && value.endsWith("}")) ||
      (value.startsWith("[") && value.endsWith("]")))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function findErrorMessage(body: unknown): string | undefined {
  const record = asRecord(body);
  const error = asRecord(record?.error);
  const value = error?.message ?? record?.message;
  return typeof value === "string" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
