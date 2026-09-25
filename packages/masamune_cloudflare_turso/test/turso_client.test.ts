import { createTursoClient } from "../src/lib/turso_client";

// `@tursodatabase/serverless` 1.3.0 removed `Connection#execute`. Model that
// native shape so a regression back to `connect()` fails loudly, while the
// real `@tursodatabase/serverless/compat` client talks to a stubbed Hrana
// endpoint below.
const connect = jest.fn(() => ({
  transaction: () => {
    throw new Error("native transaction API must not be used");
  },
  close: async () => undefined,
}));

jest.mock("@tursodatabase/serverless", () => ({
  connect,
}));

type HranaValue = { type: string; value?: string | number };

interface HranaRequest {
  url: string;
  authorization: string | null;
  baton: string | null;
  sql: string;
  args: HranaValue[];
}

interface HranaStatementResult {
  cols?: string[];
  decltypes?: string[];
  rows?: HranaValue[][];
  affectedRowCount?: number;
  lastInsertRowid?: string;
  error?: string;
}

const connection = {
  url: "libsql://turso-client-test.turso.io",
  authToken: "test-token",
};

let requests: HranaRequest[] = [];
let respond: (sql: string) => HranaStatementResult;
let batonSequence = 0;
const originalFetch = globalThis.fetch;

describe("createTursoClient", () => {
  beforeEach(() => {
    requests = [];
    batonSequence = 0;
    respond = () => ({});
    globalThis.fetch = jest.fn(async (input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        baton: string | null;
        batch: { steps: Array<{ stmt: { sql: string; args: HranaValue[] } }> };
      };
      const stmt = body.batch.steps[0].stmt;
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("Authorization"),
        baton: body.baton,
        sql: stmt.sql,
        args: stmt.args,
      });
      return cursorResponse(respond(stmt.sql));
    }) as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test("executes through the compat client when the native connection lacks execute", async () => {
    respond = () => ({
      cols: ["id", "name"],
      decltypes: ["TEXT", "TEXT"],
      rows: [[{ type: "text", value: "user-1" }, { type: "text", value: "Alice" }]],
      affectedRowCount: 1,
      lastInsertRowid: "42",
    });
    const client = createTursoClient(connection);

    const result = await client.execute("SELECT id, name FROM users WHERE id = ?", ["user-1"]);

    expect(connect).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: "https://turso-client-test.turso.io/v3/cursor",
      authorization: "Bearer test-token",
      sql: "SELECT id, name FROM users WHERE id = ?",
      args: [{ type: "text", value: "user-1" }],
    });
    expect(result.columns).toEqual(["id", "name"]);
    expect(result.columnTypes).toEqual(["TEXT", "TEXT"]);
    expect(result.rowsAffected).toBe(1);
    expect(result.lastInsertRowid).toBe(BigInt(42));
    expect(Array.from(result.rows[0] as ArrayLike<unknown>)).toEqual(["user-1", "Alice"]);
    expect(result.rows[0]).toMatchObject({ id: "user-1", name: "Alice" });
  });

  test("accepts statement objects with and without args", async () => {
    const client = createTursoClient(connection);

    await client.execute({ sql: "SELECT 1" });
    await client.execute({ sql: "SELECT ?", args: [7] });

    expect(requests.map(({ sql, args }) => ({ sql, args }))).toEqual([
      { sql: "SELECT 1", args: [] },
      { sql: "SELECT ?", args: [{ type: "integer", value: "7" }] },
    ]);
  });

  test("runs concurrent callbacks inside BEGIN CONCURRENT on one stream", async () => {
    const client = createTursoClient(connection);

    const result = await client.concurrent(async () => {
      await client.execute("UPDATE users SET name = ? WHERE id = ?", ["Bob", "user-1"]);
      await client.execute("DELETE FROM users WHERE id = ?", ["user-2"]);
      return "done";
    });

    expect(result).toBe("done");
    expect(requests.map(({ sql }) => sql)).toEqual([
      "BEGIN CONCURRENT",
      "UPDATE users SET name = ? WHERE id = ?",
      "DELETE FROM users WHERE id = ?",
      "COMMIT",
    ]);
    // Every statement after BEGIN must reuse the stream opened by BEGIN;
    // otherwise the writes would run outside the transaction.
    expect(requests[0].baton).toBeNull();
    expect(requests.slice(1).map(({ baton }) => baton)).toEqual([
      "baton-1",
      "baton-2",
      "baton-3",
    ]);
  });

  test("rolls back and rethrows when the concurrent callback fails", async () => {
    respond = (sql) => sql.startsWith("INSERT") ? { error: "UNIQUE constraint failed: users.id" } : {};
    const client = createTursoClient(connection);

    await expect(client.concurrent(async () => {
      await client.execute("INSERT INTO users (id) VALUES (?)", ["user-1"]);
    })).rejects.toThrow("UNIQUE constraint failed: users.id");

    expect(requests.map(({ sql }) => sql)).toEqual([
      "BEGIN CONCURRENT",
      "INSERT INTO users (id) VALUES (?)",
      "ROLLBACK",
    ]);
  });

  test("rolls back when COMMIT reports a write conflict", async () => {
    respond = (sql) => sql === "COMMIT" ? { error: "SQLITE_BUSY: write conflict" } : {};
    const client = createTursoClient(connection);

    await expect(client.concurrent(async () => {
      await client.execute("UPDATE users SET name = 'x'");
    })).rejects.toThrow("write conflict");

    expect(requests.map(({ sql }) => sql)).toEqual([
      "BEGIN CONCURRENT",
      "UPDATE users SET name = 'x'",
      "COMMIT",
      "ROLLBACK",
    ]);
  });

  test("closes the compat client", async () => {
    const client = createTursoClient(connection);
    await client.execute("SELECT 1");

    await expect(client.close()).resolves.toBeUndefined();
    await expect(client.execute("SELECT 1")).rejects.toThrow(/closed/i);
  });
});

function cursorResponse(result: HranaStatementResult): Response {
  const baton = `baton-${++batonSequence}`;
  const entries: unknown[] = result.error
    ? [{ type: "step_error", step: 0, error: { message: result.error } }]
    : [
      {
        type: "step_begin",
        step: 0,
        cols: (result.cols ?? []).map((name, index) => ({
          name,
          decltype: result.decltypes?.[index],
        })),
      },
      ...(result.rows ?? []).map((row) => ({ type: "row", row })),
      {
        type: "step_end",
        affected_row_count: result.affectedRowCount ?? 0,
        last_insert_rowid: result.lastInsertRowid ?? null,
      },
    ];
  const body = [{ baton, base_url: null }, ...entries]
    .map((line) => JSON.stringify(line))
    .join("\n") + "\n";
  return new Response(body, { status: 200 });
}
