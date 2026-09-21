import { parseCrudRequest } from "../src/lib/request";
import { TidbWorkersOptions } from "../src/lib/types";
import { Hono } from "hono";
import { TidbDirectClient, SchemaManifest } from "../src/lib/direct_client";
import { directWhere, executeDirectCrud } from "../src/lib/direct_crud";
import { registerDirectTidb } from "../src/lib/direct_route";

const manifest: SchemaManifest = { version: "1", tables: ["main", "dev_main", "tenant_main"].map(database => ({
  database, table: "items", primaryKey: ["id"], vectorFields: [], columns: [
    { name: "id", sqlType: "VARCHAR(255)", nullable: false },
    { name: "name", sqlType: "TEXT", nullable: true },
    { name: "tags", sqlType: "JSON", nullable: true },
    { name: "score", sqlType: "BIGINT", nullable: true },
    { name: "created_at", sqlType: "BIGINT", nullable: true },
    { name: "updated_at", sqlType: "BIGINT", nullable: true },
  ],
})) };
const request = { database: "main", table: "items" };
const rules = { version: "1", rules: { database: { "*/*": { read: "allow", write: "allow" }, "*/*/*": { read: "allow", write: "allow" } } } } as const;
const options: TidbWorkersOptions = { host: "fixture.invalid", username: "fixture", password: "fixture", schemaManifest: manifest, rules };
const client = () => new TidbDirectClient({ host: "fixture.invalid", username: "fixture", password: "fixture", manifest });
afterEach(() => jest.restoreAllMocks());

test("whereの同一キー複数条件・カンマ・引用符・NULLをparameterとして保持する", () => {
  const c = client();
  const query = directWhere(c, c.table("main", "items"), { ...request, where: [
    { key: "score", type: "greaterThan", value: 1 }, { key: "score", type: "lessThan", value: 5 },
    { key: "name", type: "whereIn", value: ["a,b", "' OR 1=1 --", null] },
  ] });
  expect(query.sql).toBe(" WHERE `score` > ? AND `score` < ? AND (`name` IN (?, ?) OR `name` IS NULL)");
  expect(query.parameters).toEqual([1, 5, "a,b", "' OR 1=1 --"]);
  expect(() => directWhere(c, c.table("main", "items"), { ...request, where: [{ key: "unknown", value: 1 }] })).toThrow();
});

test.each(["equalTo", "notEqualTo", "lessThan", "lessThanOrEqualTo", "greaterThan", "greaterThanOrEqualTo", "whereIn", "whereNotIn", "isNull", "isNotNull", "like", "arrayContains", "arrayContainsAny"])("query %sをSQLへ変換する", type => {
  const c = client();
  const value = ["whereIn", "whereNotIn", "arrayContainsAny"].includes(type) ? ["日本語", "a,b"] : "日本語";
  const result = directWhere(c, c.table("main", "items"), { ...request, where: [{ key: type.startsWith("array") ? "tags" : "name", type, value }] });
  expect(result.sql).toContain("WHERE"); expect(result.sql).not.toContain("日本語");
});

test("HTTP read/countは同じdata envelopeを返し、order/limitをDBへ渡す", async () => {
  const execute = jest.spyOn(TidbDirectClient.prototype, "execute").mockResolvedValueOnce([{ id: "one", score: "42", tags: '["日本語"]' }]).mockResolvedValueOnce([{ count: "9" }]);
  const app = registerDirectTidb(new Hono(), options);
  const url = new URL("http://localhost/database/main/items");
  url.searchParams.set("orderBy", JSON.stringify([{ key: "score", descending: true }])); url.searchParams.set("limit", "2");
  const response = await app.request(url);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: [{ id: "one", score: 42, tags: ["日本語"] }] });
  expect(execute.mock.calls[0][1]).toContain("ORDER BY `score` DESC LIMIT ?"); expect(execute.mock.calls[0][2]).toEqual([2]);
  expect(await (await app.request("http://localhost/database/main/items?count=true")).json()).toEqual({ data: 9 });
});

