import { TidbDataServiceClient } from "./data_service_client";
import { HttpError, validateIdentifier } from "./request";
import {
  TidbCrudMethod,
  TidbOrderCondition,
  TidbRequestBody,
  TidbWhereCondition,
} from "./types";

type CrudRequest =
  Required<Pick<TidbRequestBody, "database" | "table">> & TidbRequestBody;

const supportedWhereTypes = new Set([
  "equalTo",
  "notEqualTo",
  "lessThan",
  "lessThanOrEqualTo",
  "greaterThan",
  "greaterThanOrEqualTo",
  "whereIn",
]);

export async function fetchDataServiceDocumentForRules(
  client: TidbDataServiceClient,
  request: CrudRequest,
  maxScanRows: number,
): Promise<Record<string, unknown> | null> {
  const rows = await selectRows(client, { ...request, limit: 1 }, maxScanRows);
  return rows[0] ?? null;
}

export async function executeDataServiceCrud({
  client,
  method,
  request,
  maxScanRows,
}: {
  client: TidbDataServiceClient;
  method: TidbCrudMethod;
  request: CrudRequest;
  maxScanRows: number;
}): Promise<unknown> {
  switch (method) {
    case "GET":
      return request.count
        ? countRows(client, request, maxScanRows)
        : selectRows(client, request, maxScanRows);
    case "POST":
      return upsertRow(client, request);
    case "PUT":
      return updateRows(client, request, maxScanRows);
    case "DELETE":
      await deleteRows(client, request, maxScanRows);
      return [];
  }
}

export function resolveMaxScanRows(value: number | undefined): number {
  const normalized = value ?? 1000;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > 1999) {
    throw new HttpError(
      500,
      "maxScanRows must be an integer between 1 and 1999.",
    );
  }
  return normalized;
}

async function selectRows(
  client: TidbDataServiceClient,
  request: CrudRequest,
  maxScanRows: number,
): Promise<Record<string, unknown>[]> {
  if (request.indexKey && (request.where?.length ?? 0) === 0) {
    const result = await client.execute({
      database: request.database,
      table: request.table,
      operation: "get",
      parameters: { id: request.indexKey },
    });
    return applyOrderAndLimit(result.rows, request.orderBy, request.limit);
  }
  const conditions = collectConditions(request);
  const parameters = buildEndpointParameters(conditions);
  parameters.limit = maxScanRows + 1;
  const result = await client.execute({
    database: request.database,
    table: request.table,
    operation: "list",
    parameters,
  });
  if (result.rows.length > maxScanRows) {
    throw new HttpError(
      413,
      `TiDB Data Service scan exceeded maxScanRows (${maxScanRows}).`,
    );
  }
  const filtered = result.rows.filter((row) => matchesAll(row, conditions));
  return applyOrderAndLimit(filtered, request.orderBy, request.limit);
}

async function countRows(
  client: TidbDataServiceClient,
  request: CrudRequest,
  maxScanRows: number,
): Promise<number> {
  const conditions = collectConditions(request);
  if (
    conditions.every((condition) =>
      supportedWhereTypes.has(condition.type ?? "equalTo")
    )
  ) {
    const result = await client.execute({
      database: request.database,
      table: request.table,
      operation: "count",
      parameters: buildEndpointParameters(conditions),
    });
    return Number(result.rows[0]?.count ?? 0);
  }
  return (await selectRows(
    client,
    { ...request, count: false, limit: undefined },
    maxScanRows,
  )).length;
}

async function upsertRow(
  client: TidbDataServiceClient,
  request: CrudRequest,
): Promise<Record<string, unknown>[]> {
  const value = requireValue(request.value);
  const now = Date.now();
  const row = {
    ...value,
    id: request.indexKey ?? value.id ?? crypto.randomUUID(),
    created_at: value.created_at ?? now,
    updated_at: value.updated_at ?? now,
  };
  validateColumns(client, request, row);
  const parameters = completeMutationRow(client, request, row);
  await client.execute({
    database: request.database,
    table: request.table,
    operation: "upsert",
    parameters: encodeParameters(parameters),
  });
  return [row];
}

async function updateRows(
  client: TidbDataServiceClient,
  request: CrudRequest,
  maxScanRows: number,
): Promise<Record<string, unknown>[]> {
  if (!request.indexKey && (request.where?.length ?? 0) === 0) {
    throw new HttpError(
      400,
      "PUT requires indexKey or where.",
    );
  }
  const value = requireValue(request.value);
  const existing = await selectRows(
    client,
    { ...request, orderBy: undefined, limit: undefined },
    maxScanRows,
  );
  const updated: Record<string, unknown>[] = [];
  for (const finalRow of existing) {
    const row = {
      ...finalRow,
      ...value,
      id: finalRow.id,
      updated_at: value.updated_at ?? Date.now(),
    };
    validateColumns(client, request, row);
    await client.execute({
      database: request.database,
      table: request.table,
      operation: "update",
      parameters: encodeParameters(
        completeMutationRow(
          client,
          request,
          row,
          new Set(["created_at"]),
        ),
      ),
    });
    updated.push(row);
  }
  return updated;
}

