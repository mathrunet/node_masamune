import { Context, Hono } from "hono";
import {
  AuthenticationContext,
  TursoCrudMethod,
  TursoRequestBody,
  RulesOperation,
  TursoWorkersOptions,
} from "../lib/types";
import {
  executeCrud,
  fetchDocumentForRules,
  prepareCrudWriteSchema,
} from "../lib/crud";
import {
  jsonError,
  logServerError,
  parseCrudRequest,
} from "../lib/request";
import {
  buildDatabaseRulesPath,
  createTursoRulesEngine,
  normalizeHttpMethodToRulesOperation,
} from "../lib/rules";
import {
  cacheDatabaseConnection,
  clearDatabaseConnectionCache,
  createTursoClient,
  executeConcurrentWrite,
  executeRetriableWrite,
  isTransientTursoError,
  resolveDatabaseConnection,
  TursoClient,
  waitForDatabaseReady,
} from "../lib/turso_client";
import { resolveTursoWorkersOptionsFromEnv, tursoGroupContext, validateTursoGroupRequest } from "../lib/env";
import { resolveWorkerDatabasePrefix } from "../lib/database_prefix";
import { resolveTursoSchema } from "../lib/schema";

module.exports = (
  hono: Hono,
  options: TursoWorkersOptions,
  data: { [key: string]: unknown },
) => {
  hono.get("/", async (context) => handleCrud(context, options, "GET"));
  hono.get("/database/:database/:table", async (context) => handleCrud(context, options, "GET"));
  hono.get("/database/:database/:table/:indexKey", async (context) => handleCrud(context, options, "GET"));
  hono.post("/", async (context) => handleCrud(context, options, "POST"));
  hono.post("/database/:database/:table", async (context) => handleCrud(context, options, "POST"));
  hono.post("/database/:database/:table/:indexKey", async (context) => handleCrud(context, options, "POST"));
  hono.put("/", async (context) => handleCrud(context, options, "PUT"));
  hono.put("/database/:database/:table", async (context) => handleCrud(context, options, "PUT"));
  hono.put("/database/:database/:table/:indexKey", async (context) => handleCrud(context, options, "PUT"));
  hono.delete("/", async (context) => handleCrud(context, options, "DELETE"));
  hono.delete("/database/:database/:table", async (context) => handleCrud(context, options, "DELETE"));
  hono.delete("/database/:database/:table/:indexKey", async (context) => handleCrud(context, options, "DELETE"));
  return hono;
};

