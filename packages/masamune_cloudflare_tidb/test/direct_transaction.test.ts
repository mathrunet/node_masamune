import { connect } from "@tidbcloud/serverless";
import { TidbDirectClient } from "../src/lib/direct_client";
jest.mock("@tidbcloud/serverless", () => ({ connect: jest.fn() }));

function setup() {
  let active = 0, maximum = 0;
  const tx = {
    execute: jest.fn(async () => { active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--; return []; }),
    commit: jest.fn(async () => []), rollback: jest.fn(async () => []),
  };
  (connect as jest.Mock).mockReturnValue({ begin: jest.fn(async () => tx) });
  const client = new TidbDirectClient({ host: "fixture.invalid", username: "fixture", password: "private", manifest: {
    version: "1", tables: [{ database: "app", table: "items", columns: [], primaryKey: [], vectorFields: [] }],
  } });
  return { tx, client, maximum: () => maximum };
}
test("transaction内の並列呼び出しを直列化してからcommitする", async () => {
  const { client, tx, maximum } = setup();
  await client.transaction("app", async db => { await Promise.all([db.execute("app", "SELECT 1"), db.execute("app", "SELECT 2")]); });
  expect(maximum()).toBe(1); expect(tx.commit).toHaveBeenCalledTimes(1); expect(tx.rollback).not.toHaveBeenCalled();
});
test("query失敗を握り潰したcallbackでもrollbackし、SQLを秘匿する", async () => {
  const { client, tx } = setup();
  tx.execute.mockRejectedValueOnce(new Error("private SQL values"));
  await expect(client.transaction("app", async db => { await db.execute("app", "private SQL").catch(() => {}); })).rejects.toThrow("query failed");
  expect(tx.commit).not.toHaveBeenCalled(); expect(tx.rollback).toHaveBeenCalledTimes(1);
});
test("commit応答喪失は結果不明として返し、commitや書き込みを再送しない", async () => {
  const { client, tx } = setup(); tx.commit.mockRejectedValueOnce(new Error("private"));
  await expect(client.transaction("app", async db => db.execute("app", "UPDATE items"))).rejects.toThrow("outcome may be unknown");
  expect(tx.execute).toHaveBeenCalledTimes(1); expect(tx.commit).toHaveBeenCalledTimes(1); expect(tx.rollback).not.toHaveBeenCalled();
});


test.each([
  [{ status: 503, message: "private SQL password" }, "transient", 503, true],
  [{ status: 400, message: "private SQL password", details: { code: 1064 } }, "sql", 500, false],
  [{ status: 401, message: "private password" }, "configuration", 500, false],
  [{ status: 500, details: { code: 1064 }, message: "private SQL" }, "sql", 500, false],
  [{ status: 400, details: { code: 1213 }, message: "private SQL" }, "transient", 503, true],
])("driverの障害分類だけを公開し、SQLや資格情報を保持しない", async (failure, category, status, retryable) => {
  const { client, tx } = setup();
  tx.execute.mockRejectedValueOnce(failure);
  const error = await client.transaction("app", async db => db.execute("app", "SELECT secret")).catch(error => error);
  expect(error).toMatchObject({ name: "TidbDirectOperationError", category, status, retryable, phase: "query", outcomeUnknown: false });
  expect(JSON.stringify(error)).not.toContain("private");
  expect(error.cause).toBeUndefined();
  expect(tx.rollback).toHaveBeenCalledTimes(1);
  expect(tx.commit).not.toHaveBeenCalled();
});

test("commitの通信断は分類を保持し、安全な自動再送を許可しない", async () => {
  const { client, tx } = setup();
  tx.commit.mockRejectedValueOnce({ status: 503, message: "private" });
  const error = await client.transaction("app", async db => db.execute("app", "UPDATE items")).catch(error => error);
  expect(error).toMatchObject({ category: "transient", status: 503, retryable: false, phase: "commit", outcomeUnknown: true });
  expect(tx.commit).toHaveBeenCalledTimes(1);
  expect(tx.rollback).not.toHaveBeenCalled();
});


test("callbackがquery失敗を捕捉しても元の分類を保持する", async () => {
  const { client, tx } = setup();
  tx.execute.mockRejectedValueOnce({ status: 503 });
  await expect(client.transaction("app", async db => { await db.execute("app", "SELECT 1").catch(() => {}); }))
    .rejects.toMatchObject({ category: "transient", phase: "query", retryable: true });
  expect(tx.commit).not.toHaveBeenCalled();
});

test("rollbackの応答喪失は元分類を保ちつつ再送不可を伝える", async () => {
  const { client, tx } = setup();
  tx.execute.mockRejectedValueOnce({ status: 503 });
  tx.rollback.mockRejectedValueOnce(new Error("private"));
  await expect(client.transaction("app", async db => db.execute("app", "SELECT 1")))
    .rejects.toMatchObject({ category: "transient", outcomeUnknown: true, retryable: false });
});
