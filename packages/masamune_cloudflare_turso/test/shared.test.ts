import { deploy } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";
import { TursoDatabaseAdapter } from "../src/lib/database_adapter";
import {
  createTursoSharedClient,
  createTursoSharedDatabaseAdapter,
} from "../src/lib/shared_client";
import { TursoWorkersOptions } from "../src/lib/types";

const execute = jest.fn();
const close = jest.fn();
const connect = jest.fn((_: { url: string; authToken?: string }) => ({
  execute: async (...args: unknown[]) => execute(...args),
  close,
}));

jest.mock("@tursodatabase/serverless/compat", () => ({
  createClient: (config: { url: string; authToken?: string }) => connect(config),
}));

const tursoDatabaseId = "00000000-0010-4000-8000-000000000000";

const serverOnlyRules = {
  version: "1",
  rules: {
    database: {
      "*/*": { read: "server", write: "server" },
      "*/*/*": { read: "server", write: "server" },
    },
  },
} as const;

/// Answers the Turso Platform API only for [physical]. Any other call fails the test.
function mockBoundDatabase(physical: string, group: string): jest.SpiedFunction<typeof fetch> {
  return jest.spyOn(globalThis, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(`/databases/${physical}/auth/tokens`)) {
      return new Response(JSON.stringify({ jwt: "test-database-token" }));
    }
    if (url.endsWith(`/databases/${physical}`)) {
      return new Response(JSON.stringify({
        database: { DbId: tursoDatabaseId, Hostname: `${physical}.turso.io`, group },
      }));
    }
    throw new Error(`Unexpected Platform API call: ${url}`);
  }) as unknown as typeof fetch);
}

function sharedOptions(physical: string, options: Partial<TursoWorkersOptions> = {}): TursoWorkersOptions {
  return {
    organization: "example-org",
    platformApiToken: "platform-token",
    rules: serverOnlyRules,
    databaseBindings: {
      dev: { shared: { database: physical, group: "app-dev" } },
      prod: { shared: { database: `${physical}-prod`, group: "app-us" } },
    },
    ...options,
  };
}

describe("Shared Turso database on the region Worker", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    execute.mockResolvedValue({ rows: [] });
  });

  test("denies server rules to clients without the server access token", async () => {
    mockBoundDatabase("shared-deny-dev", "app-dev");
    const app = deploy([Functions.turso(sharedOptions("shared-deny-dev"))]);
    const env = { FLAVOR: "dev", TURSO_SERVER_ACCESS_TOKEN: "server-secret" };

    const withoutHeader = await app.request("http://localhost/turso/database/shared/ranking", {}, env);
    expect(withoutHeader.status).toBe(403);
    expect(await withoutHeader.json()).toMatchObject({ error: "denied" });

    const wrongHeader = await app.request("http://localhost/turso/database/shared/ranking", {
      headers: { "x-masamune-server-token": "server-secreT" },
    }, env);
    expect(wrongHeader.status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });

  test("allows server rules with the correct server access token", async () => {
    mockBoundDatabase("shared-allow-dev", "app-dev");
    const app = deploy([Functions.turso(sharedOptions("shared-allow-dev"))]);

    const response = await app.request("http://localhost/turso/database/shared/ranking", {
      headers: { "x-masamune-server-token": "server-secret" },
    }, { FLAVOR: "dev", TURSO_SERVER_ACCESS_TOKEN: "server-secret" });

    expect(response.status).toBe(200);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({
      url: "libsql://shared-allow-dev.turso.io",
    }));
  });

  test("supports the serverAccessToken option and a custom header", async () => {
    mockBoundDatabase("shared-option-dev", "app-dev");
    const app = deploy([Functions.turso(sharedOptions("shared-option-dev", {
      serverAccessToken: "option-secret",
      serverAccessHeader: "x-custom-server",
    }))]);

    const denied = await app.request("http://localhost/turso/database/shared/ranking", {
      headers: { "x-masamune-server-token": "option-secret" },
    }, { FLAVOR: "dev" });
    expect(denied.status).toBe(403);
    const allowed = await app.request("http://localhost/turso/database/shared/ranking", {
      headers: { "x-custom-server": "option-secret" },
    }, { FLAVOR: "dev" });
    expect(allowed.status).toBe(200);
  });

  test("never grants server rules on bound databases without a configured token", async () => {
    mockBoundDatabase("shared-notoken-dev", "app-dev");
    const app = deploy([Functions.turso(sharedOptions("shared-notoken-dev"))]);

    const response = await app.request("http://localhost/turso/database/shared/ranking", {
      headers: { "x-masamune-server-token": "anything" },
    }, { FLAVOR: "dev" });

    expect(response.status).toBe(403);
  });

  test("keeps the legacy server flag for edge databases without a token", async () => {
    jest.spyOn(globalThis, "fetch").mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" && String(input).includes("/auth/tokens")) {
        return new Response(JSON.stringify({ jwt: "test-database-token" }));
      }
      return new Response(JSON.stringify({
        database: { DbId: tursoDatabaseId, Hostname: "legacy-edge-db.turso.io" },
      }));
    }) as unknown as typeof fetch);
    const app = deploy([Functions.turso({
      organization: "example-org",
      group: "primary-group",
      platformApiToken: "platform-token",
      rules: serverOnlyRules,
    })]);

    const response = await app.request("http://localhost/turso/database/legacy-edge-db/users");

    expect(response.status).toBe(200);
  });

  test("re-evaluates nearest results with the resolved server flag", async () => {
    mockBoundDatabase("shared-nearest-dev", "app-dev");
    const nearestQueries: string[] = [];
    execute.mockImplementation(async (statement: unknown) => {
      const sql = typeof statement === "string" ? statement : (statement as { sql: string }).sql;
      if (sql.includes("vector_distance")) {
        nearestQueries.push(sql);
        return { rows: [{ id: "row-1", score: 1 }], columns: ["id", "score"] };
      }
      return { rows: [] };
    });
    const app = deploy([Functions.turso(sharedOptions("shared-nearest-dev", {
      schemaManifest: {
        version: "1",
        tables: {
          "shared\u0000ranking": {
            database: "shared",
            table: "ranking",
            columns: [
              { name: "score", type: "INTEGER" },
              { name: "embedding", type: "F32_BLOB(2)", vectorMetric: "cosine" },
            ],
          },
        },
      },
    }))]);
    const nearest = encodeURIComponent(JSON.stringify({ key: "embedding", value: [1, 0] }));

    const response = await app.request(
      `http://localhost/turso/database/shared/ranking?nearest=${nearest}`,
      { headers: { "x-masamune-server-token": "server-secret" } },
      { FLAVOR: "dev", TURSO_SERVER_ACCESS_TOKEN: "server-secret" },
    );
    expect(response.status).toBe(200);
    expect(nearestQueries).toHaveLength(1);
    // Rows are re-evaluated with the same server flag and kept.
    expect(await response.json()).toEqual({ data: [{ id: "row-1", score: 1 }] });

    const client = await app.request(
      `http://localhost/turso/database/shared/ranking?nearest=${nearest}`,
      {},
      { FLAVOR: "dev", TURSO_SERVER_ACCESS_TOKEN: "server-secret" },
    );
    expect(client.status).toBe(403);
    expect(nearestQueries).toHaveLength(1);
  });
});

