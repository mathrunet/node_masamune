import { createTidbDirectClient, TidbDirectClient, SchemaManifest } from "../src/worker";

const manifest: SchemaManifest = { version: "1", tables: [{
  database: "app", table: "items", primaryKey: ["id"], vectorFields: [], columns: [
    { name: "id", sqlType: "VARCHAR(255)", nullable: false },
  ],
}] };

test("creates a client from trimmed environment variables", async () => {
  const transport = jest.fn().mockRejectedValue(new Error("offline"));
  const client = createTidbDirectClient(
    { TIDB_HOST: " gateway.example.com\n", TIDB_USERNAME: " user ", TIDB_PASSWORD: "\tpass\n" },
    { manifest, fetch: transport },
  );
  expect(client).toBeInstanceOf(TidbDirectClient);
  await expect(client.execute("app", "SELECT 1", [])).rejects.toThrow("TiDB query failed");
  expect(transport).toHaveBeenCalledTimes(1);
  const [url, init] = transport.mock.calls[0] as [string | URL, RequestInit];
  expect(String(url)).toContain("gateway.example.com");
  expect(String(url)).not.toMatch(/\s/);
  const authorization = new Headers(init.headers).get("Authorization") ?? "";
  expect(authorization).toBe(`Basic ${Buffer.from("user:pass").toString("base64")}`);
});

test("throws when credentials are missing or blank", () => {
  expect(() => createTidbDirectClient({ TIDB_HOST: "gateway.example.com", TIDB_USERNAME: "user" }, { manifest })).toThrow("Missing TiDB direct credentials.");
  expect(() => createTidbDirectClient({ TIDB_HOST: "  ", TIDB_USERNAME: "user", TIDB_PASSWORD: "pass" }, { manifest })).toThrow("Missing TiDB direct credentials.");
  expect(() => createTidbDirectClient(undefined, { manifest })).toThrow("Missing TiDB direct credentials.");
});

test("passes the timeout option to the client", () => {
  expect(() => createTidbDirectClient(
    { TIDB_HOST: "gateway.example.com", TIDB_USERNAME: "user", TIDB_PASSWORD: "pass" },
    { manifest, timeoutMs: 0 },
  )).toThrow("Invalid TiDB timeout.");
});
