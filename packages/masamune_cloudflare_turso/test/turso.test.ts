import {
  deploy,
  WorkersAuthAdapterBase,
} from "@mathrunet/masamune_cloudflare";
import type { MiddlewareHandler } from "hono";
import { Functions } from "../src/functions";
import { createTursoRulesEngine } from "../src/lib/rules";
import { TursoWorkersOptions } from "../src/lib/types";

const execute = jest.fn();
const createClient = jest.fn(() => ({ execute }));

jest.mock("@tursodatabase/serverless/compat", () => ({
  createClient,
}));

const allowRules = {
  version: "1",
  rules: {
    "database/*": {
      read: "allow",
      write: "allow",
    },
    "database/*/table/*/*": {
      read: "allow",
      write: "allow",
    },
  },
} as const;

const originalTursoGroupName = process.env.TURSO_GROUP_NAME;

class StaticAuthAdapter extends WorkersAuthAdapterBase {
  constructor(private readonly uid: string) {
    super();
  }

  build(): MiddlewareHandler {
    return async (context, next) => {
      this.setAuthContext(context, { uid: this.uid });
      await next();
    };
  }
}

function dynamicOptions(
  options: Partial<TursoWorkersOptions> = {},
): TursoWorkersOptions {
  return {
    organizationName: "example-org",
    groupName: "primary-group",
    platformApiToken: "platform-token",
    rules: allowRules,
    ...options,
  };
}

function mockExistingDatabase({
  url,
  databaseToken = "database-token",
}: {
  url: string;
  databaseToken?: string;
}): jest.SpiedFunction<typeof fetch> {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ database: { Hostname: url } }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ jwt: databaseToken }),
    } as Response);
}

