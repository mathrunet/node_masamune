import { deploy } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";

const execute = jest.fn();
const createClient = jest.fn(() => ({ execute }));

jest.mock("@tursodatabase/serverless/compat", () => ({
  createClient,
}));

const allowRules = {
  version: "1",
  rules: {
    "database/*/table/*/*": {
      read: "allow",
      write: "allow",
    },
  },
} as const;

const originalTursoGroupName = process.env.TURSO_GROUP_NAME;

describe("Turso Cloudflare workers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    execute.mockResolvedValue({ rows: [] });
    jest.spyOn(globalThis, "fetch").mockRestore?.();
    process.env.TURSO_GROUP_NAME = originalTursoGroupName;
  });

  afterAll(() => {
    process.env.TURSO_GROUP_NAME = originalTursoGroupName;
  });

  test("exposes WorkersData using the existing Functions pattern", () => {
    const worker = Functions.turso({
      url: "libsql://example.turso.io",
      rules: allowRules,
    });
    const tokenWorker = Functions.tursoToken({
      url: "libsql://example.turso.io",
      rules: allowRules,
    });

    expect(worker.path).toBe("/turso");
    expect(tokenWorker.path).toBe("/turso/token");
  });

  test("denies access when rules reject the request", async () => {
    const app = deploy([
      Functions.turso({
        url: "libsql://example.turso.io",
        rules: {
          version: "1",
          rules: {
            "database/*/table/*/*": {
              read: "deny",
              write: "deny",
            },
          },
        },
      }),
    ]);

    const response = await app.request("http://localhost/turso?database=main&table=users&indexKey=user_1");
    const body = await response.json() as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("denied");
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  test("creates table, migrates missing columns, and inserts rows on POST", async () => {
    execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { name: "id", type: "TEXT" },
          { name: "created_at", type: "INTEGER" },
          { name: "updated_at", type: "INTEGER" },
          { name: "name", type: "TEXT" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "user_1",
            name: "Alice",
            created_at: 1,
            updated_at: 1,
          },
        ],
      });
    const app = deploy([
      Functions.turso({
        url: "libsql://example.turso.io",
        authToken: "server-token",
        rules: allowRules,
      }),
    ]);

    const response = await app.request("http://localhost/turso", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "main",
        table: "users",
        indexKey: "user_1",
        value: {
          name: "Alice",
        },
      }),
    });
    const body = await response.json() as { data: unknown[] };

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS"));
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS __masamune_schema_migrations"));
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      sql: expect.stringContaining("INSERT INTO"),
    }));
  });

  test("adds only missing columns during migration", async () => {
    execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { name: "id", type: "TEXT" },
          { name: "created_at", type: "INTEGER" },
          { name: "updated_at", type: "INTEGER" },
          { name: "name", type: "TEXT" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const app = deploy([
      Functions.turso({
        url: "libsql://example.turso.io",
        rules: allowRules,
      }),
    ]);

    const response = await app.request("http://localhost/turso", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "main",
        table: "users",
        value: {
          name: "Alice",
          age: 20,
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("ALTER TABLE \"users\" ADD COLUMN \"age\" INTEGER"));
  });

  test("shrinks token scopes by rules", async () => {
    const app = deploy([
      Functions.tursoToken({
        url: "libsql://example.turso.io",
        authToken: "token-secret",
        rules: {
          version: "1",
          rules: {
            "database/main/table/users/*": {
              read: "allow",
              write: "deny",
            },
          },
        },
      }),
    ]);

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "main",
        scope: [
          {
            table: "users",
            operations: ["read", "write"],
          },
        ],
        ttlSeconds: 60,
      }),
    });
    const body = await response.json() as { token: string; expiresAt: number };

    expect(response.status).toBe(200);
    expect(body.token).toContain(".");
    expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test("issues Turso database tokens through the Platform API when configured", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ jwt: "platform-jwt" }),
    } as Response);
    const app = deploy([
      Functions.tursoToken({
        url: "libsql://example.turso.io",
        organizationName: "example-org",
        platformApiToken: "platform-token",
        rules: allowRules,
      }),
    ]);

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "main",
        scope: [
          {
            table: "users",
            operations: ["read"],
          },
        ],
        ttlSeconds: 60,
      }),
    });
    const body = await response.json() as { token: string };

    expect(response.status).toBe(200);
    expect(body.token).toBe("platform-jwt");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/organizations/example-org/databases/main/auth/tokens?expiration=60s&authorization=full-access"),
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("uses TURSO_GROUP_NAME from environment when creating databases", async () => {
    process.env.TURSO_GROUP_NAME = "primary-group";
    const fetchMock = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ database: { hostname: "libsql://envgroupdb.turso.io" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ jwt: "database-token" }),
      } as Response);
    const app = deploy([
      Functions.turso({
        organizationName: "example-org",
        platformApiToken: "platform-token",
        rules: allowRules,
      }),
    ]);

    const response = await app.request("http://localhost/turso?database=envgroupdb&table=users");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/organizations/example-org/databases"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "envgroupdb",
          group: "primary-group",
        }),
      }),
    );
  });

  test("returns an access-time error when database group is not configured", async () => {
    delete process.env.TURSO_GROUP_NAME;
    const fetchMock = jest.spyOn(globalThis, "fetch");
    const app = deploy([
      Functions.turso({
        organizationName: "example-org",
        platformApiToken: "platform-token",
        rules: allowRules,
      }),
    ]);

    const response = await app.request("http://localhost/turso?database=missinggroupdb&table=users");
    const body = await response.json() as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("groupName or TURSO_GROUP_NAME is required to create Turso databases.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
