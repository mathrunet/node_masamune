import { Context, Hono } from "hono";
import {
  AuthenticationContext,
  TursoCrudMethod,
  TursoRequestBody,
  RulesOperation,
  TursoWorkersOptions,
} from "../lib/types";
import { executeCrud, fetchDocumentForRules } from "../lib/crud";
import { jsonError, parseCrudRequest } from "../lib/request";
import {
  buildDatabaseRulesPath,
  createTursoRulesEngine,
  normalizeHttpMethodToRulesOperation,
} from "../lib/rules";
import {
  cacheDatabaseConnection,
  clearDatabaseConnectionCache,
  createTursoClient,
  isTransientTursoError,
  resolveDatabaseConnection,
  waitForDatabaseReady,
} from "../lib/turso_client";
import { resolveTursoWorkersOptionsFromEnv } from "../lib/env";

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
  let phase = "parse";
  try {
    resolvedOptions = resolveTursoWorkersOptionsFromEnv(context, options);
    request = await parseCrudRequest(context);
    const crudRequest = request;
    phase = "connect";
    const connection = await resolveDatabaseConnection(crudRequest.database, resolvedOptions);
    const client = createTursoClient(connection);
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
      fetchDocument: async () => fetchDocumentForRules(client, crudRequest),
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
      cacheDatabaseConnection(crudRequest.database, resolvedOptions, connection);
    }
    phase = method === "POST" ? "create-table-or-insert" : "execute";
    const response = await executeCrud({
      client,
      method,
      request: crudRequest,
      autoCreateTable: resolvedOptions.autoCreateTable !== false,
      autoMigrateAddColumns: resolvedOptions.autoMigrateAddColumns !== false,
    });
    return context.json({ data: response });
  } catch (error) {
    if (request && resolvedOptions && isTransientTursoError(error)) {
      clearDatabaseConnectionCache(request.database, resolvedOptions);
      return context.json({
        error: error instanceof Error ? error.message : String(error),
        phase,
        database: request.database,
        table: request.table,
      }, 503);
    }
    return jsonError(context, error);
  }
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