function mockCreatedDatabase({
  url,
  databaseToken = "database-token",
}: {
  url: string;
  databaseToken?: string;
}): jest.SpiedFunction<typeof fetch> {
  return jest
    .spyOn(globalThis, "fetch")
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
      json: async () => ({ database: { Hostname: url } }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ jwt: databaseToken }),
    } as Response);
}

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
    const worker = Functions.turso(dynamicOptions());
    const tokenWorker = Functions.tursoToken(dynamicOptions());

    expect(worker.path).toBe("/turso");
    expect(tokenWorker.path).toBe("/turso/token");
  });

  test("denies access when rules reject the request", async () => {
    mockExistingDatabase({ url: "libsql://denydb.turso.io" });
    const app = deploy([
      Functions.turso(
        dynamicOptions({
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
      ),
    ]);

    const response = await app.request(
      "http://localhost/turso?database=denydb&table=users&indexKey=user_1",
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("denied");
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith({
      url: "libsql://denydb.turso.io",
      authToken: "database-token",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  test("reads rows from path based GET endpoint", async () => {
    mockExistingDatabase({ url: "libsql://pathdb.turso.io" });
    execute.mockResolvedValueOnce({
      rows: [
        {
          id: "user_1",
          name: "Alice",
          created_at: 1,
          updated_at: 1,
        },
      ],
    });
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/turso/database/pathdb/users" +
        "?where=%5B%7B%22type%22%3A%22equalTo%22%2C%22key%22%3A%22name%22%2C%22value%22%3A%22Alice%22%7D%5D" +
        "&orderBy=%5B%7B%22key%22%3A%22created_at%22%2C%22descending%22%3Atrue%7D%5D" +
        "&limit=20",
    );
    const body = (await response.json()) as { data: unknown[] };

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(createClient).toHaveBeenCalledWith({
      url: "libsql://pathdb.turso.io",
      authToken: "database-token",
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('FROM "users"'),
      }),
    );
  });

  test("normalizes Turso Platform API Hostname to libsql URL", async () => {
    mockExistingDatabase({ url: "hostname-db-mathru.turso.io" });
    execute.mockResolvedValueOnce({ rows: [] });
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/turso/database/hostname-db/users",
    );

    expect(response.status).toBe(200);
    expect(createClient).toHaveBeenCalledWith({
      url: "libsql://hostname-db-mathru.turso.io",
      authToken: "database-token",
    });
  });

  test("creates table, migrates missing columns, and inserts rows on POST", async () => {
    mockExistingDatabase({ url: "libsql://postdb.turso.io" });
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
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request("http://localhost/turso/database/postdb/users/user_1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        value: {
          name: "Alice",
        },
      }),
    });
    const body = (await response.json()) as { data: unknown[] };

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS"),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining(
        "CREATE TABLE IF NOT EXISTS __masamune_schema_migrations",
      ),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO"),
      }),
    );
  });

  test("adds only missing columns during migration", async () => {
    mockExistingDatabase({ url: "libsql://migrationdb.turso.io" });
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
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request("http://localhost/turso", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "migrationdb",
        table: "users",
        value: {
          name: "Alice",
          age: 20,
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE "users" ADD COLUMN "age" INTEGER'),
    );
  });

  test("issues read-only database tokens by database rules", async () => {
    mockExistingDatabase({
      url: "libsql://scopedb.turso.io",
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ jwt: "scoped-token" }),
    } as Response);
    const app = deploy([
      Functions.tursoToken(
        dynamicOptions({
          rules: {
            version: "1",
            rules: {
              "database/scopedb": {
                read: "allow",
                write: "deny",
              },
            },
          },
        }),
      ),
    ]);

    const response = await app.request("http://localhost/turso/token/database/scopedb", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ttlSeconds: 60,
        operations: ["read"],
      }),
    });
    const body = (await response.json()) as {
      token: string;
      expiresAt: number;
      url: string;
      readMode: string;
      writeMode: string;
    };

    expect(response.status).toBe(200);
    expect(body.token).toBe("scoped-token");
    expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(body.url).toBe("libsql://scopedb.turso.io");
    expect(body.readMode).toBe("direct");
    expect(body.writeMode).toBe("none");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/organizations/example-org/databases/scopedb/auth/tokens?expiration=60s&authorization=read-only",
      ),
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("uses Cloudflare env secret before platformApiToken option", async () => {
    const fetchMock = mockExistingDatabase({
      url: "libsql://env-priority-db.turso.io",
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ jwt: "env-priority-token" }),
    } as Response);
    const app = deploy([
      Functions.tursoToken(
        dynamicOptions({
          organizationName: "option-org",
          groupName: "option-group",
          platformApiToken: "option-token",
          rules: {
            version: "1",
            rules: {
              "database/env-priority-db": {
                read: "allow",
                write: "deny",
              },
            },
          },
        }),
      ),
    ]);

    const response = await app.request(
      "http://localhost/turso/token/database/env-priority-db",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ttlSeconds: 60,
        }),
      },
      {
        TURSO_ORGANIZATION_NAME: "env-org",
        TURSO_GROUP_NAME: "env-group",
        TURSO_PLATFORM_API_TOKEN: "env-token",
      },
    );
    const body = (await response.json()) as { token: string };

    expect(response.status).toBe(200);
    expect(body.token).toBe("env-priority-token");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/organizations/env-org/databases/env-priority-db"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer env-token",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/organizations/env-org/databases/env-priority-db/auth/tokens?expiration=60s&authorization=read-only",
      ),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer env-token",
        }),
      }),
    );
  });

  test("allows database tokens when path parameter matches authenticated user", async () => {
    mockExistingDatabase({
      url: "libsql://user-1.turso.io",
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ jwt: "user-token" }),
    } as Response);
    const app = deploy(
      [
        Functions.tursoToken(
          dynamicOptions({
            rules: {
              version: "1",
              rules: {
                "database/{uid}": {
                  read: { type: "pathParamMatch", param: "uid" },
                  write: "deny",
                },
              },
            },
          }),
        ),
      ],
      { auth: new StaticAuthAdapter("user-1") },
    );

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "user-1",
        ttlSeconds: 60,
      }),
    });
    const body = (await response.json()) as { token: string; url: string };

    expect(response.status).toBe(200);
    expect(body.token).toBe("user-token");
    expect(body.url).toBe("libsql://user-1.turso.io");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/organizations/example-org/databases/user-1/auth/tokens?expiration=60s&authorization=read-only",
      ),
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("marks database tokens as functions write mode for server-only writes", async () => {
    mockExistingDatabase({
      url: "libsql://server-write-user.turso.io",
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ jwt: "server-write-token" }),
    } as Response);
    const app = deploy(
      [
        Functions.tursoToken(
          dynamicOptions({
            rules: {
              version: "1",
              rules: {
                "database/{uid}": {
                  read: { type: "pathParamMatch", param: "uid" },
                  write: {
                    type: "pathParamMatch",
                    param: "uid",
                    serverOnly: true,
                  },
                },
              },
            },
          }),
        ),
      ],
      { auth: new StaticAuthAdapter("server-write-user") },
    );

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "server-write-user",
        ttlSeconds: 60,
      }),
    });
    const body = (await response.json()) as {
      token: string;
      url: string;
      writeMode: string;
    };

    expect(response.status).toBe(200);
    expect(body.token).toBe("server-write-token");
    expect(body.url).toBe("libsql://server-write-user.turso.io");
    expect(body.writeMode).toBe("functions");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/organizations/example-org/databases/server-write-user/auth/tokens?expiration=60s&authorization=read-only",
      ),
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("returns functions targets without issuing a token when read and write are server-only", async () => {
    const fetchMock = mockExistingDatabase({
      url: "libsql://server-only-user.turso.io",
    });
    const app = deploy(
      [
        Functions.tursoToken(
          dynamicOptions({
            rules: {
              version: "1",
              rules: {
                "database/{uid}": {
                  read: { type: "serverOnly" },
                  write: { type: "serverOnly" },
                },
                "database/{uid}/table/*/*": {
                  read: { type: "serverOnly" },
                  write: { type: "serverOnly" },
                },
              },
            },
          }),
        ),
      ],
      { auth: new StaticAuthAdapter("server-only-user") },
    );

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "server-only-user",
        ttlSeconds: 60,
        targets: [
          {
            table: "posts",
            operations: ["read", "write"],
          },
        ],
      }),
    });
    const body = (await response.json()) as {
      token?: string;
      url?: string;
      readMode: string;
      writeMode: string;
      targets: {
        table: string;
        operations: string[];
        readMode: string;
        writeMode: string;
      }[];
    };

    expect(response.status).toBe(200);
    expect(body.token).toBeUndefined();
    expect(body.url).toBeUndefined();
    expect(body.readMode).toBe("functions");
    expect(body.writeMode).toBe("functions");
    expect(body.targets).toEqual([
      {
        table: "posts",
        operations: ["read", "write"],
        readMode: "functions",
        writeMode: "functions",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("switches scoped direct reads to functions when table rules require field matching", async () => {
    const fetchMock = mockExistingDatabase({
      url: "libsql://field-scope.turso.io",
    });
    const app = deploy(
      [
        Functions.tursoToken(
          dynamicOptions({
            rules: {
              version: "1",
              rules: {
                "database/field-scope": {
                  read: "allow",
                  write: "deny",
                },
                "database/field-scope/table/posts/*": {
                  read: { type: "fieldMatch", field: "ownerId" },
                },
              },
            },
          }),
        ),
      ],
      { auth: new StaticAuthAdapter("user-1") },
    );

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "field-scope",
        ttlSeconds: 60,
        targets: [
          {
            table: "posts",
            operations: ["read"],
          },
        ],
      }),
    });
    const body = (await response.json()) as {
      token?: string;
      readMode: string;
      writeMode: string;
      targets: {
        table: string;
        operations: string[];
        readMode: string;
      }[];
    };

    expect(response.status).toBe(200);
    expect(body.token).toBeUndefined();
    expect(body.readMode).toBe("functions");
    expect(body.writeMode).toBe("none");
    expect(body.targets).toEqual([
      {
        table: "posts",
        operations: ["read"],
        readMode: "functions",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("denies database tokens when path parameter does not match authenticated user", async () => {
    mockExistingDatabase({
      url: "libsql://user-2.turso.io",
    });
    const app = deploy(
      [
        Functions.tursoToken(
          dynamicOptions({
            rules: {
              version: "1",
              rules: {
                "database/{uid}": {
                  read: { type: "pathParamMatch", param: "uid" },
                  write: "deny",
                },
              },
            },
          }),
        ),
      ],
      { auth: new StaticAuthAdapter("user-1") },
    );

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "user-2",
        ttlSeconds: 60,
      }),
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("denied");
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  test("evaluates fieldMatch with serverOnly only on server requests", async () => {
    const engine = createTursoRulesEngine({
      version: "1",
      rules: {
        "database/main/table/posts/*": {
          update: {
            type: "fieldMatch",
            field: "ownerId",
            serverOnly: true,
          },
        },
      },
    });

    const direct = await engine.evaluate({
      path: "database/main/table/posts/post-1",
      operation: "update",
      authentication: { uid: "user-1" },
      fetchDocument: async () => ({ ownerId: "user-1" }),
    });
    const server = await engine.evaluate({
      path: "database/main/table/posts/post-1",
      operation: "update",
      authentication: { uid: "user-1" },
      fetchDocument: async () => ({ ownerId: "user-1" }),
      server: true,
    });

    expect(direct.allowed).toBe(false);
    expect(server.allowed).toBe(true);
  });

  test("denies database tokens when database rules do not allow read", async () => {
    mockExistingDatabase({
      url: "libsql://denytokendb.turso.io",
    });
    const app = deploy([
      Functions.tursoToken(
        dynamicOptions({
          rules: {
            version: "1",
            rules: {
              "database/denytokendb": {
                read: "deny",
                write: "deny",
              },
            },
          },
        }),
      ),
    ]);

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "denytokendb",
        ttlSeconds: 60,
      }),
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("denied");
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  test("issues Turso database tokens through the Platform API when configured", async () => {
    const fetchMock = mockExistingDatabase({
      url: "libsql://tokendb.turso.io",
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ jwt: "platform-jwt" }),
    } as Response);
    const app = deploy([Functions.tursoToken(dynamicOptions())]);

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "tokendb",
        ttlSeconds: 60,
      }),
    });
    const body = (await response.json()) as {
      token: string;
      url: string;
      writeMode: string;
    };

    expect(response.status).toBe(200);
    expect(body.token).toBe("platform-jwt");
    expect(body.url).toBe("libsql://tokendb.turso.io");
    expect(body.writeMode).toBe("direct");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/organizations/example-org/databases/tokendb/auth/tokens?expiration=60s&authorization=full-access",
      ),
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("returns resolved database URL when issuing a token for an auto-created database", async () => {
    mockCreatedDatabase({
      url: "libsql://tenant-a.turso.io",
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ jwt: "scoped-token" }),
    } as Response);
    const app = deploy([Functions.tursoToken(dynamicOptions())]);

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "tenant-a",
        ttlSeconds: 60,
      }),
    });
    const body = (await response.json()) as { token: string; url: string };

    expect(response.status).toBe(200);
    expect(body.token).toBe("scoped-token");
    expect(body.url).toBe("libsql://tenant-a.turso.io");
  });

  test("uses TURSO_GROUP_NAME from environment when creating databases", async () => {
    process.env.TURSO_GROUP_NAME = "primary-group";
    const fetchMock = mockCreatedDatabase({
      url: "libsql://envgroupdb.turso.io",
    });
    const app = deploy([
      Functions.turso(
        dynamicOptions({
          groupName: undefined,
        }),
      ),
    ]);

    const response = await app.request(
      "http://localhost/turso?database=envgroupdb&table=users",
    );

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

  test("does not create databases when autoCreateDatabase is false", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);
    const app = deploy([
      Functions.turso(
        dynamicOptions({
          autoCreateDatabase: false,
        }),
      ),
    ]);

    const response = await app.request(
      "http://localhost/turso?database=missingdb&table=users",
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("Database was not found: missingdb");
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/v1/organizations/example-org/databases"),
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("returns an access-time error when database group is not configured", async () => {
    delete process.env.TURSO_GROUP_NAME;
    const fetchMock = jest.spyOn(globalThis, "fetch");
    const app = deploy([
      Functions.turso(
        dynamicOptions({
          groupName: undefined,
        }),
      ),
    ]);

    const response = await app.request(
      "http://localhost/turso?database=missinggroupdb&table=users",
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe(
      "groupName or TURSO_GROUP_NAME is required to create Turso databases.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