describe("Reserved databases on the edge Worker", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test("rejects CRUD and token requests for a reserved database without creating it", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    const options: TursoWorkersOptions = {
      organization: "example-org",
      group: "primary-group",
      platformApiToken: "platform-token",
      autoCreateDatabase: true,
      reservedDatabases: ["shared"],
      rules: {
        version: "1",
        rules: { database: { "*": { read: "allow", write: "allow" }, "*/*": { read: "allow", write: "allow" } } },
      },
    };
    const app = deploy([Functions.turso(options), Functions.tursoToken(options)]);

    const crud = await app.request("http://localhost/turso/database/shared/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: { name: "Alice" } }),
    });
    expect(crud.status).toBe(400);
    expect(await crud.json()).toEqual({ error: "reserved_database" });

    const read = await app.request("http://localhost/turso/database/shared/users");
    expect(read.status).toBe(400);

    const token = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ database: "shared" }),
    });
    expect(token.status).toBe(400);
    expect(await token.json()).toEqual({ error: "reserved_database" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
});

describe("createTursoSharedClient", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    execute.mockResolvedValue({ rows: [] });
  });

  test("connects to the bound database selected by FLAVOR", async () => {
    const fetchMock = mockBoundDatabase("shared-client-prod", "app-us");
    const client = await createTursoSharedClient({
      FLAVOR: "prod",
      TURSO_ORGANIZATION: "example-org",
      TURSO_PLATFORM_API_TOKEN: "platform-token",
      TURSO_DATABASE_BINDINGS: JSON.stringify({
        dev: { shared: { database: "shared-client-dev", group: "app-dev" } },
        prod: { shared: { database: "shared-client-prod", group: "app-us" } },
      }),
    });
    await client.execute("SELECT 1");
    await client.close();

    expect(connect).toHaveBeenCalledWith({
      url: "libsql://shared-client-prod.turso.io",
      authToken: "test-database-token",
    });
    // Only the bound database is looked up; no database is created.
    expect(fetchMock.mock.calls.every(([input]) => String(input).includes("/databases/shared-client-prod"))).toBe(true);
    expect(fetchMock.mock.calls.some(([input, init]) =>
      init?.method === "POST" && !String(input).includes("/auth/tokens"))).toBe(false);
  });

  test("rejects a missing FLAVOR and missing bindings", async () => {
    await expect(createTursoSharedClient({
      TURSO_ORGANIZATION: "example-org",
      TURSO_PLATFORM_API_TOKEN: "platform-token",
    }, {
      databaseBindings: { dev: { shared: { database: "shared-noflavor-dev", group: "app-dev" } } },
    })).rejects.toThrow("FLAVOR");
    await expect(createTursoSharedClient({ FLAVOR: "dev" })).rejects.toThrow("TURSO_DATABASE_BINDINGS");
  });

  test("database adapters use the fixed bound database", async () => {
    mockBoundDatabase("shared-adapter-dev", "app-dev");
    execute.mockResolvedValue({ rows: [{ id: "user-1", parent_id: "", score: 3 }], columns: ["id", "parent_id", "score"] });
    const adapter = createTursoSharedDatabaseAdapter({
      FLAVOR: "dev",
      TURSO_ORGANIZATION: "example-org",
      TURSO_PLATFORM_API_TOKEN: "platform-token",
    }, {
      databaseBindings: { dev: { shared: { database: "shared-adapter-dev", group: "app-dev" } } },
    });

    const document = await adapter.getDocument("database/shared/ranking/user-1");

    expect(document?.data).toMatchObject({ score: 3 });
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({
      url: "libsql://shared-adapter-dev.turso.io",
    }));
    const direct = new TursoDatabaseAdapter({
      options: {
        organization: "example-org",
        platformApiToken: "platform-token",
        databaseBindings: { dev: { shared: { database: "shared-adapter-dev", group: "app-dev" } } },
      },
      flavor: "dev",
    });
    await expect(direct.getDocument("database/other/ranking/user-1")).rejects.toThrow("not bound");
  });
});
