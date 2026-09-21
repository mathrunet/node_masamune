import { Context, Hono } from "hono";
import { TidbDirectClient } from "./direct_client";
import { executeDirectCrud, fetchDirectDocumentForRules } from "./direct_crud";
import { buildDatabaseRulesPath, createTidbRulesEngine, normalizeHttpMethodToRulesOperation } from "./rules";
import { resolveWorkerDatabasePrefix } from "./database_prefix";
import { isTidbServerRequest } from "./server_request";
import { parseCrudRequest, jsonError } from "./request";
import { HttpError } from "./http_error";
import { AuthenticationContext, TidbCrudMethod, TidbWorkersOptions } from "./types";

export function registerDirectTidb(hono: Hono, options: TidbWorkersOptions): Hono {
  for (const method of ["GET", "POST", "PUT", "DELETE"] as const) {
    for (const path of ["/database/:database/:table", "/database/:database/:table/:indexKey"]) {
      hono.on(method, path, (context) => handle(context, options, method));
    }
  }
  return hono;
}
async function handle(context: Context, options: TidbWorkersOptions, method: TidbCrudMethod): Promise<Response> {
  let phase = "parse";
  try {
    const env = context.env as Record<string, string | undefined> | undefined;
    const authOptions = { ...options, serverAccessToken: env?.TIDB_SERVER_ACCESS_TOKEN ?? options.serverAccessToken,
      serverAccessHeader: env?.TIDB_SERVER_ACCESS_HEADER ?? options.serverAccessHeader };
    const request = await parseCrudRequest(context);
    const databaseOptions = resolveWorkerDatabasePrefix(authOptions, request.prefix, env?.FLAVOR);
    const physical = { ...request, database: `${databaseOptions.databasePrefix ?? ""}${request.database}` };
    const client = new TidbDirectClient({ host: env?.TIDB_HOST ?? options.host ?? "", username: env?.TIDB_USERNAME ?? options.username ?? "",
      password: env?.TIDB_PASSWORD ?? options.password ?? "", manifest: options.schemaManifest, timeoutMs: options.timeoutMs });
    client.table(physical.database, physical.table);
    const maxScanRows = options.maxScanRows ?? 1000;
    phase = "rules";
    const result = await createTidbRulesEngine(options.rules).evaluate({
      target: "database", path: buildDatabaseRulesPath({ database: request.database, table: request.table, indexKey: request.indexKey ?? "*" }),
      operation: method === "POST" && request.indexKey ? "update" : normalizeHttpMethodToRulesOperation(method),
      authentication: context.get("authentication") as AuthenticationContext | undefined,
      server: isTidbServerRequest(context, authOptions),
      fetchDocument: () => fetchDirectDocumentForRules(client, { ...physical, nearest: undefined }, maxScanRows),
    });
    if (!result.allowed) return context.json({ error: "denied", rule: result.rulePath }, 403);
    phase = "execute";
    let response = await executeDirectCrud({ client, method, request: physical, maxScanRows });
    if (method === "GET" && physical.nearest && Array.isArray(response)) {
      const allowed = [];
      for (const row of response) {
        if (typeof row.id !== "string") continue;
        const permission = await createTidbRulesEngine(options.rules).evaluate({
          target: "database", path: buildDatabaseRulesPath({ database: request.database, table: request.table, indexKey: row.id }),
          operation: "get", authentication: context.get("authentication") as AuthenticationContext | undefined,
          server: isTidbServerRequest(context, authOptions), fetchDocument: async () => row,
        });
        if (permission.allowed) allowed.push(row);
      }
      response = allowed;
    }
    return context.json({ data: response });
  } catch (error) {
    return jsonError(context, error instanceof HttpError ? error : new HttpError(500, "Internal Server Error"), { operation: "crud", method, phase });
  }
}
