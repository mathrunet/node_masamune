import { Context, Hono } from "hono";
import {
  AuthenticationContext,
  TidbCrudMethod,
  TidbRequestBody,
  RulesOperation,
  TidbWorkersOptions,
} from "../lib/types";
import { executeCrud, fetchDocumentForRules } from "../lib/crud";
import { jsonError, parseCrudRequest } from "../lib/request";
import {
  buildDatabaseRulesPath,
  createTidbRulesEngine,
  normalizeHttpMethodToRulesOperation,
} from "../lib/rules";
import {
  clearDatabaseConnectionCache,
  createTidbClient,
  isTransientTidbError,
  resolveDatabaseConnection,
} from "../lib/tidb_client";
import { resolveTidbWorkersOptionsFromEnv } from "../lib/env";
import { TidbDataServiceClient } from "../lib/data_service_client";
import {
  executeDataServiceCrud,
  fetchDataServiceDocumentForRules,
  resolveMaxScanRows,
} from "../lib/data_service_crud";
import { TidbClient } from "../lib/tidb_client";

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
    phase = "connect";
    const dataServiceMode = resolvedOptions.mode === "data-service";
    let client: TidbClient | undefined;
    let dataServiceClient: TidbDataServiceClient | undefined;
    let maxScanRows = 1000;
    if (dataServiceMode) {
      dataServiceClient = new TidbDataServiceClient(resolvedOptions);
      maxScanRows = resolveMaxScanRows(resolvedOptions.maxScanRows);
    } else {
      const connection = await resolveDatabaseConnection(
        crudRequest.database,
        resolvedOptions,
      );
      client = createTidbClient(connection);
    }
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
        dataServiceClient
          ? fetchDataServiceDocumentForRules(
            dataServiceClient,
            crudRequest,
            maxScanRows,
          )
          : fetchDocumentForRules(client!, crudRequest),
      server: true,
    });
    if (!result.allowed) {
      return context.json({
        error: "denied",
        rule: result.rulePath,
      }, 403);
    }
    phase = method === "POST" ? "create-table-or-insert" : "execute";
    const response = dataServiceClient
      ? await executeDataServiceCrud({
        client: dataServiceClient,
        method,
        request: crudRequest,
        maxScanRows,
      })
      : await executeCrud({
        client: client!,
        method,
        request: crudRequest,
        autoCreateTable: resolvedOptions.autoCreateTable !== false,
        autoMigrateAddColumns:
            resolvedOptions.autoMigrateAddColumns !== false,
      });
    return context.json({ data: response });
  } catch (error) {
    if (
      request &&
      resolvedOptions &&
      resolvedOptions.mode !== "data-service" &&
      isTransientTidbError(error)
    ) {
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
  method: TidbCrudMethod,
  request: { indexKey?: string | undefined },
): RulesOperation {
  if (method === "POST" && request.indexKey) {
    return "update";
  }
  return normalizeHttpMethodToRulesOperation(method);
}
