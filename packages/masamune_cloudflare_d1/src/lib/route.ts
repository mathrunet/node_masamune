import { searchVectors, drainVectors, rebuildVectors } from "./vector";
import { Hono, Context } from "hono";
import { D1Client, decode } from "./client";
import { executeCrud, mutation } from "./crud";
import { buildDatabaseRulesPath, createD1RulesEngine, normalizeHttpMethodToRulesOperation } from "./rules";
import { resolveWorkerDatabasePrefix } from "./database_prefix";
import { isD1ServerRequest } from "./server_request";
import { parseCrudRequest, jsonError } from "./request";
import { HttpError } from "./http_error";
import type { D1WorkersOptions, D1CrudMethod, D1Binding, CrudRequest, AuthenticationContext } from "./types";

function clientFor(context: Context, options: D1WorkersOptions, request: CrudRequest): D1Client {
  const prefix = resolveWorkerDatabasePrefix(options, request.prefix, context.env?.FLAVOR).databasePrefix ?? "";
  const database = `${prefix}${request.database}`;
  const bindingName = Object.hasOwn(options.bindings, database) ? options.bindings[database] : undefined;
  const binding = bindingName ? context.env?.[bindingName] as D1Binding : undefined;
  if(!binding || typeof binding.withSession !== "function") throw new HttpError(400, "D1の接続先が登録されていません。");
  const bookmark = request.bookmark;
  if(bookmark !== undefined && (typeof bookmark !== "string" || !bookmark.length || bookmark.length > 4096)) throw new HttpError(400, "bookmarkが不正です。");
  return new D1Client(binding.withSession(bookmark ?? "first-primary"), options.schemaManifest, database);
}
async function authorize(context: Context, options: D1WorkersOptions, client: D1Client, method: D1CrudMethod, request: CrudRequest) {
  client.table(client.database, request.table);
  const authOptions = { ...options, serverAccessToken: (context.env as Record<string, string>)?.D1_SERVER_ACCESS_TOKEN ?? options.serverAccessToken };
  for(const operation of method === "POST" ? ["create", "update"] as const : [normalizeHttpMethodToRulesOperation(method)]) {
    const result = await createD1RulesEngine(options.rules).evaluate({
      target: "database", path: buildDatabaseRulesPath({ database: request.database, table: request.table, indexKey: request.indexKey ?? (typeof request.value?.id === "string" ? request.value.id : "*") }),
      operation,
      authentication: context.get("authentication") as AuthenticationContext | undefined, server: isD1ServerRequest(context, authOptions),
      fetchDocument: () => { throw new HttpError(400, "D1 v1はfield/fieldMatch認可に未対応です。pathまたはauthenticated/server rulesを使用してください。"); }
    });
    if(!result.allowed) throw new HttpError(403, "アクセスが拒否されました。");
  }
}
export function registerD1(hono: Hono, options: D1WorkersOptions): Hono {
  for(const method of ["GET", "POST", "PUT", "DELETE"] as const) {
    for(const path of ["/database/:database/:table", "/database/:database/:table/:indexKey"]) {
      hono.on(method, path, async context => {
        try {
          const request = await parseCrudRequest(context);
          const client = clientFor(context, options, request);
          if(!request.nearest) await authorize(context, options, client, method, request);
          else if(method !== "GET") throw new HttpError(400, "nearestは読み取り専用です。");
          const data = request.nearest
            ? await searchVectors(client, context.env as Record<string, unknown>, { ...request, database: client.database }, async id => {
              try { await authorize(context, options, client, "GET", { ...request, indexKey: id }); return true; }
              catch(error) { if(error instanceof HttpError && error.status === 403) return false; throw error; }
            })
            : await executeCrud(client, method, { ...request, database: client.database }, options.maxScanRows);
          return context.json({ data, bookmark: client.session.getBookmark() });
        } catch(error) { return failure(context, error); }
      });
    }
  }
  hono.post("/batch/:database", async context => {
    try {
      const body = await context.req.json();
      if(!Array.isArray(body.operations) || !body.operations.length || body.operations.length > 100) throw new HttpError(400, "batchは1〜100操作です。");
      const base: CrudRequest = { database: context.req.param("database"), table: "", prefix: body.prefix, bookmark: body.bookmark };
      // 同一DBのbindingを一度だけ解決する。
      const client = clientFor(context, options, base);
      const statements = [];
      const schemas: import("./types").SchemaTable[] = [];
      for(const op of body.operations) {
        if(!op || !["POST", "PUT", "DELETE"].includes(op.method) || typeof op.table !== "string") throw new HttpError(400, "batch操作が不正です。");
        const request = { ...base, table: op.table, indexKey: op.indexKey, value: op.value };
        await authorize(context, options, client, op.method, request);
        const statement = mutation(client, op.method, { ...request, database: client.database });
        if(statement.parameters.length > 100) throw new HttpError(400, "D1のbind値は100個までです。");
        statements.push(client.session.prepare(statement.sql).bind(...statement.parameters)); schemas.push(statement.schema);
      }
      const results = await client.session.batch(statements);
      if(results.some(r => !r.success)) throw new HttpError(502, "batchが失敗しました。");
      return context.json({ data: results.map((r, i) => (r.results ?? []).map(row => decode(row, schemas[i]))), bookmark: client.session.getBookmark() });
    } catch(error) { return failure(context, error); }
  });
  hono.post("/vector/:database/:operation", async context => {
    try {
      if(!isD1ServerRequest(context, { ...options, serverAccessToken: (context.env as Record<string, string>)?.D1_SERVER_ACCESS_TOKEN ?? options.serverAccessToken })) throw new HttpError(403, "管理権限が必要です。");
      const body = await context.req.json();
      const client = clientFor(context, options, { database: context.req.param("database"), table: "", prefix: body.prefix });
      let data: unknown;
      switch(context.req.param("operation")) {
        case "drain": data = await drainVectors(client, context.env as Record<string, unknown>, body.limit); break;
        case "rebuild": data = await rebuildVectors(client, body.table, body.cursor, body.limit); break;
        case "status": data = await client.execute('SELECT status,COUNT(*) AS count,MIN(next_attempt) AS next_attempt FROM "_masamune_vector_jobs" GROUP BY status'); break;
        default: throw new HttpError(400, "不正な管理操作です。");
      }
      return context.json({ data, bookmark: client.session.getBookmark() });
    } catch(error) { return failure(context, error); }
  });
  return hono;
}
function failure(context: Context, error: unknown) {
  return jsonError(context, error instanceof HttpError ? error : new HttpError(502, "D1要求に失敗しました。変更結果が不明の場合は読み取りで確認してください。"));
}
