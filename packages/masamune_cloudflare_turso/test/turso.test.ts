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
    "database/*/*": {
      read: "allow",
      write: "allow",
    },
  },
} as const;

const originalTursoGroup = process.env.TURSO_GROUP;

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
    organization: "example-org",
    group: "primary-group",
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
    process.env.TURSO_GROUP = originalTursoGroup;
  });

  afterAll(() => {
    process.env.TURSO_GROUP = originalTursoGroup;
  });

  test("exposes WorkersData using the existing Functions pattern", () => {
    const worker = Functions.turso(dynamicOptions());
    const tokenWorker = Functions.tursoToken(dynamicOptions());

    expect(worker.path).toBe("/turso");
    expect(tokenWorker.path).toBe("/turso/token");
  });

  test("uses rules config from default WorkersOptions", async () => {
    mockExistingDatabase({ url: "libsql://default-rules-db.turso.io" });
    execute.mockResolvedValueOnce({ rows: [] });
    const app = deploy(
      [
        Functions.turso(dynamicOptions({ rules: undefined })),
      ],
      { rules: allowRules },
    );

    const response = await app.request(
      "http://localhost/turso/database/default-rules-db/users",
    );

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('FROM "users"'),
      }),
    );
  });

  test("denies access when rules reject the request", async () => {
    mockExistingDatabase({ url: "libsql://denydb.turso.io" });
    const app = deploy([
      Functions.turso(
        dynamicOptions({
          rules: {
            version: "1",
            rules: {
              "database/*/*": {
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

  test("counts rows when Turso returns array rows", async () => {
    mockExistingDatabase({ url: "libsql://countdb.turso.io" });
    execute.mockResolvedValueOnce({
      columns: ["count"],
      rows: [
        [2],
      ],
    });
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/turso/database/countdb/users?count=true",
    );
    const body = (await response.json()) as { data: number };

    expect(response.status).toBe(200);
    expect(body.data).toBe(2);
  });

  test("updates rows on POST with path indexKey", async () => {
    mockExistingDatabase({ url: "libsql://postdb.turso.io" });
    execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
        rows: [
          [0, "id", "TEXT", 0, null, 1],
          [1, "created_at", "INTEGER", 0, null, 0],
          [2, "updated_at", "INTEGER", 0, null, 0],
          [3, "name", "TEXT", 0, null, 0],
        ],
      })
      .mockResolvedValueOnce({
        columns: ["id", "name", "created_at", "updated_at"],
        rows: [
          ["user_1", "Alice", 1, 1],
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
    const body = (await response.json()) as { data: Record<string, unknown>[] };

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toEqual({
      id: "user_1",
      name: "Alice",
      created_at: 1,
      updated_at: 1,
    });
    expect(body.data[0]["0"]).toBeUndefined();
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
        sql: expect.stringContaining("UPDATE"),
      }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('WHERE "id" = ?'),
      }),
    );
  });

  test("checks update rules for POST with path indexKey", async () => {
    mockExistingDatabase({ url: "libsql://postruledb.turso.io" });
    execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
        rows: [
          [0, "id", "TEXT", 0, null, 1],
          [1, "created_at", "INTEGER", 0, null, 0],
          [2, "updated_at", "INTEGER", 0, null, 0],
          [3, "name", "TEXT", 0, null, 0],
        ],
      })
      .mockResolvedValueOnce({
        columns: ["id", "name", "created_at", "updated_at"],
        rows: [
          ["user_1", "Alice", 1, 1],
        ],
      });
    const app = deploy([
      Functions.turso(
        dynamicOptions({
          rules: {
            version: "1",
            rules: {
              "database/*/*/*": {
                create: "deny",
                update: "allow",
              },
            },
          },
        }),
      ),
    ]);

    const response = await app.request("http://localhost/turso/database/postruledb/users/user_1", {
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

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining("UPDATE"),
      }),
    );
  });

  test("denies POST with path indexKey when update rules reject it", async () => {
    mockExistingDatabase({ url: "libsql://postdenieddb.turso.io" });
    const app = deploy([
      Functions.turso(
        dynamicOptions({
          rules: {
            version: "1",
            rules: {
              "database/*/*/*": {
                create: "allow",
                update: "deny",
              },
            },
          },
        }),
      ),
    ]);

    const response = await app.request("http://localhost/turso/database/postdenieddb/users/user_1", {
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
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("denied");
    expect(execute).not.toHaveBeenCalled();
  });

  test("adds only missing columns during migration", async () => {
    mockExistingDatabase({ url: "libsql://migrationdb.turso.io" });
    execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
        rows: [
          [0, "id", "TEXT", 0, null, 1],
          [1, "created_at", "INTEGER", 0, null, 0],
          [2, "updated_at", "INTEGER", 0, null, 0],
          [3, "name", "TEXT", 0, null, 0],
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

  test("uses functions write mode when descendant table rules deny writes", async () => {
    mockExistingDatabase({
      url: "libsql://test.turso.io",
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ jwt: "read-only-token" }),
    } as Response);
    const app = deploy([
      Functions.tursoToken(
        dynamicOptions({
          rules: {
            version: "1",
            rules: {
              "database/test": {
                read: "allow",
                write: "allow",
              },
              "database/test/users": {
                read: "allow",
                write: "deny",
              },
            },
          },
        }),
      ),
    ]);

    const response = await app.request("http://localhost/turso/token/database/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ttlSeconds: 60,
      }),
    });
    const body = (await response.json()) as {
      token: string;
      readMode: string;
      writeMode: string;
    };

    expect(response.status).toBe(200);
    expect(body.token).toBe("read-only-token");
    expect(body.readMode).toBe("direct");
    expect(body.writeMode).toBe("functions");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/organizations/example-org/databases/test/auth/tokens?expiration=60s&authorization=read-only",
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
          organization: "option-org",
          group: "option-group",
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
        TURSO_ORGANIZATION: "env-org",
        TURSO_GROUP: "env-group",
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
                  read: { type: "path", param: "uid" },
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

  test("marks database tokens as functions write mode for server-side writes", async () => {
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
                  read: { type: "path", param: "uid" },
                  write: {
                    type: "path",
                    param: "uid",
                    server: true,
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

  test("returns functions targets without issuing a token when read and write are server-side", async () => {
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
                  read: "server",
                  write: "server",
                },
                "database/{uid}/*": {
                  read: "server",
                  write: "server",
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
                "database/field-scope/posts/*": {
                  read: { type: "field", field: "ownerId" },
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
                  read: { type: "path", param: "uid" },
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

  test("evaluates field rules with server only on server requests", async () => {
    const engine = createTursoRulesEngine({
      version: "1",
      rules: {
        "database/main/posts/*": {
          update: {
            type: "field",
            field: "ownerId",
            server: true,
          },
        },
      },
    });

    const direct = await engine.evaluate({
      path: "database/main/posts/post-1",
      operation: "update",
      authentication: { uid: "user-1" },
      fetchDocument: async () => ({ ownerId: "user-1" }),
    });
    const server = await engine.evaluate({
      path: "database/main/posts/post-1",
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

  test("uses TURSO_GROUP from environment when creating databases", async () => {
    process.env.TURSO_GROUP = "primary-group";
    const fetchMock = mockCreatedDatabase({
      url: "libsql://envgroupdb.turso.io",
    });
    const app = deploy([
      Functions.turso(
        dynamicOptions({
          group: undefined,
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
    delete process.env.TURSO_GROUP;
    const fetchMock = jest.spyOn(globalThis, "fetch");
    const app = deploy([
      Functions.turso(
        dynamicOptions({
          group: undefined,
        }),
      ),
    ]);

    const response = await app.request(
      "http://localhost/turso?database=missinggroupdb&table=users",
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe(
      "group or TURSO_GROUP is required to create Turso databases.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
