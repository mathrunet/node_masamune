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