async function deleteRows(
  client: TidbDataServiceClient,
  request: CrudRequest,
  maxScanRows: number,
): Promise<void> {
  if (!request.indexKey && (request.where?.length ?? 0) === 0) {
    throw new HttpError(
      400,
      "DELETE requires indexKey or where.",
    );
  }
  const rows = await selectRows(
    client,
    { ...request, orderBy: undefined, limit: undefined },
    maxScanRows,
  );
  for (const row of rows) {
    if (typeof row.id !== "string") {
      throw new HttpError(500, "Data Service row did not include string id.");
    }
    await client.execute({
      database: request.database,
      table: request.table,
      operation: "delete",
      parameters: { id: row.id },
    });
  }
}

function validateColumns(
  client: TidbDataServiceClient,
  request: CrudRequest,
  row: Record<string, unknown>,
): void {
  const allowed = new Set(client.table(request.database, request.table).columns);
  for (const key of Object.keys(row)) {
    validateIdentifier(key, "column");
    if (!allowed.has(key)) {
      throw new HttpError(
        400,
        `Column is not present in the generated Data Service schema: ${key}`,
      );
    }
  }
}

function completeMutationRow(
  client: TidbDataServiceClient,
  request: CrudRequest,
  row: Record<string, unknown>,
  excluded: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  return Object.fromEntries(
    client
      .table(request.database, request.table)
      .columns
      .filter((column) => !excluded.has(column))
      .map((column) => [
        column,
        Object.prototype.hasOwnProperty.call(row, column) ? row[column] : null,
      ]),
  );
}

function collectConditions(request: CrudRequest): TidbWhereCondition[] {
  return [
    ...(request.indexKey
      ? [{ type: "equalTo", key: "id", value: request.indexKey }]
      : []),
    ...(request.where ?? []),
  ];
}

function buildEndpointParameters(
  conditions: TidbWhereCondition[],
): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const condition of conditions) {
    const type = condition.type ?? "equalTo";
    if (!supportedWhereTypes.has(type)) {
      continue;
    }
    const key = validateIdentifier(condition.key ?? "", "where.key");
    const suffix = {
      equalTo: "",
      notEqualTo: "_ne",
      lessThan: "_lt",
      lessThanOrEqualTo: "_lte",
      greaterThan: "_gt",
      greaterThanOrEqualTo: "_gte",
      whereIn: "_in",
    }[type];
    if (type === "whereIn") {
      if (!Array.isArray(condition.value) || condition.value.length === 0) {
        throw new HttpError(400, "whereIn requires non-empty array.");
      }
      parameters[`${key}${suffix}`] = condition.value.join(",");
    } else {
      parameters[`${key}${suffix}`] = encodeParameter(condition.value);
    }
  }
  return parameters;
}

function encodeParameters(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, encodeParameter(item)]),
  );
}

function encodeParameter(value: unknown): unknown {
  if (
    Array.isArray(value) ||
    (typeof value === "object" && value !== null)
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

function matchesAll(
  row: Record<string, unknown>,
  conditions: TidbWhereCondition[],
): boolean {
  return conditions.every((condition) => {
    const actual = row[condition.key ?? ""];
    const expected = condition.value;
    switch (condition.type ?? "equalTo") {
      case "equalTo":
        return actual === expected;
      case "notEqualTo":
        return actual !== expected;
      case "lessThan":
        return compare(actual, expected) < 0;
      case "lessThanOrEqualTo":
        return compare(actual, expected) <= 0;
      case "greaterThan":
        return compare(actual, expected) > 0;
      case "greaterThanOrEqualTo":
        return compare(actual, expected) >= 0;
      case "whereIn":
        return Array.isArray(expected) && expected.includes(actual);
      case "whereNotIn":
        return Array.isArray(expected) && !expected.includes(actual);
      case "isNull":
        return actual === null || actual === undefined;
      case "isNotNull":
        return actual !== null && actual !== undefined;
      case "like":
        return String(actual ?? "").includes(String(expected ?? ""));
      case "arrayContains":
        return Array.isArray(actual) && actual.includes(expected);
      case "arrayContainsAny":
        return (
          Array.isArray(actual) &&
          Array.isArray(expected) &&
          expected.some((item) => actual.includes(item))
        );
      default:
        throw new HttpError(
          400,
          `Unsupported where condition: ${condition.type}`,
        );
    }
  });
}

function compare(left: unknown, right: unknown): number {
  if (left === right) {
    return 0;
  }
  return (left as never) < (right as never) ? -1 : 1;
}

function applyOrderAndLimit(
  rows: Record<string, unknown>[],
  orderBy: TidbOrderCondition[] | undefined,
  limit: number | undefined,
): Record<string, unknown>[] {
  const output = [...rows];
  if (orderBy?.length) {
    output.sort((left, right) => {
      for (const condition of orderBy) {
        const key = validateIdentifier(condition.key ?? "", "orderBy.key");
        const result = compare(left[key], right[key]);
        if (result !== 0) {
          return condition.descending ? -result : result;
        }
      }
      return 0;
    });
  }
  return limit && limit > 0 ? output.slice(0, limit) : output;
}

function requireValue(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!value || Object.keys(value).length === 0) {
    throw new HttpError(400, "value is required.");
  }
  return value;
}
