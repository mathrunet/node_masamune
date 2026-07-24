import { deploy } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";
import { fetchWithDigest } from "../src/lib/digest_auth";
import {
  TidbDataServiceManifest,
  TidbWorkersOptions,
} from "../src/lib/types";

const execute = jest.fn();
const connect = jest.fn(() => ({ execute }));

jest.mock("@tidbcloud/serverless", () => ({
  connect,
}));

const manifest: TidbDataServiceManifest = {
  version: "1",
  tables: {
    "app_db\u0000users": {
      database: "app_db",
      table: "users",
      columns: ["id", "name", "tags", "created_at", "updated_at"],
      endpoints: {
        get: { path: "/app_db/users/get", method: "GET" },
        list: { path: "/app_db/users/list", method: "GET" },
        count: { path: "/app_db/users/count", method: "GET" },
        upsert: { path: "/app_db/users/upsert", method: "POST" },
        update: { path: "/app_db/users/update", method: "POST" },
        delete: { path: "/app_db/users/delete", method: "POST" },
      },
    },
  },
};

const rules = {
  version: "1",
  rules: {
    database: {
      "*/*": { read: "allow", write: "allow" },
      "*/*/*": { read: "allow", write: "allow" },
    },
  },
} as const;

function options(
  values: Partial<TidbWorkersOptions> = {},
): TidbWorkersOptions {
  return {
    mode: "data-service",
    dataServiceAppId: "app-1",
    dataServiceBaseUrl: "https://data-service-test.example/api/v1beta",
    dataServicePublicKey: "public-key",
    dataServicePrivateKey: "private-key",
    dataServiceManifest: manifest,
    rules,
    ...values,
  };
}

describe("TiDB Data Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(globalThis, "fetch").mockRestore?.();
  });

  test("retries a Digest challenge with an RFC 7616 Authorization header", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("", {
          status: 401,
          headers: {
            "WWW-Authenticate":
              'Digest realm="tidb", nonce="nonce-1", algorithm=MD5, qop="auth"',
          },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchWithDigest(
      "https://digest-test.example/resource?value=1",
      { method: "GET" },
      { username: "public", password: "private" },
    );

    expect(response.status).toBe(200);
    const authenticated = fetchMock.mock.calls[1][1];
    const authorization = new Headers(authenticated?.headers).get(
      "Authorization",
    );
    expect(authorization).toContain('username="public"');
    expect(authorization).toContain('uri="/resource?value=1"');
    expect(authorization).toContain("qop=auth");
    expect(authorization).toMatch(/response="[a-f0-9]{32}"/);
  });

  test("uses Data Service without opening a mysql connection", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("", {
          status: 401,
          headers: {
            "WWW-Authenticate":
              'Digest realm="tidb", nonce="nonce-2", algorithm=SHA-256, qop="auth"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              columns: [
                { col: "id", data_type: "VARCHAR" },
                { col: "name", data_type: "VARCHAR" },
                { col: "score", data_type: "BIGINT" },
                { col: "active", data_type: "TINYINT" },
              ],
              rows: [{
                id: "user_1",
                name: "Alice",
                score: "42",
                active: "1",
              }],
            },
          }),
          { status: 200 },
        ),
      );
    const app = deploy([Functions.tidb(options())]);

    const response = await app.request(
      "http://localhost/tidb/database/app_db/users/user_1",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{
        id: "user_1",
        name: "Alice",
        score: 42,
        active: true,
      }],
    });
    expect(connect).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toContain(
      "/app/app-1/endpoint/app_db/users/get?id=user_1",
    );
  });

  test("converts supported where operators to endpoint parameters", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { columns: [{ name: "id" }], rows: [] },
        }),
        { status: 200 },
      ),
    );
    const app = deploy([Functions.tidb(options({
      dataServiceBaseUrl:
        "https://where-data-service-test.example/api/v1beta",
    }))]);
    const where = encodeURIComponent(JSON.stringify([
      { type: "greaterThanOrEqualTo", key: "created_at", value: 100 },
      { type: "whereIn", key: "name", value: ["Alice", "Bob"] },
    ]));

    const response = await app.request(
      `http://localhost/tidb/database/app_db/users?where=${where}`,
    );

    expect(response.status).toBe(200);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get("created_at_gte")).toBe("100");
    expect(requestedUrl.searchParams.get("name_in")).toBe("Alice,Bob");
    expect(requestedUrl.searchParams.get("limit")).toBe("1001");
  });

  test("rejects fallback scans that exceed maxScanRows", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            columns: [{ name: "id" }, { name: "tags" }],
            rows: [
              ["1", "[\"a\"]"],
              ["2", "[\"b\"]"],
              ["3", "[\"a\",\"b\"]"],
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const app = deploy([Functions.tidb(options({
      dataServiceBaseUrl:
        "https://scan-data-service-test.example/api/v1beta",
      maxScanRows: 2,
    }))]);
    const where = encodeURIComponent(JSON.stringify([
      { type: "arrayContains", key: "tags", value: "a" },
    ]));

    const response = await app.request(
      `http://localhost/tidb/database/app_db/users?where=${where}`,
    );

    expect(response.status).toBe(413);
  });

  test("keeps where-based PUT compatibility with bounded row updates", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              columns: [
                { col: "id", data_type: "VARCHAR" },
                { col: "name", data_type: "VARCHAR" },
                { col: "created_at", data_type: "BIGINT" },
                { col: "updated_at", data_type: "BIGINT" },
              ],
              rows: [{
                id: "user_1",
                name: "Alice",
                created_at: "1",
                updated_at: "2",
              }],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { columns: [], rows: [], result: {} } }),
          { status: 200 },
        ),
      );
    const app = deploy([Functions.tidb(options({
      dataServiceBaseUrl:
        "https://update-data-service-test.example/api/v1beta",
    }))]);
    const where = [{ type: "equalTo", key: "name", value: "Alice" }];

    const response = await app.request(
      "http://localhost/tidb/database/app_db/users",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ where, value: { name: "Bob" } }),
      },
    );

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toContain(
      "/app/app-1/endpoint/app_db/users/list",
    );
    expect(fetchMock.mock.calls[1][0]).toContain(
      "/app/app-1/endpoint/app_db/users/update",
    );
    const updateBody = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    ) as Record<string, unknown>;
    expect(updateBody.id).toBe("user_1");
    expect(updateBody.name).toBe("Bob");
    expect(updateBody.created_at).toBeUndefined();
  });
});