test("POSTはsentinel文字列と空文字をそのまま保存し、PUTは指定列だけ更新する", async () => {
  const execute = jest.spyOn(TidbDirectClient.prototype, "execute").mockResolvedValue([]);
  const c = client();
  const posted = await executeDirectCrud({ client: c, method: "POST", request: { ...request, indexKey: "one", value: { name: "__MASAMUNE_NULL__", tags: [""], score: 3 } } });
  expect(posted).toEqual([expect.objectContaining({ id: "one", name: "__MASAMUNE_NULL__" })]);
  expect(execute.mock.calls[0][2]).toContain("__MASAMUNE_NULL__");
  execute.mockResolvedValueOnce([{ id: "one", name: "old", score: "3", created_at: "10" }]).mockResolvedValueOnce([]);
  const updated = await executeDirectCrud({ client: c, method: "PUT", request: { ...request, indexKey: "one", value: { name: "", id: "other", created_at: 99 } } });
  expect(updated).toEqual([expect.objectContaining({ id: "one", created_at: 10, name: "", score: 3 })]);
  const update = execute.mock.calls.at(-1)!;
  expect(update[1]).toContain("SET `name` = ?, `updated_at` = ?");
  expect(update[1]).not.toContain("`score` =");
});

test("DELETE/PUTの無条件更新とscan超過を拒否し、未知columnをSQLへ入れない", async () => {
  const c = client(), execute = jest.spyOn(c, "execute").mockResolvedValue([{ id: "a" }, { id: "b" }]);
  for (const method of ["PUT", "DELETE"] as const) await expect(executeDirectCrud({ client: c, method, request })).rejects.toThrow("requires");
  await expect(executeDirectCrud({ client: c, method: "DELETE", request: { ...request, where: [{ key: "score", value: 1 }] }, maxScanRows: 1 })).rejects.toThrow("maxScanRows");
  expect(execute.mock.calls.every(c => c[1].startsWith("SELECT"))).toBe(true);
  await expect(executeDirectCrud({ client: c, method: "POST", request: { ...request, value: { secret_column: 1 } } })).rejects.toThrow("Column");
});

test("prefixは物理DBにだけ適用し、rulesは論理DBで評価する", async () => {
  const execute = jest.spyOn(TidbDirectClient.prototype, "execute").mockResolvedValue([]);
  const app = registerDirectTidb(new Hono(), options);
  expect((await app.request("http://localhost/database/main/items", {}, { FLAVOR: "dev" })).status).toBe(200);
  expect(execute.mock.calls[0][0]).toBe("dev_main");
  expect((await app.request("http://localhost/database/main/items?prefix=tenant")).status).toBe(200);
  expect(execute.mock.calls[1][0]).toBe("tenant_main");
  expect((await app.request("http://localhost/database/main/items?prefix=unlisted")).status).toBe(400);
});

test("空rulesとserver token不一致はDB呼び出し前に拒否する", async () => {
  const execute = jest.spyOn(TidbDirectClient.prototype, "execute").mockResolvedValue([]);
  const denied = registerDirectTidb(new Hono(), { ...options, rules: { version: "1", rules: {} } });
  expect((await denied.request("http://localhost/database/main/items")).status).toBe(403);
  expect(execute).not.toHaveBeenCalled();
  const server = registerDirectTidb(new Hono(), { ...options, serverAccessToken: "fixture-token", rules: {
    version: "1", rules: { database: { "*/*": { read: "server" }, "*/*/*": { read: "server" } } },
  } });
  expect((await server.request("http://localhost/database/main/items", { headers: { "x-masamune-server-token": "wrong" } })).status).toBe(403);
  expect(execute).not.toHaveBeenCalled();
  expect((await server.request("http://localhost/database/main/items", { headers: { "x-masamune-server-token": "fixture-token" } })).status).toBe(200);
});

