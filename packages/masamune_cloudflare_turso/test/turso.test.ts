import { deploy, WorkersAuthAdapterBase } from "@mathrunet/masamune_cloudflare";
import type { MiddlewareHandler } from "hono";
import { Functions } from "../src/functions";
import { TursoDatabaseAdapter } from "../src/lib/database_adapter";
import { resolvePhysicalDatabaseName } from "../src/lib/database_name";
import {
  applyRequestDatabasePrefix,
  normalizeDatabasePrefix,
  resolveWorkerDatabasePrefix,
} from "../src/lib/database_prefix";
import { createTursoRulesEngine } from "../src/lib/rules";
import { resolveTursoCreationGroup, resolveTursoWorkersOptionsFromEnv } from "../src/lib/env";
import { Context } from "hono";
import { TursoWorkersOptions } from "../src/lib/types";
import {
  cacheDatabaseConnection,
  clearDatabaseConnectionCache,
  isTursoDatabaseId,
  resolveDatabaseConnection,
  resolveDatabaseEndpoint,
} from "../src/lib/turso_client";

const execute = jest.fn();
const close = jest.fn();
const concurrent = jest.fn(async (callback: () => Promise<unknown>) => callback());
const transaction = jest.fn((callback: () => Promise<unknown>) => ({
  concurrent: () => concurrent(callback),
}));
const connect = jest.fn(() => ({ execute, transaction, close }));

jest.mock("@tursodatabase/serverless", () => ({
  connect,
}));

const tursoDatabaseId = "00000000-0010-4000-8000-000000000000";

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
      json: async () => ({
        database: { DbId: tursoDatabaseId, Hostname: url },
      }),
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
      json: async () => ({
        database: { DbId: tursoDatabaseId, Hostname: url },
      }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ jwt: databaseToken }),
    } as Response);
}

/// Answers the Platform API by request shape instead of by call order.
///
/// The `mockResolvedValueOnce` helpers above cannot express a concurrency test,
/// where the point of the assertion is that a given request is issued exactly
/// once no matter how many callers ask for it.
function mockPlatformApi({
  url,
  databaseToken = "database-token",
}: {
  url: string;
  databaseToken?: string;
}): jest.SpiedFunction<typeof fetch> {
  return jest.spyOn(globalThis, "fetch").mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    if (init?.method === "POST" && String(input).includes("/auth/tokens")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ jwt: databaseToken }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        database: { DbId: tursoDatabaseId, Hostname: url },
      }),
    } as Response;
  }) as unknown as typeof fetch);
}