async function handleCrud(
  context: Context,
  options: TursoWorkersOptions,
  method: TursoCrudMethod,
): Promise<Response> {
  let request:
    | (Required<Pick<TursoRequestBody, "database" | "table">> &
        TursoRequestBody)
    | undefined;
  let resolvedOptions: TursoWorkersOptions | undefined;
  let client: TursoClient | undefined;
  let phase = "parse";
  try {
    resolvedOptions = resolveTursoWorkersOptionsFromEnv(context, options);
    request = await parseCrudRequest(context);
    const crudRequest = request;
    const databaseOptions = resolveWorkerDatabasePrefix(
      resolvedOptions,
      crudRequest.prefix,
      (context.env as { FLAVOR?: unknown } | undefined)?.FLAVOR,
      crudRequest.database,
    );
    const groupContext = tursoGroupContext(context, request.group);
    validateTursoGroupRequest(databaseOptions, groupContext);
    phase = "connect";
    const connection = await resolveDatabaseConnection(
      crudRequest.database,
      databaseOptions,
      groupContext,
    );
    const connectedClient = createTursoClient(connection);
    client = connectedClient;
    const engine = createTursoRulesEngine(resolvedOptions.rules);
    const authentication = context.get("authentication") as AuthenticationContext | undefined;
    phase = "rules";
    const result = await engine.evaluate({
      target: "database",
      path: buildDatabaseRulesPath({
        database: crudRequest.database,
        table: crudRequest.table,
        indexKey: crudRequest.indexKey ?? "*",
      }),
      operation: resolveCrudRulesOperation(method, crudRequest),
      authentication,
      fetchDocument: async () => fetchDocumentForRules(connectedClient, crudRequest),
      server: true,
    });
    if (!result.allowed) {
      return context.json({
        error: "denied",
        rule: result.rulePath,
      }, 403);
    }
    if (connection.created) {
      phase = "database-ready";
      await waitForDatabaseReady(client);
      cacheDatabaseConnection(
        crudRequest.database,
        databaseOptions,
        connection,
      );
    }
    phase = method === "POST" ? "create-table-or-insert" : "execute";
    const declaredSchema = resolveTursoSchema(
      resolvedOptions!.schemaManifest,
      crudRequest.database,
      crudRequest.table,
    );
    const crudOptions = {
      client: connectedClient,
      method,
      request: crudRequest,
      autoCreateTable: resolvedOptions!.autoCreateTable !== false,
      autoMigrateAddColumns: resolvedOptions!.autoMigrateAddColumns !== false,
      declaredSchema,
      schemaCacheKey: connection.url,
    };
    let response: unknown;
    const preparesSchemaBeforeConcurrentWrite = declaredSchema !== undefined ||
      method === "PUT" ||
      (method === "POST" && crudRequest.indexKey !== undefined);
    if (method === "GET" || !preparesSchemaBeforeConcurrentWrite) {
      response = method === "GET"
        ? await executeCrud(crudOptions)
        : await executeConcurrentWrite(
          connectedClient,
          () => executeCrud(crudOptions),
        );
    } else {
      await executeRetriableWrite(() => prepareCrudWriteSchema(crudOptions));
      response = await executeConcurrentWrite(
        connectedClient,
        () => executeCrud({ ...crudOptions, schemaPrepared: true }),
      );
    }
    if (method === "GET" && crudRequest.nearest && Array.isArray(response)) {
      const allowed = [];
      for (const row of response) {
        if (typeof row.id !== "string") continue;
        const permission = await engine.evaluate({
          target: "database", path: buildDatabaseRulesPath({ database: crudRequest.database, table: crudRequest.table, indexKey: row.id }),
          operation: "get", authentication, server: true, fetchDocument: async () => row,
        });
        if (permission.allowed) allowed.push(row);
      }
      response = allowed;
    }
    return context.json({ data: response });
  } catch (error) {
    if (request && resolvedOptions && isTransientTursoError(error)) {
      clearDatabaseConnectionCache(
        request.database,
        resolveWorkerDatabasePrefix(
          resolvedOptions,
          request.prefix,
          (context.env as { FLAVOR?: unknown } | undefined)?.FLAVOR,
          request.database,
        ),
      );
      logServerError(error, 503, {
        operation: "crud",
        phase,
        method,
        database: request.database,
        table: request.table,
      });
      return context.json({
        error: error instanceof Error ? error.message : String(error),
        phase,
        database: request.database,
        table: request.table,
      }, 503);
    }
    return jsonError(context, error, {
      operation: "crud",
      phase,
      method,
      database: request?.database,
      table: request?.table,
    });
  } finally {
    await closeTursoClient(context, client);
  }
}

/**
 * Closes the Hrana stream without delaying the response when the runtime can continue work after it.
 *
 * レスポンス後も処理を継続できる実行環境では、応答を待たせずにHranaストリームを閉じます。
 */
async function closeTursoClient(
  context: Context,
  client: TursoClient | undefined,
): Promise<void> {
  if (!client) {
    return;
  }
  // The request result is authoritative; closing a completed stream is best effort.
  const closing = Promise.resolve().then(() => client.close()).catch(() => undefined);
  let executionContext: { waitUntil(promise: Promise<unknown>): void } | undefined;
  try {
    executionContext = context.executionCtx;
  } catch (_) {
    executionContext = undefined;
  }
  if (typeof executionContext?.waitUntil === "function") {
    executionContext.waitUntil(closing);
    return;
  }
  await closing;
}

function resolveCrudRulesOperation(
  method: TursoCrudMethod,
  request: { indexKey?: string | undefined },
): RulesOperation {
  if (method === "POST" && request.indexKey) {
    return "update";
  }
  return normalizeHttpMethodToRulesOperation(method);
}
