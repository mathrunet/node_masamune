import {
  deploy,
  WorkersAuthAdapterBase,
} from "@mathrunet/masamune_cloudflare";
import { MiddlewareHandler } from "hono";
import { Functions } from "../src/functions";
import {
  applyRequestDatabasePrefix,
  normalizeDatabasePrefix,
} from "../src/lib/database_prefix";
import { TidbWorkersOptions } from "../src/lib/types";

const execute = jest.fn();
const connect = jest.fn(() => ({ execute }));

jest.mock("@tidbcloud/serverless", () => ({
  connect,
}));

const allowRules = {
  version: "1",
  rules: {
    database: {
      "*": {
        read: "allow",
        write: "allow",
      },
      "*/*": {
        read: "allow",
        write: "allow",
      },
      "*/*/*": {
        read: "allow",
        write: "allow",
      },
    },
  },
} as const;

const serverScopedRules = {
  version: "1",
  rules: {
    database: {
      "app_db/generationResults/*": {
        read: "server",
        write: "server",
      },
      "app_db/users/*": {
        read: "authenticated",
        write: "server",
      },
    },
  },
} as const;

/**
 * Authentication adapter that emulates a signed in client without server
 * credentials.
 */
class ClientAuthAdapter extends WorkersAuthAdapterBase {
  constructor(uid: string) {
    super();
    this.uid = uid;
  }

  private readonly uid: string;

  build(): MiddlewareHandler {
    return async (context, next) => {
      this.setAuthContext(context, { uid: this.uid });
      await next();
    };
  }
}

function dynamicOptions(
  options: Partial<TidbWorkersOptions> = {},
): TidbWorkersOptions {
  return {
    connectionUrl:
      "mysql://backend:backend-password@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/app_db",
    rules: allowRules,
    ...options,
  };
}

function clientOptions(
  options: Partial<TidbWorkersOptions> = {},
): TidbWorkersOptions {
  return dynamicOptions({
    rules: serverScopedRules,
    auth: new ClientAuthAdapter("user_1"),
    ...options,
  });
}

function mockExecute(): void {
  execute.mockImplementation(async (sql: string) => {
    if (sql.includes("INFORMATION_SCHEMA.SCHEMATA")) {
      return {
        types: { SCHEMA_NAME: "VARCHAR" },
        rows: [{ SCHEMA_NAME: "app_db" }],
        rowCount: 1,
        rowsAffected: 0,
        lastInsertId: null,
      };
    }
    if (sql.startsWith("SHOW COLUMNS")) {
      return {
        types: { Field: "VARCHAR", Type: "VARCHAR" },
        rows: [
          { Field: "id", Type: "varchar(255)" },
          { Field: "name", Type: "text" },
          { Field: "isActive", Type: "bigint" },
        ],
        rowCount: 2,
        rowsAffected: 0,
        lastInsertId: null,
      };
    }
    if (sql.startsWith("SELECT COUNT")) {
      return {
        types: { count: "BIGINT" },
        rows: [{ count: 2 }],
        rowCount: 1,
        rowsAffected: 0,
        lastInsertId: null,
      };
    }
    if (sql.startsWith("SELECT *")) {
      return {
        types: {
          id: "VARCHAR",
          name: "TEXT",
          age: "BIGINT",
          isActive: "BIGINT",
          created_at: "BIGINT",
          updated_at: "BIGINT",
        },
        rows: [
          {
            id: "user_1",
            name: "Alice",
            age: "12",
            isActive: "0",
            created_at: "1",
            updated_at: "2",
          },
        ],
        rowCount: 1,
        rowsAffected: 0,
        lastInsertId: null,
      };
    }
    return {
      types: null,
      rows: [],
      rowCount: 0,
      rowsAffected: 1,
      lastInsertId: null,
    };
  });
}

