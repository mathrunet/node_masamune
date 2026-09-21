import { TidbDirectClient, SchemaManifest, decodeDirectRow } from "../src/lib/direct_client";

const manifest: SchemaManifest = { version: "1", tables: [{
  database: "app", table: "items", primaryKey: ["id"], vectorFields: [], columns: [
    { name: "id", sqlType: "VARCHAR(255)", nullable: false },
    { name: "amount", sqlType: "DECIMAL(30,10)", nullable: true },
    { name: "large", sqlType: "BIGINT", nullable: true },
    { name: "flag", sqlType: "BOOLEAN", nullable: true },
    { name: "data", sqlType: "JSON", nullable: true },
  ],
}] };

test("manifest外のtable・columnと不正な識別子を拒否する", () => {
  const client = new TidbDirectClient({ host: "fixture.invalid", username: "fixture", password: "fixture", manifest });
  expect(() => client.table("other", "items")).toThrow();
  expect(() => client.column(manifest.tables[0], "id;DROP TABLE")).toThrow();
});

test("大きな整数と小数の精度、NULL、JSON、booleanを保持する", () => {
  const decoded = decodeDirectRow({ id: "1", amount: "12345678901234567890.1234567890", large: "9007199254740993", flag: "0", data: '{"name":"日本語"}' }, manifest.tables[0]);
  expect(decoded).toEqual({ id: "1", amount: "12345678901234567890.1234567890", large: "9007199254740993", flag: false, data: { name: "日本語" } });
  expect(decodeDirectRow({ amount: null }, manifest.tables[0])).toEqual({ amount: null });
});

test("通信失敗を再送せず、SQLと資格情報を例外へ含めない", async () => {
  const transport = jest.fn().mockRejectedValue(new Error("secret SQL password"));
  const client = new TidbDirectClient({ host: "fixture.invalid", username: "fixture", password: "secret", manifest, fetch: transport });
  await expect(client.execute("app", "SELECT ?", ["private"])).rejects.toThrow("TiDB query failed");
  expect(transport).toHaveBeenCalledTimes(1);
});

test("timeoutでbody受信をabortする", async () => {
  let aborted = false;
  const transport: typeof fetch = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        controller.error(new DOMException("aborted", "AbortError"));
      });
    },
  }));
  const client = new TidbDirectClient({ host: "fixture.invalid", username: "fixture", password: "fixture", manifest, fetch: transport, timeoutMs: 10 });
  await expect(client.execute("app", "SELECT 1")).rejects.toThrow("TiDB query failed");
  expect(aborted).toBe(true);
});
