import { Context } from "hono";
import {
  TursoOrderCondition,
  TursoRequestBody,
  TursoTokenRequestBody,
  TursoWhereCondition,
} from "./types";

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function parseCrudRequest(context: Context): Promise<Required<Pick<TursoRequestBody, "database" | "table">> & TursoRequestBody> {
  const method = context.req.method.toUpperCase();
  const body = method === "GET"
    ? parseGetRequest(context)
    : await parseJsonBody<TursoRequestBody>(context);
  const database = validateLogicalName(body.database ?? "main", "database");
  const table = validateIdentifier(requiredString(body.table, "table"), "table");
  const indexKey = body.indexKey ? validateIndexKey(body.indexKey) : undefined;
  const where = validateWhere(body.where ?? []);
  const orderBy = validateOrderBy(body.orderBy ?? []);
  const limit = validateLimit(body.limit);
  const value = body.value === undefined ? undefined : validateValue(body.value);
  return {
    ...body,
    database,
    table,
    indexKey,
    where,
    orderBy,
    limit,
    value,
    count: body.count === true,
  };
}

export async function parseTokenRequest(context: Context): Promise<Required<Pick<TursoTokenRequestBody, "database" | "scope">> & TursoTokenRequestBody> {
  const body = await parseJsonBody<TursoTokenRequestBody>(context);
  const database = validateLogicalName(body.database ?? "main", "database");
  if (!Array.isArray(body.scope) || body.scope.length === 0) {
    throw new HttpError(400, "scope is required.");
  }
  const scope = body.scope.map((item) => {
    if (!item || typeof item !== "object") {
      throw new HttpError(400, "scope item must be an object.");
    }
    const table = validateIdentifier(requiredString(item.table, "scope.table"), "scope.table");
    if (!Array.isArray(item.operations) || item.operations.length === 0) {
      throw new HttpError(400, "scope.operations is required.");
    }
    const operations = item.operations.map((operation) => {
      switch (operation) {
        case "read":
        case "write":
        case "get":
        case "create":
        case "update":
        case "delete":
          return operation;
        default:
          throw new HttpError(400, `Unsupported scope operation: ${operation}`);
      }
    });
    return {
      table,
      operations,
    };
  });
  return {
    ...body,
    database,
    scope,
  };
}

export function validateIdentifier(value: string, label: string): string {
  if (!identifierPattern.test(value)) {
    throw new HttpError(400, `Invalid ${label}: ${value}`);
  }
  return value;
}

export function validateLogicalName(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new HttpError(400, `Invalid ${label}: ${value}`);
  }
  return value;
}

export function validateIndexKey(value: string): string {
  if (value.length === 0 || value.includes("/")) {
    throw new HttpError(400, `Invalid indexKey: ${value}`);
  }
  return value;
}

export function jsonError(context: Context, error: unknown): Response {
  if (error instanceof HttpError) {
    return context.json({ error: error.message }, error.status as 400);
  }
  if (error instanceof Error) {
    return context.json({ error: error.message }, 500);
  }
  return context.json({ error: "Internal Server Error" }, 500);
}

function parseGetRequest(context: Context): TursoRequestBody {
  const query = context.req.query();
  const where = query.where ? parseJsonString<TursoWhereCondition[]>(query.where, "where") : undefined;
  const orderBy = query.orderBy ? parseJsonString<TursoOrderCondition[]>(query.orderBy, "orderBy") : undefined;
  const limit = query.limit === undefined ? undefined : Number(query.limit);
  return {
    database: query.database,
    table: query.table,
    indexKey: query.indexKey,
    where,
    orderBy,
    limit,
    count: query.count === "true",
  };
}

async function parseJsonBody<T>(context: Context): Promise<T> {
  try {
    return await context.req.json<T>();
  } catch (_) {
    throw new HttpError(400, "Request body must be JSON.");
  }
}

function parseJsonString<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (_) {
    throw new HttpError(400, `${label} must be JSON.`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${label} is required.`);
  }
  return value;
}

function validateWhere(where: TursoWhereCondition[]): TursoWhereCondition[] {
  if (!Array.isArray(where)) {
    throw new HttpError(400, "where must be an array.");
  }
  return where.map((condition) => {
    if (!condition || typeof condition !== "object") {
      throw new HttpError(400, "where condition must be an object.");
    }
    const type = condition.type ?? "equalTo";
    switch (type) {
      case "equalTo":
      case "notEqualTo":
      case "lessThan":
      case "lessThanOrEqualTo":
      case "greaterThan":
      case "greaterThanOrEqualTo":
      case "whereIn":
      case "whereNotIn":
      case "isNull":
      case "isNotNull":
      case "like":
      case "arrayContains":
      case "arrayContainsAny":
        break;
      default:
        throw new HttpError(400, `Unsupported where condition: ${condition.type}`);
    }
    const key = validateIdentifier(requiredString(condition.key, "where.key"), "where.key");
    return {
      type,
      key,
      value: condition.value,
    };
  });
}

function validateOrderBy(orderBy: TursoOrderCondition[]): TursoOrderCondition[] {
  if (!Array.isArray(orderBy)) {
    throw new HttpError(400, "orderBy must be an array.");
  }
  return orderBy.map((condition) => {
    if (!condition || typeof condition !== "object") {
      throw new HttpError(400, "orderBy condition must be an object.");
    }
    return {
      key: validateIdentifier(requiredString(condition.key, "orderBy.key"), "orderBy.key"),
      descending: condition.descending === true,
    };
  });
}

function validateLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) {
    return undefined;
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new HttpError(400, "limit must be a positive integer.");
  }
  return limit;
}

function validateValue(value: Record<string, unknown>): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "value must be an object.");
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[validateIdentifier(key, "value key")] = item;
  }
  return result;
}