/// Answers the Platform API for a database that does not exist yet.
function mockCreatedPlatformApi({
  url,
  databaseToken = "database-token",
}: {
  url: string;
  databaseToken?: string;
}): jest.SpiedFunction<typeof fetch> {
  let getCount = 0;
  return jest.spyOn(globalThis, "fetch").mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    if (init?.method === "POST") {
      return String(input).includes("/auth/tokens")
        ? ({
          ok: true,
          status: 200,
          json: async () => ({ jwt: databaseToken }),
        } as Response)
        : ({ ok: true, status: 200 } as Response);
    }
    getCount += 1;
    if (getCount === 1) {
      return { ok: false, status: 404 } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        database: { DbId: tursoDatabaseId, Hostname: url },
      }),
    } as Response;
  }) as unknown as typeof fetch);
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

  test("旧DartのprefixなしCRUDとtoken要求をdev対応表のDBだけへ送る", async () => {
    const options = dynamicOptions({
      group: "binding-dev",
      autoCreateDatabase: true,
      autoCreateTable: false,
      autoMigrateAddColumns: false,
      databaseBindings: {
        dev: { main: { database: "binding-dev-main", group: "binding-dev" } },
      },
    });
    const requests: string[] = [];
    const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("/databases/binding-dev-main/auth/tokens")) {
        return new Response(JSON.stringify({ jwt: "test-database-token" }));
      }
      if (url.endsWith("/databases/binding-dev-main")) {
        return new Response(JSON.stringify({ database: {
          DbId: tursoDatabaseId, Hostname: "binding-dev-main.turso.io", group: "binding-dev",
        } }));
      }
      throw new Error("許可表外のPlatform API呼び出し");
    });
    const app = deploy([Functions.turso(options), Functions.tursoToken(options)]);
    const response = await app.request("http://localhost/turso/database/main/users", {}, { FLAVOR: "dev" });
    expect(response.status).toBe(200);
    const token = await app.request("http://localhost/turso/token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ database: "main", ttlSeconds: 60 }),
    }, { FLAVOR: "dev" });
    expect(token.status).toBe(200);
    expect(requests.length).toBeGreaterThan(1);
    expect(requests.every((url) => url.includes("/databases/binding-dev-main"))).toBe(true);
    fetchMock.mockClear();
    for (const [database, flavor, prefix] of [
      ["main", "prod", ""], ["unknown", "dev", ""], ["main", "dev", "?prefix=prod"],
    ]) {
      const denied = await app.request(`http://localhost/turso/database/${database}/users${prefix}`, {}, { FLAVOR: flavor });
      expect([400, 403]).toContain(denied.status);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("対応表のDBが存在しなくても自動作成しない", async () => {
    const options = resolveWorkerDatabasePrefix(dynamicOptions({
      group: "primary-group", autoCreateDatabase: true,
      databaseBindings: { dev: { main: { database: "binding-missing-main", group: "primary-group" } } },
    }), undefined, "dev", "main");
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    await expect(resolveDatabaseConnection("main", options)).rejects.toThrow("Database was not found");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
  });

  test("対応表の変更はキャッシュを共有せず、誤groupはtoken発行前に拒否する", async () => {
    const bound = (name: string) => resolveWorkerDatabasePrefix(dynamicOptions({
      databaseBindings: { dev: { main: { database: name, group: "primary-group" } } },
    }), undefined, "dev", "main");
    const first = bound("binding-cache-first");
    const next = bound("binding-cache-next");
    cacheDatabaseConnection("main", first, {
      url: "first.turso.io", authToken: "test-token", group: "primary-group",
      authTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ database: {
      DbId: tursoDatabaseId, Hostname: "next.turso.io", group: "wrong-group",
    } })));
    await expect(resolveDatabaseConnection("main", first)).resolves.toMatchObject({ url: "first.turso.io" });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(resolveDatabaseConnection("main", next)).rejects.toThrow("Database group is not allowed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/databases/binding-cache-next");
  });

  test("exposes WorkersData using the existing Functions pattern", () => {
    const worker = Functions.turso(dynamicOptions());
    const tokenWorker = Functions.tursoToken(dynamicOptions());

    expect(worker.path).toBe("/turso");
    expect(tokenWorker.path).toBe("/turso/token");
  });

  test("rejects CRUD requests without an explicit database", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request("http://localhost/turso?table=users");
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("database is required.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects token requests without an explicit database", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    const app = deploy([Functions.tursoToken(dynamicOptions())]);

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttlSeconds: 60 }),
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("database is required.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("keeps Turso-compatible database names unchanged", async () => {
    await expect(resolvePhysicalDatabaseName("user-1")).resolves.toBe("user-1");
  });

  test("normalizes adapter database prefixes", () => {
    expect(normalizeDatabasePrefix(undefined)).toBeUndefined();
    expect(normalizeDatabasePrefix("___")).toBeUndefined();
    expect(normalizeDatabasePrefix(" dev___ ")).toBe("dev_");
    expect(
      applyRequestDatabasePrefix(
        { databasePrefix: "tenant-" },
        normalizeDatabasePrefix("dev"),
      ).databasePrefix,
    ).toBe("tenant-dev_");
    expect(() => normalizeDatabasePrefix("invalid prefix")).toThrow(
      "Invalid prefix",
    );
  });

  test("rejects invalid CRUD prefix before database access", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/turso/database/main/users?prefix=invalid%20prefix",
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("maps unsupported logical database names deterministically", async () => {
    const firebaseUid = "gWTauHPOCiPCUzeFZOu6RsbdzhB3";
    const physicalName = await resolvePhysicalDatabaseName(firebaseUid);

    expect(physicalName).toMatch(/^db-[a-f0-9]{53}$/);
    await expect(resolvePhysicalDatabaseName(firebaseUid)).resolves.toBe(
      physicalName,
    );
    await expect(
      resolvePhysicalDatabaseName(firebaseUid.toLowerCase()),
    ).resolves.not.toBe(physicalName);
    await expect(resolvePhysicalDatabaseName("user_profile")).resolves.toMatch(
      /^db-[a-f0-9]{53}$/,
    );
    await expect(resolvePhysicalDatabaseName("a".repeat(57))).resolves.toMatch(
      /^db-[a-f0-9]{53}$/,
    );
    await expect(
      resolvePhysicalDatabaseName(firebaseUid, { databasePrefix: "tenant-" }),
    ).resolves.not.toBe(physicalName);
  });

  test("uses the physical name while authorizing the original Firebase UID", async () => {
    const firebaseUid = "gWTauHPOCiPCUzeFZOu6RsbdzhB3";
    const physicalName = await resolvePhysicalDatabaseName(firebaseUid);
    const fetchMock = mockExistingDatabase({
      url: `libsql://${physicalName}.turso.io`,
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ jwt: "firebase-user-token" }),
    } as Response);
    const app = deploy(
      [
        Functions.tursoToken(
          dynamicOptions({
            rules: {
              version: "1",
              rules: {
                database: {
                  "{uid}": {
                    read: { type: "path", param: "uid" },
                    write: "deny",
                  },
                },
              },
            },
          }),
        ),
      ],
      { auth: new StaticAuthAdapter(firebaseUid) },
    );

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: firebaseUid,
        ttlSeconds: 60,
      }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        `/v1/organizations/example-org/databases/${physicalName}`,
      ),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        `/databases/${physicalName}/auth/tokens?expiration=60s&authorization=read-only`,
      ),
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("issues a bounded full-access token for server connections", async () => {
    const fetchMock = mockExistingDatabase({
      url: "libsql://bounded-server-token.turso.io",
    });

    await resolveDatabaseConnection(
      "bounded-server-token",
      dynamicOptions({ serverTokenTtlSeconds: 7200 }),
    );

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining(
        "/auth/tokens?expiration=7200s&authorization=full-access",
      ),
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("refreshes a cached server token once before it expires", async () => {
    const options = dynamicOptions({ serverTokenTtlSeconds: 3600 });
    const database = "refresh-server-token";
    cacheDatabaseConnection(database, options, {
      url: "libsql://refresh-server-token.turso.io",
      authToken: "old-token",
      authTokenExpiresAt: Math.floor(Date.now() / 1000) + 30,
    });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ jwt: "new-token" }),
    } as Response);

    const [first, second] = await Promise.all([
      resolveDatabaseConnection(database, options),
      resolveDatabaseConnection(database, options),
    ]);

    expect(first.authToken).toBe("new-token");
    expect(second.authToken).toBe("new-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/auth/tokens?expiration=3600s&authorization=full-access",
      ),
      expect.objectContaining({ method: "POST" }),
    );
    clearDatabaseConnectionCache(database, options);
  });

  test("resolves a cold endpoint once for concurrent callers", async () => {
    const options = dynamicOptions();
    const database = "concurrent-cold-endpoint";
    const url = "libsql://concurrent-cold-endpoint.turso.io";
    const physicalName = await resolvePhysicalDatabaseName(database, options);
    const fetchMock = mockPlatformApi({ url });

    const results = await Promise.all([
      resolveDatabaseEndpoint(database, options),
      resolveDatabaseEndpoint(database, options),
      resolveDatabaseEndpoint(database, options),
      resolveDatabaseEndpoint(database, options),
    ]);

    for (const result of results) {
      expect(result.url).toBe(url);
      expect(result.created).toBe(false);
    }
    expect(
      fetchMock.mock.calls.filter(([target]) =>
        String(target).includes(`/databases/${physicalName}`)
      ),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("resolves a cold connection once for concurrent callers", async () => {
    const options = dynamicOptions({ serverTokenTtlSeconds: 3600 });
    const database = "concurrent-cold-connection";
    const url = "libsql://concurrent-cold-connection.turso.io";
    const fetchMock = mockPlatformApi({ url, databaseToken: "shared-token" });

    const results = await Promise.all([
      resolveDatabaseConnection(database, options),
      resolveDatabaseConnection(database, options),
      resolveDatabaseConnection(database, options),
      resolveDatabaseConnection(database, options),
    ]);

    for (const result of results) {
      expect(result.url).toBe(url);
      expect(result.authToken).toBe("shared-token");
    }
    // One GET for the database plus one POST for the token, shared by all four.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    clearDatabaseConnectionCache(database, options);
  });

  test("gives every joiner the created verdict of one resolution", async () => {
    const options = dynamicOptions({ autoCreateDatabase: true });
    const database = "concurrent-created-endpoint";
    const url = "libsql://concurrent-created-endpoint.turso.io";
    const fetchMock = mockCreatedPlatformApi({ url });

    const results = await Promise.all([
      resolveDatabaseEndpoint(database, options),
      resolveDatabaseEndpoint(database, options),
      resolveDatabaseEndpoint(database, options),
    ]);

    // A joiner must never see `created: false` for a database that was just
    // created, or it would skip `waitForDatabaseReady` and query too early.
    for (const result of results) {
      expect(result.url).toBe(url);
      expect(result.created).toBe(true);
    }
    // 404 GET, POST create, GET info — issued once, not once per caller.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("does not retain a failed cold resolution", async () => {
    const options = dynamicOptions();
    const database = "concurrent-failed-endpoint";
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: false, status: 500 } as Response);

    const settled = await Promise.allSettled([
      resolveDatabaseEndpoint(database, options),
      resolveDatabaseEndpoint(database, options),
      resolveDatabaseEndpoint(database, options),
    ]);

    expect(settled.map((result) => result.status)).toEqual([
      "rejected",
      "rejected",
      "rejected",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A later retry must start fresh rather than replay the cached rejection.
    await expect(resolveDatabaseEndpoint(database, options)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("does not let an in-flight resolution undo a cache clear", async () => {
    const options = dynamicOptions({ serverTokenTtlSeconds: 3600 });
    const database = "concurrent-cleared-connection";
    const url = "libsql://concurrent-cleared-connection.turso.io";
    const fetchMock = mockPlatformApi({ url, databaseToken: "first-token" });

    const pending = resolveDatabaseConnection(database, options);
    clearDatabaseConnectionCache(database, options);
    await pending;

    // The clear must win: the next caller re-issues a token instead of reusing
    // the connection that was resolved before the clear.
    const callsBeforeReresolve = fetchMock.mock.calls.length;
    const reresolved = await resolveDatabaseConnection(database, options);

    expect(reresolved.authToken).toBe("first-token");
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeReresolve);
    clearDatabaseConnectionCache(database, options);
  });

  test("database adapter does not retain a stale authenticated client", async () => {
    const options = dynamicOptions({ serverTokenTtlSeconds: 3600 });
    const database = "database-adapter-token-refresh";
    const adapter = new TursoDatabaseAdapter({ options });
    cacheDatabaseConnection(database, options, {
      url: "libsql://database-adapter-token-refresh.turso.io",
      authToken: "first-token",
      authTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    await adapter.getDocument(`database/${database}/users/user-1`);
    cacheDatabaseConnection(database, options, {
      url: "libsql://database-adapter-token-refresh.turso.io",
      authToken: "refreshed-token",
      authTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    await adapter.getDocument(`database/${database}/users/user-1`);

    expect(connect).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ authToken: "first-token" }),
    );
    expect(connect).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ authToken: "refreshed-token" }),
    );
    clearDatabaseConnectionCache(database, options);
  });

  test("uses rules config from default WorkersOptions", async () => {
    mockExistingDatabase({ url: "libsql://default-rules-db.turso.io" });
    execute.mockResolvedValueOnce({ rows: [] });
    const app = deploy(
      [Functions.turso(dynamicOptions({ rules: undefined }))],
      { rules: allowRules },
    );

    const response = await app.request(
      "http://localhost/turso/database/default-rules-db/users",
    );

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('FROM "users"'),
      expect.any(Array),
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
              database: {
                "*/*": {
                  read: "deny",
                  write: "deny",
                },
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
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith({
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
    expect(connect).toHaveBeenCalledWith({
      url: "libsql://pathdb.turso.io",
      authToken: "database-token",
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('FROM "users"'),
      expect.any(Array),
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
    expect(connect).toHaveBeenCalledWith({
      url: "libsql://hostname-db-mathru.turso.io",
      authToken: "database-token",
    });
  });

  test("counts rows when Turso returns array rows", async () => {
    mockExistingDatabase({ url: "libsql://countdb.turso.io" });
    execute.mockResolvedValueOnce({
      columns: ["count"],
      rows: [[2]],
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
        rows: [["user_1", "Alice", 1, 1]],
      });
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/turso/database/postdb/users/user_1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: {
            name: "Alice",
          },
        }),
      },
    );
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
      expect.stringContaining("UPDATE"),
      expect.any(Array),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('WHERE "id" = ?'),
      expect.any(Array),
    );
  });

  test("upserts rows on POST when value contains an existing id", async () => {
    mockExistingDatabase({ url: "libsql://postupsertdb.turso.io" });
    execute.mockResolvedValueOnce({
      columns: ["id", "name", "created_at", "updated_at"],
      rows: [["user_1", "Alice", 1, 2]],
    });
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/turso/database/postupsertdb/users",
      {
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
      },
    );
    const body = (await response.json()) as { data: Record<string, unknown>[] };

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR REPLACE INTO"),
      expect.any(Array),
    );
    expect(execute).toHaveBeenCalledTimes(1);
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
        rows: [["user_1", "Alice", 1, 1]],
      });
    const app = deploy([
      Functions.turso(
        dynamicOptions({
          rules: {
            version: "1",
            rules: {
              database: {
                "*/*/*": {
                  create: "deny",
                  update: "allow",
                },
              },
            },
          },
        }),
      ),
    ]);

    const response = await app.request(
      "http://localhost/turso/database/postruledb/users/user_1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: {
            name: "Alice",
          },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE"),
      expect.any(Array),
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
              database: {
                "*/*/*": {
                  create: "allow",
                  update: "deny",
                },
              },
            },
          },
        }),
      ),
    ]);

    const response = await app.request(
      "http://localhost/turso/database/postdenieddb/users/user_1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: {
            name: "Alice",
          },
        }),
      },
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("denied");
    expect(execute).not.toHaveBeenCalled();
  });

  test("adds only missing columns during migration", async () => {
    mockExistingDatabase({ url: "libsql://migrationdb.turso.io" });
    execute
      .mockRejectedValueOnce(
        new Error('table "users" has no column named "age"'),
      )
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

  test("applies a declared schema before a read uses a new column", async () => {
    mockExistingDatabase({ url: "libsql://read-migration.turso.io" });
    let hasAge = false;
    let schemaInspections = 0;
    execute.mockImplementation(async (statement: string | { sql: string }) => {
      const sql = typeof statement === "string" ? statement : statement.sql;
      if (sql.startsWith("PRAGMA table_info")) {
        schemaInspections++;
        return {
          columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
          rows: [
            [0, "id", "TEXT", 0, null, 1],
            [1, "name", "TEXT", 0, null, 0],
            ...(hasAge ? [[2, "age", "INTEGER", 0, null, 0]] : []),
          ],
        };
      }
      if (sql.includes('ADD COLUMN "age"')) {
        hasAge = true;
        return { rows: [] };
      }
      if (sql.startsWith("SELECT *")) {
        if (!hasAge) {
          throw new Error("no such column: age");
        }
        return {
          columns: ["id", "name", "age"],
          rows: [["user_1", "Alice", 20]],
        };
      }
      return { rows: [] };
    });
    const app = deploy([
      Functions.turso(dynamicOptions({
        schemaManifest: {
          version: "release-2",
          tables: {
            users: {
              database: "*",
              table: "users",
              columns: [
                { name: "name", type: "TEXT" },
                { name: "age", type: "INTEGER" },
              ],
            },
          },
        },
      } as Partial<TursoWorkersOptions>)),
    ]);
    const where = encodeURIComponent(JSON.stringify([
      { type: "greaterThanOrEqualTo", key: "age", value: 18 },
    ]));

    const response = await app.request(
      `http://localhost/turso/database/read-migration/users?where=${where}`,
    );
    const secondResponse = await app.request(
      `http://localhost/turso/database/read-migration/users?where=${where}`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: "user_1", name: "Alice", age: 20 }],
    });
    expect(hasAge).toBe(true);
    expect(secondResponse.status).toBe(200);
    expect(schemaInspections).toBe(1);
  });

  test("applies a declared schema before issuing a direct-read token", async () => {
    mockPlatformApi({ url: "libsql://direct-read-schema.turso.io" });
    let hasAge = false;
    execute.mockImplementation(async (statement: string | { sql: string }) => {
      const sql = typeof statement === "string" ? statement : statement.sql;
      if (sql.startsWith("PRAGMA table_info")) {
        return {
          columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
          rows: [
            [0, "id", "TEXT", 0, null, 1],
            ...(hasAge ? [[1, "age", "INTEGER", 0, null, 0]] : []),
          ],
        };
      }
      if (sql.includes('ADD COLUMN "age"')) {
        hasAge = true;
      }
      return { rows: [] };
    });
    const app = deploy([
      Functions.tursoToken(dynamicOptions({
        schemaManifest: {
          version: "release-token-2",
          tables: {
            users: {
              database: "*",
              table: "users",
              columns: [{ name: "age", type: "INTEGER" }],
            },
          },
        },
      })),
    ]);

    const response = await app.request(
      "http://localhost/turso/token/database/direct-read-schema",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targets: [{ table: "users", operations: ["read"] }],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(hasAge).toBe(true);
  });

  test("issues read-only database tokens by database rules", async () => {
    mockExistingDatabase({
      url: "libsql://scopedb.turso.io",
      databaseToken: "scoped-token",
    });
    const app = deploy([
      Functions.tursoToken(
        dynamicOptions({
          rules: {
            version: "1",
            rules: {
              database: {
                scopedb: {
                  read: "allow",
                  write: "deny",
                },
              },
            },
          },
        }),
      ),
    ]);

    const response = await app.request(
      "http://localhost/turso/token/database/scopedb",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ttlSeconds: 60,
          operations: ["read"],
        }),
      },
    );
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
      databaseToken: "read-only-token",
    });
    const app = deploy([
      Functions.tursoToken(
        dynamicOptions({
          rules: {
            version: "1",
            rules: {
              database: {
                test: {
                  read: "allow",
                  write: "allow",
                },
                "test/users": {
                  read: "allow",
                  write: "deny",
                },
              },
            },
          },
        }),
      ),
    ]);

    const response = await app.request(
      "http://localhost/turso/token/database/test",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ttlSeconds: 60,
        }),
      },
    );
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
      databaseToken: "env-priority-token",
    });
    const app = deploy([
      Functions.tursoToken(
        dynamicOptions({
          organization: "option-org",
          group: "option-group",
          platformApiToken: "option-token",
          rules: {
            version: "1",
            rules: {
              database: {
                "env-priority-db": {
                  read: "allow",
                  write: "deny",
                },
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
      expect.stringContaining(
        "/v1/organizations/env-org/databases/env-priority-db",
      ),
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
      databaseToken: "user-token",
    });
    const app = deploy(
      [
        Functions.tursoToken(
          dynamicOptions({
            rules: {
              version: "1",
              rules: {
                database: {
                  "{uid}": {
                    read: { type: "path", param: "uid" },
                    write: "deny",
                  },
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
      databaseToken: "server-write-token",
    });
    const app = deploy(
      [
        Functions.tursoToken(
          dynamicOptions({
            rules: {
              version: "1",
              rules: {
                database: {
                  "{uid}": {
                    read: { type: "path", param: "uid" },
                    write: {
                      type: "path",
                      param: "uid",
                      server: true,
                    },
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
                database: {
                  "{uid}": {
                    read: "server",
                    write: "server",
                  },
                  "{uid}/*": {
                    read: "server",
                    write: "server",
                  },
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
    expect(fetchMock).not.toHaveBeenCalled();
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
                database: {
                  "field-scope": {
                    read: "allow",
                    write: "deny",
                  },
                  "field-scope/posts/*": {
                    read: { type: "field", field: "ownerId" },
                  },
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
    expect(fetchMock).not.toHaveBeenCalled();
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
                database: {
                  "{uid}": {
                    read: { type: "path", param: "uid" },
                    write: "deny",
                  },
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
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("evaluates field rules with server only on server requests", async () => {
    const engine = createTursoRulesEngine({
      version: "1",
      rules: {
        database: {
          "main/posts/*": {
            update: {
              type: "field",
              field: "ownerId",
              server: true,
            },
          },
        },
      },
    });

    const direct = await engine.evaluate({
      target: "database",
      path: "main/posts/post-1",
      operation: "update",
      authentication: { uid: "user-1" },
      fetchDocument: async () => ({ ownerId: "user-1" }),
    });
    const server = await engine.evaluate({
      target: "database",
      path: "main/posts/post-1",
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
              database: {
                denytokendb: {
                  read: "deny",
                  write: "deny",
                },
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
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("issues Turso database tokens through the Platform API when configured", async () => {
    const fetchMock = mockExistingDatabase({
      url: "libsql://tokendb.turso.io",
      databaseToken: "platform-jwt",
    });
    const app = deploy([
      Functions.tursoToken(dynamicOptions({ autoCreateDatabase: true })),
    ]);

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
      databaseToken: "scoped-token",
    });
    const app = deploy([
      Functions.tursoToken(dynamicOptions({ autoCreateDatabase: true })),
    ]);

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
    expect(execute).toHaveBeenCalledWith("SELECT 1");
  });

  test("waits for an auto-created database to be routable before issuing a direct token", async () => {
    mockCreatedDatabase({
      url: "libsql://tenant-routing.turso.io",
      databaseToken: "routing-token",
    });
    execute
      .mockRejectedValueOnce(
        new Error(
          'Hrana(Api("status=502 Bad Gateway, body={\\"error\\":\\"no route configured for host tenant-routing.turso.io\\"}"))',
        ),
      )
      .mockResolvedValueOnce({ rows: [] });
    const app = deploy([
      Functions.tursoToken(dynamicOptions({ autoCreateDatabase: true })),
    ]);

    const response = await app.request("http://localhost/turso/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database: "tenant-routing",
        ttlSeconds: 60,
      }),
    });
    const body = (await response.json()) as { token: string; url: string };

    expect(response.status).toBe(200);
    expect(body.token).toBe("routing-token");
    expect(body.url).toBe("libsql://tenant-routing.turso.io");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(1, "SELECT 1");
    expect(execute).toHaveBeenNthCalledWith(2, "SELECT 1");
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
          autoCreateDatabase: true,
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
          use_tursodb: true,
        }),
      }),
    );
  });

  test("waits for a newly created database before executing CRUD", async () => {
    mockCreatedDatabase({
      url: "libsql://readydb.turso.io",
    });
    execute
      .mockRejectedValueOnce(new Error("HTTP error! status: 404"))
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const app = deploy([
      Functions.turso(dynamicOptions({ autoCreateDatabase: true })),
    ]);

    const response = await app.request(
      "http://localhost/turso/database/readydb/users",
    );

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenNthCalledWith(1, "SELECT 1");
    expect(execute).toHaveBeenNthCalledWith(2, "SELECT 1");
    expect(execute).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SELECT * FROM "users"'),
      expect.any(Array),
    );
  });

  test("does not create databases unless autoCreateDatabase is true", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);
    const app = deploy([Functions.turso(dynamicOptions())]);

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

  test("recognizes the TursoDB UUID marker used by the Turso CLI", () => {
    expect(isTursoDatabaseId(tursoDatabaseId)).toBe(true);
    expect(isTursoDatabaseId("00000000-0000-4000-8000-000000000000"))
      .toBe(false);
    expect(isTursoDatabaseId("invalid-id")).toBe(false);
  });

  test("rejects an existing legacy SQLite database", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        database: {
          DbId: "00000000-0000-4000-8000-000000000000",
          Hostname: "legacy-sqlite.turso.io",
        },
      }),
    } as Response);
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/turso/database/legacy-sqlite/users",
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toContain("legacy SQLite database, not TursoDB");
    expect(connect).not.toHaveBeenCalled();
  });

  test("refuses a database whose engine cannot be verified", async () => {
    const errorLog = jest.spyOn(console, "error").mockImplementation();
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        database: { Hostname: "unknown-engine.turso.io" },
      }),
    } as Response);
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/turso/database/unknown-engine/users",
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toContain("Could not verify that database is TursoDB");
    expect(errorLog).toHaveBeenCalledWith(
      "Turso request failed",
      expect.objectContaining({
        status: 500,
        operation: "crud",
        phase: "connect",
        method: "GET",
        database: "unknown-engine",
        table: "users",
        error: expect.stringContaining("Could not verify that database is TursoDB"),
      }),
    );
    errorLog.mockRestore();
  });

  test("logs retryable Turso failures before returning 503", async () => {
    const errorLog = jest.spyOn(console, "error").mockImplementation();
    mockExistingDatabase({ url: "libsql://temporary-failure.turso.io" });
    execute.mockRejectedValueOnce(new Error("Turso database: 503"));
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/turso/database/temporary-failure/users",
    );

    expect(response.status).toBe(503);
    expect(errorLog).toHaveBeenCalledWith(
      "Turso request failed",
      expect.objectContaining({
        status: 503,
        operation: "crud",
        phase: "execute",
        method: "GET",
        database: "temporary-failure",
        table: "users",
        error: "Turso database: 503",
      }),
    );
    errorLog.mockRestore();
  });

  test("explains how to enable Concurrent Writes when creation fails", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response("TursoDB preview is not enabled", { status: 400 }),
      );
    const app = deploy([
      Functions.turso(dynamicOptions({ autoCreateDatabase: true })),
    ]);

    const response = await app.request(
      "http://localhost/turso/database/preview-disabled/users",
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toContain("TursoDB preview is not enabled");
    expect(body.error).toContain("Settings > General");
  });

  test("retries a concurrent write after a row conflict", async () => {
    mockExistingDatabase({ url: "libsql://conflict-db.turso.io" });
    execute
      .mockRejectedValueOnce(new Error("SQLITE_BUSY: conflict at commit"))
      .mockResolvedValueOnce({ rows: [] });
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/turso/database/conflict-db/users/user-1",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );

    expect(response.status).toBe(200);
    expect(concurrent).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("retries a concurrent write after the libsql connection cap fires", async () => {
    mockExistingDatabase({ url: "libsql://connection-cap-db.turso.io" });
    execute
      .mockRejectedValueOnce(
        new Error("Database connections limit exceeded, try to reduce concurrency"),
      )
      .mockResolvedValueOnce({ rows: [] });
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/turso/database/connection-cap-db/users/user-1",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );

    expect(response.status).toBe(200);
    expect(concurrent).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  test("retries a concurrent write after a stray rollback surfaces", async () => {
    mockExistingDatabase({ url: "libsql://rollback-race-db.turso.io" });
    execute
      .mockRejectedValueOnce(
        new Error(
          "Tursodb error: Transaction error: cannot rollback - no transaction is active",
        ),
      )
      .mockResolvedValueOnce({ rows: [] });
    const app = deploy([Functions.turso(dynamicOptions())]);

    const response = await app.request(
      "http://localhost/turso/database/rollback-race-db/users/user-1",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );

    expect(response.status).toBe(200);
    expect(concurrent).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  test("applies declared DDL outside a concurrent write transaction", async () => {
    mockExistingDatabase({ url: "libsql://ddl-before-write.turso.io" });
    let insideConcurrentTransaction = false;
    concurrent.mockImplementationOnce(async (callback: () => Promise<unknown>) => {
      insideConcurrentTransaction = true;
      try {
        return await callback();
      } finally {
        insideConcurrentTransaction = false;
      }
    });
    execute.mockImplementation(async (statement: string | { sql: string }) => {
      const sql = typeof statement === "string" ? statement : statement.sql;
      if (/^(?:CREATE|ALTER)\b/.test(sql) && insideConcurrentTransaction) {
        throw new Error(
          "DDL statements require an exclusive transaction (use BEGIN instead of BEGIN CONCURRENT)",
        );
      }
      if (sql.startsWith("PRAGMA table_info")) {
        return {
          columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
          rows: [
            [0, "id", "TEXT", 0, null, 1],
            [1, "created_at", "INTEGER", 0, null, 0],
            [2, "updated_at", "INTEGER", 0, null, 0],
            [3, "name", "TEXT", 0, null, 0],
          ],
        };
      }
      return { columns: [], rows: [] };
    });
    const app = deploy([
      Functions.turso(dynamicOptions({
        schemaManifest: {
          version: "ddl-before-write-v1",
          tables: {
            users: {
              database: "ddl-before-write",
              table: "users",
              columns: [{ name: "name", type: "TEXT" }],
            },
          },
        },
      })),
    ]);

    const response = await app.request(
      "http://localhost/turso/database/ddl-before-write/users/user-1",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: { name: "Alice" } }),
      },
    );

    expect(response.status).toBe(200);
    expect(concurrent).toHaveBeenCalledTimes(1);
  });

  test("retries declared DDL after the libsql connection cap fires", async () => {
    mockExistingDatabase({ url: "libsql://ddl-retry.turso.io" });
    execute
      .mockRejectedValueOnce(
        new Error("Database connections limit exceeded, try to reduce concurrency"),
      )
      .mockResolvedValue({ columns: [], rows: [] });
    const app = deploy([
      Functions.turso(dynamicOptions({
        schemaManifest: {
          version: "ddl-retry-v1",
          tables: {
            users: {
              database: "ddl-retry",
              table: "users",
              columns: [{ name: "name", type: "TEXT" }],
            },
          },
        },
      })),
    ]);

    const response = await app.request(
      "http://localhost/turso/database/ddl-retry/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: { id: "user-1", name: "Alice" } }),
      },
    );

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(7);
    expect(concurrent).toHaveBeenCalledTimes(1);
  });

  test("returns an access-time error when database group is not configured", async () => {
    delete process.env.TURSO_GROUP;
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );
    const app = deploy([
      Functions.turso(
        dynamicOptions({
          group: undefined,
          autoCreateDatabase: true,
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});


describe("Turso接続設定の分離", () => {
  beforeEach(() => jest.restoreAllMocks());
  afterEach(() => jest.restoreAllMocks());

  test("同じDB名でも別組織の接続を再利用しない", async () => {
    const database = "region-org-isolation";
    const first = dynamicOptions({ organization: "region-org-a" });
    const second = dynamicOptions({ organization: "region-org-b" });
    cacheDatabaseConnection(database, first, {
      url: "libsql://region-org-a.turso.io",
      authToken: "a-token",
      authTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    const api = mockExistingDatabase({ url: "libsql://region-org-b.turso.io" });
    const connection = await resolveDatabaseConnection(database, second);
    expect(connection.url).toBe("libsql://region-org-b.turso.io");
    expect(api).toHaveBeenCalledTimes(2);
  });

  test("資格情報を変更したら同じ組織でも接続を再検証する", async () => {
    const database = "region-credential-isolation";
    const first = dynamicOptions({ platformApiToken: "old-credential" });
    cacheDatabaseConnection(database, first, {
      url: "libsql://old-credential.turso.io",
      authToken: "old-token",
      authTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    const api = mockExistingDatabase({ url: "libsql://new-credential.turso.io" });
    const connection = await resolveDatabaseConnection(database,
      dynamicOptions({ platformApiToken: "new-credential" }));
    expect(connection.url).toBe("libsql://new-credential.turso.io");
    expect(api).toHaveBeenCalledTimes(2);
  });
});


describe("Tursoリージョン配置", () => {
  const groups = [
    { name: "prod-apac", continents: ["AS", "OC"], countries: ["JP"] },
    { name: "prod-us", continents: ["NA", "SA"] },
    { name: "prod-eu", continents: ["EU", "AF"] },
  ];
  let sequence = 0;
  const options = (extra: Partial<TursoWorkersOptions> = {}): TursoWorkersOptions =>
    dynamicOptions({ group: "prod-apac", groups, autoCreateDatabase: true, ...extra });
  const database = () => `region-${++sequence}`;

  beforeEach(() => {
    jest.restoreAllMocks();
    execute.mockReset().mockResolvedValue({ columns: [], rows: [] });
    close.mockReset();
    // テストから外部へ接続しないよう、各ケースの設定漏れも拒否します。
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unmocked Platform API"));
  });
  afterEach(() => jest.restoreAllMocks());

  function platform(existingGroup?: string, conflict = false) {
    let storedGroup = existingGroup;
    return jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/auth/tokens")) {
        return Response.json({ jwt: "region-db-token" });
      }
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        storedGroup = conflict ? "prod-eu" : body.group;
        return conflict
          ? Response.json({ error: "database with name example already exists" }, { status: 409 })
          : Response.json({});
      }
      if (!storedGroup) return new Response(null, { status: 404 });
      return Response.json({ database: {
        DbId: tursoDatabaseId, Hostname: "region-test.turso.io",
        group: storedGroup, primaryRegion: "verified-primary",
      } });
    });
  }

  test.each([
    ["JP", "AS", "prod-apac"], ["US", "NA", "prod-us"],
    ["DE", "EU", "prod-eu"], [undefined, undefined, "prod-apac"],
  ])("作成時の自動選択 %s/%s → %s", async (country, continent, expected) => {
    const api = platform();
    const endpoint = await resolveDatabaseEndpoint(database(), options(), { country, continent });
    const creation = api.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(creation?.[1]?.body))).toMatchObject({ group: expected, use_tursodb: true });
    expect(endpoint).toMatchObject({ group: expected, primaryRegion: "verified-primary", created: true });
  });

  test("resolver、希望値、国、大陸、既定値の優先順位", async () => {
    const context = { requestedGroup: "prod-us", country: "JP", continent: "EU", authentication: { uid: "alice" } };
    const resolver = jest.fn(async () => "prod-eu");
    expect(await resolveTursoCreationGroup("alice", options({ resolveGroup: resolver }), context)).toBe("prod-eu");
    expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ database: "alice", authentication: { uid: "alice" } }));
    expect(await resolveTursoCreationGroup("alice", options(), context)).toBe("prod-us");
    expect(await resolveTursoCreationGroup("alice", options(), { country: "JP", continent: "EU" })).toBe("prod-apac");
    expect(await resolveTursoCreationGroup("alice", options({ group: undefined }))).toBe("prod-apac");
    await expect(resolveTursoCreationGroup("alice", options({ resolveGroup: () => "unknown" }))).rejects.toThrow("included in groups");
  });

  test("既存DBは別地域・別希望値でも所属先を維持しresolverを呼ばない", async () => {
    const api = platform("prod-eu");
    const resolver = jest.fn(() => "prod-us");
    const db = database();
    const config = options({ resolveGroup: resolver });
    const first = await resolveDatabaseEndpoint(db, config, { continent: "AS" });
    const second = await resolveDatabaseEndpoint(db, config, { continent: "NA", requestedGroup: "prod-us" });
    expect(first.group).toBe("prod-eu");
    expect(second).toEqual(first);
    expect(resolver).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledTimes(1);
  });

  test("グループ未設定でも既存DBを利用できる", async () => {
    platform("prod-eu");
    expect((await resolveDatabaseEndpoint(database(), dynamicOptions({ group: undefined }))).group).toBe("prod-eu");
  });

  test("未許可の希望値は外部API呼び出し前に拒否する", async () => {
    const api = platform();
    await expect(resolveDatabaseEndpoint(database(), options(), { requestedGroup: "unknown" })).rejects.toThrow("not allowed");
    await expect(resolveDatabaseEndpoint(database(), options(), { requestedGroup: "" })).rejects.toThrow("Invalid group");
    await expect(resolveDatabaseEndpoint(database(), dynamicOptions(), { requestedGroup: "primary-group" })).rejects.toThrow("not allowed");
    expect(api).not.toHaveBeenCalled();
  });

  test("キャッシュ経由も所属先の許可リストを再検証する", async () => {
    platform("prod-eu");
    const db = database();
    await resolveDatabaseConnection(db, options());
    await expect(resolveDatabaseEndpoint(db, options({ groups: [groups[0]] }))).rejects.toThrow("not allowed");
    await expect(resolveDatabaseConnection(db, options({ groups: [groups[0]] }))).rejects.toThrow("not allowed");
  });

  test("同時初回作成は地域が違っても1件に集約する", async () => {
    const api = platform();
    const db = database();
    const result = await Promise.all([
      resolveDatabaseEndpoint(db, options(), { continent: "AS" }),
      resolveDatabaseEndpoint(db, options(), { continent: "EU" }),
    ]);
    expect(result[0].group).toBe("prod-apac");
    expect(result[1]).toEqual(result[0]);
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  test("別Workerとの作成競合は勝者の配置を採用する", async () => {
    const api = platform(undefined, true);
    const endpoint = await resolveDatabaseEndpoint(database(), options(), { continent: "AS" });
    expect(endpoint.group).toBe("prod-eu");
    expect(endpoint.created).toBe(true); // 作成直後なのでready確認が必要です。
    expect(api).toHaveBeenCalledTimes(3);
  });

  test("同時解決に合流した呼び出し元も独自の許可リストを検証する", async () => {
    platform("prod-eu");
    const db = database();
    const result = await Promise.allSettled([
      resolveDatabaseEndpoint(db, options()),
      resolveDatabaseEndpoint(db, options({ groups: [groups[0]] })),
    ]);
    expect(result[0].status).toBe("fulfilled");
    expect(result[1].status).toBe("rejected");
  });

  test("所属情報がないAPI応答は複数グループ設定時に拒否する", async () => {
    mockExistingDatabase({ url: "region-missing-group.turso.io" });
    await expect(resolveDatabaseEndpoint(database(), options())).rejects.toThrow("could not be verified");
  });

  test("旧環境変数は自動選択を上書きしない", async () => {
    const config = resolveTursoWorkersOptionsFromEnv({ env: {
      TURSO_GROUP: "prod-apac", TURSO_GROUPS: JSON.stringify(groups),
    } } as unknown as Context, options());
    expect(await resolveTursoCreationGroup("alice", config, { continent: "EU" })).toBe("prod-eu");
  });

  test.each(["crud", "token"])("Workerの%s経路がrequest.cfから自動配置する", async (kind) => {
    const api = platform();
    const db = database();
    const app = deploy([Functions.turso(options()), Functions.tursoToken(options())]);
    const request = new Request(kind === "token"
      ? `http://localhost/turso/token/database/${db}`
      : `http://localhost/turso/database/${db}/items`, kind === "token" ? {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations: ["read"] }),
      } : undefined);
    Object.defineProperty(request, "cf", { value: { country: "DE", continent: "EU" } });
    const response = await app.fetch(request);
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    if (kind === "token") expect(body).toMatchObject({ group: "prod-eu", primaryRegion: "verified-primary" });
    const creation = api.mock.calls.find(([url, init]) => init?.method === "POST" && !String(url).includes("/auth/tokens"));
    expect(JSON.parse(String(creation?.[1]?.body)).group).toBe("prod-eu");
  });

  test("HTTP外のNodeアダプターも共通resolverで作成する", async () => {
    const api = platform();
    const adapter = new TursoDatabaseAdapter({ options: options(), groupContext: { continent: "NA" } });
    await adapter.getDocument(`database/${database()}/items/one`);
    const creation = api.mock.calls.find(([url, init]) => init?.method === "POST" && !String(url).includes("/auth/tokens"));
    expect(JSON.parse(String(creation?.[1]?.body)).group).toBe("prod-us");
  });
});