test("予期しない例外のSQL・資格情報をHTTP応答とログへ出さない", async () => {
  jest.spyOn(TidbDirectClient.prototype, "execute").mockRejectedValue(new Error("password=private; SELECT sensitive"));
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const response = await registerDirectTidb(new Hono(), options).request("http://localhost/database/main/items");
  expect(response.status).toBe(500); expect(await response.text()).not.toContain("private");
  expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive");
});


test("native vectorは値を正規化し、未取得値をupsertで消さず、where付き距離順検索する", async () => {
  const m = structuredClone(manifest);
  m.tables[0].columns.push({ name: "embedding", sqlType: "VECTOR(3)", nullable: true });
  m.tables[0].vectorFields = ["embedding"];
  const c = new TidbDirectClient({ host: "fixture.invalid", username: "fixture", password: "fixture", manifest: m });
  const execute = jest.spyOn(c, "execute").mockResolvedValue([]);
  await executeDirectCrud({ client: c, method: "POST", request: { ...request, value: { id: "a", embedding: { "@vector": [1, 0, 0], "@measure": "cosine" } } } });
  expect(execute.mock.calls[0][2]).toContain("[1,0,0]");
  execute.mockClear();
  await executeDirectCrud({ client: c, method: "POST", request: { ...request, value: { id: "a", embedding: { "@vector": [], "@measure": "cosine" }, name: "更新" } } });
  expect(execute.mock.calls[0][1]).not.toContain("`embedding` = VALUES");
  execute.mockClear();
  const nearest = { key: "embedding", value: [1, 0, 0] };
  await executeDirectCrud({ client: c, method: "GET", request: { ...request, nearest, limit: 2, where: [{ key: "name", value: "公開" }] } as any });
  expect(execute.mock.calls[0][1]).toContain("VEC_COSINE_DISTANCE");
  expect(execute.mock.calls[0][2]).toEqual(["公開", "[1,0,0]", 2]);
  for (const value of [[1], [0, 0, 0], [NaN, 0, 1]]) {
    await expect(executeDirectCrud({ client: c, method: "GET", request: { ...request, nearest: { ...nearest, value } } as any })).rejects.toThrow();
  }
});


test("nearestのHTTP入力を解析し文書ごとの認可を再評価する", async () => {
  const m = structuredClone(manifest);
  m.tables[0].columns.push({name:"embedding",sqlType:"VECTOR(3)",nullable:true});
  m.tables[0].vectorFields=["embedding"];
  const execute = jest.spyOn(TidbDirectClient.prototype,"execute").mockResolvedValue([
    {id:"a",embedding:"[1,0,0]"},{id:"hidden",embedding:"[0,1,0]"}]);
  const app = registerDirectTidb(new Hono(),{...options,schemaManifest:m,rules:{version:"1",rules:{database:{
    "main/items":{read:"allow"},"main/items/a":{read:"allow"},"main/items/hidden":{read:"deny"}
  }}}});
  const url = "http://localhost/database/main/items?nearest="+encodeURIComponent(JSON.stringify({key:"embedding",value:[1,0,0]}));
  const response = await app.request(url);
  expect(response.status).toBe(200);
  const body = await response.json() as any;
  expect(body.data.map((row:any)=>row.id)).toEqual(["a"]);
  expect(body.data[0].embedding["@type"]).toBe("ModelVectorValue");
  expect(execute.mock.calls[0][1]).toContain("VEC_COSINE_DISTANCE");
  expect((await app.request(url+"&count=true")).status).toBe(400);
  expect((await app.request(url+"&limit=101")).status).toBe(400);
});


test("本文なしDELETEは許可し、不正JSONと本文なしPOSTは拒否する", async () => {
  const app = new Hono();
  app.all("/database/:database/:table/:indexKey", async c => {
    try { return c.json(await parseCrudRequest(c)); }
    catch { return c.json({error:"invalid"},400); }
  });
  const path="http://localhost/database/main/items/a";
  const response=await app.request(path,{method:"DELETE"});
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({database:"main",table:"items",indexKey:"a"});
  expect((await app.request(path,{method:"DELETE",body:"{"})).status).toBe(400);
  expect((await app.request(path,{method:"POST"})).status).toBe(400);
});