describe("TiDB Cloudflare workers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute();
  });

  test("exposes WorkersData using the existing Functions pattern", () => {
    const worker = Functions.tidb(dynamicOptions());

    expect(worker.path).toBe("/tidb");
  });

  test("normalizes adapter database prefixes", () => {
    expect(normalizeDatabasePrefix(undefined)).toBeUndefined();
    expect(normalizeDatabasePrefix("___")).toBeUndefined();
    expect(normalizeDatabasePrefix(" dev___ ")).toBe("dev_");
    expect(
      applyRequestDatabasePrefix(
        { databasePrefix: "tenant_" },
        normalizeDatabasePrefix("dev"),
      ).databasePrefix,
    ).toBe("tenant_dev_");
    expect(() => normalizeDatabasePrefix("invalid prefix")).toThrow(
      "Invalid prefix",
    );
  });

  test("reads rows from path based GET endpoint.", async () => {
    const app = deploy([Functions.tidb(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/tidb/database/app_db/users/user_1",
    );
    const body = (await response.json()) as { data: unknown[] };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      {
        id: "user_1",
        name: "Alice",
        age: 12,
        isActive: false,
        created_at: 1,
        updated_at: 2,
      },
    ]);
    expect(body.data).toHaveLength(1);
    expect(connect).toHaveBeenCalledWith({
      url: "mysql://backend:backend-password@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/app_db",
      fullResult: true,
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INFORMATION_SCHEMA.SCHEMATA"),
      ["app_db"],
      { fullResult: true },
    );
  });

  test("reads from the prefixed physical database.", async () => {
    const app = deploy([Functions.tidb(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/tidb/database/app_db/users/user_1?prefix=dev___",
    );

    expect(response.status).toBe(200);
    expect(connect).toHaveBeenCalledWith({
      url: "mysql://backend:backend-password@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/dev_app_db",
      fullResult: true,
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INFORMATION_SCHEMA.SCHEMATA"),
      ["dev_app_db"],
      { fullResult: true },
    );
  });

  test("rejects the legacy root endpoint without a database path.", async () => {
    const app = deploy([Functions.tidb(dynamicOptions())]);

    const response = await app.request("http://localhost/tidb?table=users");

    expect(response.status).toBe(404);
    expect(connect).not.toHaveBeenCalled();
  });

  test("writes with TiDB upsert SQL.", async () => {
    const app = deploy([Functions.tidb(dynamicOptions())]);

    const response = await app.request("http://localhost/tidb/database/app_db/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        value: {
          id: "user_1",
          name: "Alice",
          isActive: false,
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("ON DUPLICATE KEY UPDATE"),
      expect.any(Array),
      { fullResult: true },
    );
  });

  test("returns 404 when database does not exist.", async () => {
    execute.mockImplementation(async (sql: string) => {
      if (sql.includes("INFORMATION_SCHEMA.SCHEMATA")) {
        return {
          types: { SCHEMA_NAME: "VARCHAR" },
          rows: [],
          rowCount: 0,
          rowsAffected: 0,
          lastInsertId: null,
        };
      }
      return {
        types: null,
        rows: [],
        rowCount: 0,
        rowsAffected: 0,
        lastInsertId: null,
      };
    });
    const app = deploy([Functions.tidb(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/tidb/database/missing/users",
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toContain("Database was not found");
  });

  test.each([
    ["GET", "http://localhost/tidb/database/app_db/generationResults", undefined],
    ["GET", "http://localhost/tidb/database/app_db/generationResults/result_1", undefined],
    [
      "POST",
      "http://localhost/tidb/database/app_db/generationResults",
      JSON.stringify({ value: { id: "result_1", name: "Alice" } }),
    ],
    [
      "PUT",
      "http://localhost/tidb/database/app_db/generationResults/result_1",
      JSON.stringify({ value: { name: "Alice" } }),
    ],
    [
      "DELETE",
      "http://localhost/tidb/database/app_db/generationResults/result_1",
      JSON.stringify({}),
    ],
  ])(
    "denies %s from a client for server scoped rules.",
    async (method, url, body) => {
      const app = deploy([Functions.tidb(clientOptions())]);

      const response = await app.request(url, {
        method,
        ...(body
          ? {
            headers: { "Content-Type": "application/json" },
            body,
          }
          : {}),
      });
      const payload = (await response.json()) as { error: string };

      expect(response.status).toBe(403);
      expect(payload.error).toBe("denied");
      expect(execute).not.toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM"),
        expect.anything(),
        expect.anything(),
      );
      expect(execute).not.toHaveBeenCalledWith(
        expect.stringContaining("ON DUPLICATE KEY UPDATE"),
        expect.anything(),
        expect.anything(),
      );
    },
  );

  test("allows authenticated reads while denying client writes.", async () => {
    const app = deploy([Functions.tidb(clientOptions())]);

    const read = await app.request(
      "http://localhost/tidb/database/app_db/users/user_1",
    );
    const write = await app.request(
      "http://localhost/tidb/database/app_db/users/user_1",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const denied = (await write.json()) as { error: string };

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
    expect(denied.error).toBe("denied");
  });

  test("denies reads without authentication for authenticated rules.", async () => {
    const app = deploy([
      Functions.tidb(dynamicOptions({ rules: serverScopedRules })),
    ]);

    const response = await app.request(
      "http://localhost/tidb/database/app_db/users/user_1",
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(payload.error).toBe("denied");
  });

  test("evaluates server scoped rules with the server access token.", async () => {
    const app = deploy([
      Functions.tidb(clientOptions({ serverAccessToken: "server-token" })),
    ]);

    const response = await app.request(
      "http://localhost/tidb/database/app_db/generationResults/result_1",
      {
        headers: { "x-masamune-server-token": "server-token" },
      },
    );

    expect(response.status).toBe(200);
  });

  test("denies server scoped rules with an invalid server access token.", async () => {
    const app = deploy([
      Functions.tidb(clientOptions({ serverAccessToken: "server-token" })),
    ]);

    const response = await app.request(
      "http://localhost/tidb/database/app_db/generationResults/result_1",
      {
        headers: { "x-masamune-server-token": "server-token-invalid" },
      },
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(payload.error).toBe("denied");
  });

  test("uses the configured server access header name.", async () => {
    const options = clientOptions({
      serverAccessToken: "server-token",
      serverAccessHeader: "x-internal-token",
    });

    const allowed = await deploy([Functions.tidb(options)]).request(
      "http://localhost/tidb/database/app_db/generationResults/result_1",
      { headers: { "x-internal-token": "server-token" } },
    );
    const denied = await deploy([Functions.tidb(options)]).request(
      "http://localhost/tidb/database/app_db/generationResults/result_1",
      { headers: { "x-masamune-server-token": "server-token" } },
    );

    expect(allowed.status).toBe(200);
    expect(denied.status).toBe(403);
  });
});
