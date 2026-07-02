import { deploy } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";
import { TidbWorkersOptions } from "../src/lib/types";

const execute = jest.fn();
const connect = jest.fn(() => ({ execute }));

jest.mock("@tidbcloud/serverless", () => ({
  connect,
}));

const allowRules = {
  version: "1",
  rules: {
    "database/*": {
      read: "allow",
      write: "allow",
    },
    "database/*/*": {
      read: "allow",
      write: "allow",
    },
  },
} as const;

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
          isActive: "TINYINT",
          created_at: "BIGINT",
          updated_at: "BIGINT",
        },
        rows: [
          {
            id: "user_1",
            name: "Alice",
            age: "12",
            isActive: "1",
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
        isActive: true,
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

  test("uses database path in connection URL as default database.", async () => {
    const app = deploy([Functions.tidb(dynamicOptions())]);

    const response = await app.request("http://localhost/tidb?table=users");

    expect(response.status).toBe(200);
    expect(connect).toHaveBeenCalledWith({
      url: "mysql://backend:backend-password@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/app_db",
      fullResult: true,
    });
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
});
