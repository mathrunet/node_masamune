import { deploy } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";
import { TidbWorkersOptions } from "../src/lib/types";

const execute = jest.fn();
const connect = jest.fn(() => ({ execute }));

jest.mock("@tidbcloud/serverless", () => ({
  connect,
}));

jest.mock("jose", () => ({
  importPKCS8: jest.fn(async () => "private-key"),
  importJWK: jest.fn(async () => "private-key"),
  SignJWT: class {
    constructor(private readonly payload: Record<string, unknown>) {}
    setProtectedHeader() {
      return this;
    }
    setIssuer() {
      return this;
    }
    setSubject() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    async sign() {
      return `signed-${this.payload.tidb_authorization}`;
    }
  },
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
    jwtIssuer: "test-issuer",
    jwtKid: "test-kid",
    jwtPrivateKeyPem: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    directReadUsername: "client_read",
    directWriteUsername: "client_write",
    directReadWriteUsername: "client_read_write",
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
          created_at: "BIGINT",
          updated_at: "BIGINT",
        },
        rows: [
          {
            id: "user_1",
            name: "Alice",
            created_at: 1,
            updated_at: 2,
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
    const tokenWorker = Functions.tidbToken(dynamicOptions());

    expect(worker.path).toBe("/tidb");
    expect(tokenWorker.path).toBe("/tidb/token");
  });

  test("reads rows from path based GET endpoint.", async () => {
    const app = deploy([Functions.tidb(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/tidb/database/app_db/users/user_1",
    );
    const body = (await response.json()) as { data: unknown[] };

    expect(response.status).toBe(200);
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

  test("issues scoped JWT without leaking backend password.", async () => {
    const app = deploy([Functions.tidbToken(dynamicOptions())]);

    const response = await app.request("http://localhost/tidb/token/database/app_db", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operations: ["read"],
        ttlSeconds: 60,
      }),
    });
    const body = (await response.json()) as {
      token: string;
      host: string;
      port: number;
      database: string;
      username: string;
      url?: string;
      password?: string;
    };

    expect(response.status).toBe(200);
    expect(body.token).toBe("signed-read-only");
    expect(body.host).toBe("gateway01.ap-northeast-1.prod.aws.tidbcloud.com");
    expect(body.port).toBe(4000);
    expect(body.database).toBe("app_db");
    expect(body.username).toBe("client_read");
    expect(JSON.stringify(body)).not.toContain("backend-password");
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
