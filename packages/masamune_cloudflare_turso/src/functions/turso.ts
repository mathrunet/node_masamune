import { Context, Hono } from "hono";
import {
  AuthenticationContext,
  TursoCrudMethod,
  RulesOperation,
  TursoWorkersOptions,
} from "../lib/types";
import { executeCrud, fetchDocumentForRules } from "../lib/crud";
import { jsonError, parseCrudRequest } from "../lib/request";
import {
  buildRulesPath,
  createTursoRulesEngine,
  normalizeHttpMethodToRulesOperation,
} from "../lib/rules";
import {
  createTursoClient,
  resolveDatabaseConnection,
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
  try {
    const resolvedOptions = resolveTursoWorkersOptionsFromEnv(context, options);
    const request = await parseCrudRequest(context);
    const connection = await resolveDatabaseConnection(request.database, resolvedOptions);
    const client = createTursoClient(connection);
    const engine = createTursoRulesEngine(resolvedOptions.rules);
    const authentication = context.get("authentication") as AuthenticationContext | undefined;
    const result = await engine.evaluate({
      path: buildRulesPath({
        database: request.database,
        table: request.table,
        indexKey: request.indexKey ?? "*",
      }),
      operation: resolveCrudRulesOperation(method, request),
      authentication,
      fetchDocument: async () => fetchDocumentForRules(client, request),
      server: true,
    });
    if (!result.allowed) {
      return context.json({
        error: "denied",
        rule: result.rulePath,
      }, 403);
    }
    const response = await executeCrud({
      client,
      method,
      request,
      autoCreateTable: resolvedOptions.autoCreateTable !== false,
      autoMigrateAddColumns: resolvedOptions.autoMigrateAddColumns !== false,
    });
    return context.json({ data: response });
  } catch (error) {
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
