import { Hono } from "hono";
import { registerD1 } from "../src/lib/route";
import { D1Client } from "../src/lib/client";
import { executeCrud } from "../src/lib/crud";
import { manifest, SqliteBinding } from "./sqlite";
const request = { database: "main", table: "items" };
let binding: SqliteBinding; let client: D1Client;
beforeEach(() => { binding = new SqliteBinding(); client = new D1Client(binding.withSession(), manifest, "main"); });
afterEach(() => binding.db.close());
test("型・日本語・null・文字列を欠落なく往復する", async () => {
  await executeCrud(client, "POST", { ...request, value: { id: "a", name: '日本語 {"x":1}', value: 42, flag: true, tags: [1, null, "猫"] } });
  const rows = await executeCrud(client, "GET", request) as any[];
  expect(rows[0]).toMatchObject({ id: "a", name: '日本語 {"x":1}', value: 42, flag: true, tags: [1, null, "猫"] });
  await executeCrud(client, "PUT", { ...request, indexKey: "a", value: { value: 43 } });
  expect(await executeCrud(client, "GET", { ...request, count: true })).toBe(1);
  await executeCrud(client, "DELETE", { ...request, indexKey: "a" }); expect(await executeCrud(client, "GET", request)).toEqual([]);
});
test("query・sort・limit・array・NULLをSQLiteで実行する", async () => {
  for(let i = 0;i < 3;i++)await executeCrud(client, "POST", { ...request, value: { id: String(i), value: i, name: i === 0 ? null : "abc", tags: [i, "猫"] } });
  for(const type of ["arrayContains", "arrayContainsAny"]) { expect(await executeCrud(client, "GET", { ...request, where: [{ key: "tags", type, value: type === "arrayContains" ? "猫" : ["猫"] }] })).toHaveLength(3); }
  expect(await executeCrud(client, "GET", { ...request, where: [{ key: "name", type: "like", value: "b" }], orderBy: [{ key: "value", descending: true }], limit: 1 })).toMatchObject([{ value: 2 }]);
  expect(await executeCrud(client, "GET", { ...request, where: [{ key: "name", type: "whereIn", value: [null] }] })).toHaveLength(1);
  expect(await executeCrud(client, "GET", { ...request, where: [{ key: "value", type: "greaterThan", value: 0 }, { key: "value", type: "lessThan", value: 2 }] })).toHaveLength(1);
});
test("不正識別子・unsafe整数・bulk変更を拒否する", async () => {
  await expect(executeCrud(client, "POST", { ...request, value: { id: "x", value: 9007199254740992 } })).rejects.toThrow();
  await expect(executeCrud(client, "GET", { ...request, where: [{ key: 'id;DROP TABLE items', value: 1 }] })).rejects.toThrow();
  await expect(executeCrud(client, "DELETE", request)).rejects.toThrow();
});
function app(rules: any = { version: "1", rules: { database: { "**": { read: "allow", write: "allow" } } } }) { return registerD1(new Hono<any>(), { schemaManifest: manifest, bindings: { main: "DB" }, rules }); }
async function send(a: Hono, path: string, method = "GET", body?: unknown) { return a.request(path, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }, { DB: binding, FLAVOR: "prod" }); }
test("空rulesは拒否しSQLを実行しない", async () => { const r = await send(app({}), "/database/main/items"); expect(r.status).toBe(403); expect(binding.version).toBe(0); });
test("bookmarkを引継ぎ、未登録DBを拒否する", async () => { const a = app(); const r = await send(a, "/database/main/items?bookmark=0000000002"); expect(r.status).toBe(200); expect(binding.bookmarks.at(-1)).toBe("0000000002"); expect((await r.json() as any).bookmark).toBeTruthy(); expect((await send(a, "/database/prod/items")).status).toBe(400); });
test("batch途中失敗で全操作をrollbackする", async () => {
  const ops = [{ method: "POST", table: "items", value: { id: "a", value: 1 } }, { method: "POST", table: "items", value: { id: "b", value: -1 } }];
  expect((await send(app(), "/batch/main", "POST", { operations: ops })).status).toBe(502);
  expect(await executeCrud(client, "GET", request)).toEqual([]);
  ops[1].value.value = 2; expect((await send(app(), "/batch/main", "POST", { operations: ops })).status).toBe(200); expect(await executeCrud(client, "GET", request)).toHaveLength(2);
});
test("JSONカラムの文字列を見た目でオブジェクト化しない", async () => {
  await executeCrud(client, "POST", { ...request, value: { id: "a", tags: '{"user":"文字列"}' } });
  expect((await executeCrud(client, "GET", request) as any[])[0].tags).toBe('{"user":"文字列"}');
});
test("別ユーザーのpath rulesとfield依存認可を拒否する", async () => {
  const a = new Hono<any>(); a.use("*", async (c, next) => { c.set("authentication", { uid: "alice" }); await next(); });
  registerD1(a, { schemaManifest: manifest, bindings: { main: "DB" }, rules: { version: "1", rules: { database: { "main/items/{uid}": { read: { type: "path", param: "uid" }, write: { type: "path", param: "uid" } } } } } });
  expect((await send(a, "/database/main/items/alice", "POST", { value: { name: "自分" } })).status).toBe(200);
  expect((await send(a, "/database/main/items/bob", "POST", { value: { name: "他人" } })).status).toBe(403);
  const fieldApp = new Hono<any>(); fieldApp.use("*", async (c, next) => { c.set("authentication", { uid: "alice" }); await next(); });
  registerD1(fieldApp, { schemaManifest: manifest, bindings: { main: "DB" }, rules: { version: "1", rules: { database: { "**": { read: { type: "field", field: "name" } } } } } });
  expect((await send(fieldApp, "/database/main/items")).status).toBe(400);
});

test("createだけの許可ではupsertで既存行を上書きできない", async () => {
  await executeCrud(client, "POST", { ...request, value: { id: "a", name: "保護対象" } });
  const createOnly = app({ version: "1", rules: { database: { "**": { create: "allow", update: "deny" } } } });
  expect((await send(createOnly, "/database/main/items/a", "POST", { value: { name: "変更" } })).status).toBe(403);
  expect((await executeCrud(client, "GET", request) as any[])[0].name).toBe("保護対象");
});
