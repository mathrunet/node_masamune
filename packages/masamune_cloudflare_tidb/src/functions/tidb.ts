import { Context, Hono } from "hono";
import {
  AuthenticationContext,
  TidbCrudMethod,
  TidbRequestBody,
  RulesOperation,
  TidbWorkersOptions,
} from "../lib/types";
import {
  jsonError,
  parseCrudRequest,
} from "../lib/request";
import {
  buildDatabaseRulesPath,
  createTidbRulesEngine,
  normalizeHttpMethodToRulesOperation,
} from "../lib/rules";
import { resolveTidbWorkersOptionsFromEnv } from "../lib/env";
import { isTidbServerRequest } from "../lib/server_request";
import { TidbDataServiceClient } from "../lib/data_service_client";
import {
  executeDataServiceCrud,
  fetchDataServiceDocumentForRules,
  resolveMaxScanRows,
} from "../lib/data_service_crud";
import { resolveWorkerDatabasePrefix } from "../lib/database_prefix";

module.exports = (
  hono: Hono,
  options: TidbWorkersOptions,
  data: { [key: string]: unknown },
) => {
  hono.get("/database/:database/:table", async (context) => handleCrud(context, options, "GET"));
  hono.get("/database/:database/:table/:indexKey", async (context) => handleCrud(context, options, "GET"));
  hono.post("/database/:database/:table", async (context) => handleCrud(context, options, "POST"));
  hono.post("/database/:database/:table/:indexKey", async (context) => handleCrud(context, options, "POST"));
  hono.put("/database/:database/:table", async (context) => handleCrud(context, options, "PUT"));
  hono.put("/database/:database/:table/:indexKey", async (context) => handleCrud(context, options, "PUT"));
  hono.delete("/database/:database/:table", async (context) => handleCrud(context, options, "DELETE"));
  hono.delete("/database/:database/:table/:indexKey", async (context) => handleCrud(context, options, "DELETE"));
  return hono;
};

async function handleCrud(
  context: Context,
  options: TidbWorkersOptions,
  method: TidbCrudMethod,
): Promise<Response> {
  let request:
    | (Required<Pick<TidbRequestBody, "database" | "table">> &
        TidbRequestBody)
    | undefined;
  let resolvedOptions: TidbWorkersOptions | undefined;
  let phase = "parse";
  try {
    resolvedOptions = resolveTidbWorkersOptionsFromEnv(context, options);
    request = await parseCrudRequest(context);
    const crudRequest = request;
    const databaseOptions = resolveWorkerDatabasePrefix(
      resolvedOptions,
      crudRequest.prefix,
      (context.env as { FLAVOR?: unknown } | undefined)?.FLAVOR,
    );
    phase = "connect";
    const dataServiceClient = new TidbDataServiceClient(databaseOptions);
    const maxScanRows = resolveMaxScanRows(databaseOptions.maxScanRows);
    const engine = createTidbRulesEngine(resolvedOptions.rules);
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
      fetchDocument: async () =>
        fetchDataServiceDocumentForRules(
          dataServiceClient,
          crudRequest,
          maxScanRows,
        ),
      server: isTidbServerRequest(context, resolvedOptions),
    });
    if (!result.allowed) {
      return context.json({
        error: "denied",
        rule: result.rulePath,
      }, 403);
    }
    phase = method === "POST" ? "create-table-or-insert" : "execute";
    const response = await executeDataServiceCrud({
      client: dataServiceClient,
      method,
      request: crudRequest,
      maxScanRows,
    });
    return context.json({ data: response });
  } catch (error) {
    return jsonError(context, error, {
      operation: "crud",
      phase,
      method,
      database: request?.database,
      table: request?.table,
    });
  }
}

function resolveCrudRulesOperation(
  method: TidbCrudMethod,
  request: { indexKey?: string | undefined },
): RulesOperation {
  if (method === "POST" && request.indexKey) {
    return "update";
  }
  return normalizeHttpMethodToRulesOperation(method);
}
