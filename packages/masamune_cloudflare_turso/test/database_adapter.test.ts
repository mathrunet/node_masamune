import { DatabaseIncrement } from "@mathrunet/masamune_cloudflare";
import {
  decodeColumnName,
  encodeColumnName,
  parseCollectionPath,
  parseDocumentPath,
  TursoDatabaseAdapter,
} from "../src/lib/database_adapter";
import { TursoClient, TursoResultSet } from "../src/lib/turso_client";

interface ExecutedStatement {
  sql: string;
  args: unknown[];
}

function createMockClient(
  handler: (statement: ExecutedStatement) => TursoResultSet | undefined,
): { client: TursoClient; executed: ExecutedStatement[] } {
  const executed: ExecutedStatement[] = [];
  const client = {
    execute: async (
      statement: string | { sql: string; args?: unknown[] },
    ): Promise<TursoResultSet> => {
      const normalized: ExecutedStatement =
        typeof statement === "string"
          ? { sql: statement, args: [] }
          : { sql: statement.sql, args: statement.args ?? [] };
      executed.push(normalized);
      return handler(normalized) ?? { rows: [] };
    },
  } as unknown as TursoClient;
  return { client, executed };
}

describe("path parsing", () => {
  test("parseDocumentPath handles top-level documents", () => {
    expect(parseDocumentPath("database/user-db/user/abc")).toEqual({
      database: "user-db",
      table: "user",
      id: "abc",
      parentId: "",
    });
  });

  test("parseDocumentPath handles nested documents", () => {
    expect(
      parseDocumentPath("database/user-db/user/abc/transaction/t1"),
    ).toEqual({
      database: "user-db",
      table: "user__transaction",
      id: "t1",
      parentId: "abc",
    });
  });

  test("parseDocumentPath rejects collection paths", () => {
    expect(() => parseDocumentPath("database/user-db/user")).toThrow(
      "Invalid document path",
    );
  });

  test("parseDocumentPath rejects paths without a database prefix", () => {
    expect(() => parseDocumentPath("user/abc")).toThrow(
      "Invalid document path",
    );
  });

  test("parseCollectionPath handles top-level collections", () => {
    expect(parseCollectionPath("database/user-db/user")).toEqual({
      database: "user-db",
      table: "user",
      parentId: "",
    });
  });

  test("parseCollectionPath handles nested collections", () => {
    expect(
      parseCollectionPath("database/user-db/user/abc/transaction"),
    ).toEqual({
      database: "user-db",
      table: "user__transaction",
      parentId: "abc",
    });
  });

  test("parseCollectionPath rejects document paths", () => {
    expect(() => parseCollectionPath("database/user-db/user/abc")).toThrow(
      "Invalid collection path",
    );
  });

  test("parseCollectionPath rejects paths without a database prefix", () => {
    expect(() => parseCollectionPath("user")).toThrow(
      "Invalid collection path",
    );
  });
});

describe("column name encoding", () => {
  test("encodes @ prefixed keys", () => {
    expect(encodeColumnName("@time")).toBe("mf_at_time");
    expect(encodeColumnName("@uid")).toBe("mf_at_uid");
    expect(encodeColumnName("token")).toBe("token");
  });

  test("decodes back to original keys", () => {
    expect(decodeColumnName("mf_at_time")).toBe("@time");
    expect(decodeColumnName("token")).toBe("token");
  });
});

describe("TursoDatabaseAdapter", () => {
  test("getDocument returns null for missing table", async () => {
    const { client } = createMockClient(() => {
      throw new Error("no such table: user");
    });
    const adapter = new TursoDatabaseAdapter({ client });
    expect(await adapter.getDocument("database/user-db/user/abc")).toBeNull();
  });

  test("getDocument decodes row into document data", async () => {
    const { client, executed } = createMockClient((statement) => {
      if (statement.sql.startsWith("SELECT")) {
        return {
          columns: [
            "id",
            "parent_id",
            "created_at",
            "updated_at",
            "name",
            "mf_at_uid",
            "meta",
          ],
          rows: [["abc", "", 1, 2, "John", "abc", '{"a":1}']],
        };
      }
      return undefined;
    });
    const adapter = new TursoDatabaseAdapter({ client });
    const document = await adapter.getDocument("database/user-db/user/abc");
    expect(document).toEqual({
      path: "database/user-db/user/abc",
      data: {
        name: "John",
        "@uid": "abc",
        meta: { a: 1 },
      },
    });
    expect(executed[0].sql).toContain("WHERE id = ? AND parent_id = ?");
    expect(executed[0].args).toEqual(["abc", ""]);
  });

  test("saveDocument merges with existing row and resolves increments", async () => {
    const { client, executed } = createMockClient((statement) => {
      if (statement.sql.startsWith("SELECT")) {
        return {
          columns: [
            "id",
            "parent_id",
            "created_at",
            "updated_at",
            "wallet",
            "name",
          ],
          rows: [["abc", "", 100, 100, 500, "John"]],
        };
      }
      return { rows: [] };
    });
    const adapter = new TursoDatabaseAdapter({ client });
    await adapter.saveDocument(
      "database/user-db/user/abc",
      {
        wallet: new DatabaseIncrement(120),
        "@uid": "abc",
      },
      { merge: true },
    );
    const insert = executed.find((statement) =>
      statement.sql.startsWith("INSERT OR REPLACE"),
    );
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain('"wallet"');
    expect(insert!.sql).toContain('"mf_at_uid"');
    const keys =
      insert!.sql
        .match(/\(([^)]+)\) VALUES/)?.[1]
        .split(",")
        .map((key) => key.trim().replace(/"/g, "")) ?? [];
    const values = new Map(
      keys.map((key, index) => [key, insert!.args[index]]),
    );
    expect(values.get("wallet")).toBe(620);
    expect(values.get("name")).toBe("John");
    expect(values.get("mf_at_uid")).toBe("abc");
    expect(values.get("id")).toBe("abc");
    expect(values.get("parent_id")).toBe("");
    expect(values.get("created_at")).toBe(100);
  });

  test("saveDocument without merge overwrites the document", async () => {
    const { client, executed } = createMockClient((statement) => {
      if (statement.sql.startsWith("SELECT")) {
        return {
          columns: [
            "id",
            "parent_id",
            "created_at",
            "updated_at",
            "wallet",
            "name",
          ],
          rows: [["abc", "", 100, 100, 500, "John"]],
        };
      }
      return { rows: [] };
    });
    const adapter = new TursoDatabaseAdapter({ client });
    await adapter.saveDocument(
      "database/user-db/user/abc",
      {
        wallet: new DatabaseIncrement(120),
      },
      { merge: false },
    );
    const insert = executed.find((statement) =>
      statement.sql.startsWith("INSERT OR REPLACE"),
    );
    const keys =
      insert!.sql
        .match(/\(([^)]+)\) VALUES/)?.[1]
        .split(",")
        .map((key) => key.trim().replace(/"/g, "")) ?? [];
    const values = new Map(
      keys.map((key, index) => [key, insert!.args[index]]),
    );
    // Increment still resolves against the existing value.
    expect(values.get("wallet")).toBe(620);
    // But other fields are not carried over.
    expect(values.has("name")).toBe(false);
  });

  test("saveDocument creates a new row when none exists", async () => {
    const { client, executed } = createMockClient((statement) => {
      if (statement.sql.startsWith("SELECT")) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const adapter = new TursoDatabaseAdapter({ client });
    await adapter.saveDocument(
      "database/user-db/user/abc/transaction/t1",
      {
        amount: new DatabaseIncrement(50),
        product: "item",
      },
      { merge: true },
    );
    const insert = executed.find((statement) =>
      statement.sql.startsWith("INSERT OR REPLACE"),
    );
    expect(insert!.sql).toContain('"user__transaction"');
    const keys =
      insert!.sql
        .match(/\(([^)]+)\) VALUES/)?.[1]
        .split(",")
        .map((key) => key.trim().replace(/"/g, "")) ?? [];
    const values = new Map(
      keys.map((key, index) => [key, insert!.args[index]]),
    );
    expect(values.get("amount")).toBe(50);
    expect(values.get("product")).toBe("item");
    expect(values.get("id")).toBe("t1");
    expect(values.get("parent_id")).toBe("abc");
  });

  test("query filters by parent_id, wheres and cursor", async () => {
    const { client, executed } = createMockClient((statement) => {
      if (statement.sql.startsWith("SELECT")) {
        return {
          columns: ["id", "parent_id", "created_at", "updated_at", "token"],
          rows: [
            ["doc1", "", 1, 1, "token-1"],
            ["doc2", "", 1, 1, "token-2"],
          ],
        };
      }
      return undefined;
    });
    const adapter = new TursoDatabaseAdapter({ client });
    const result = await adapter.query("database/user-db/subscription", {
      wheres: [{ type: "equalTo", key: "token", value: "token-1" }],
      limit: 2,
      cursor: "doc0",
    });
    expect(executed[0].sql).toContain(
      'WHERE parent_id = ? AND "token" = ? AND id > ? ORDER BY id ASC LIMIT 2',
    );
    expect(executed[0].args).toEqual(["", "token-1", "doc0"]);
    expect(result.docs).toEqual([
      {
        path: "database/user-db/subscription/doc1",
        data: { token: "token-1" },
      },
      {
        path: "database/user-db/subscription/doc2",
        data: { token: "token-2" },
      },
    ]);
    expect(result.cursor).toBe("doc2");
  });

  test("query returns empty result for missing table", async () => {
    const { client } = createMockClient(() => {
      throw new Error("no such table: subscription");
    });
    const adapter = new TursoDatabaseAdapter({ client });
    const result = await adapter.query("database/user-db/subscription");
    expect(result).toEqual({ docs: [], cursor: null });
  });

  test("query returns null cursor when fewer docs than limit", async () => {
    const { client } = createMockClient((statement) => {
      if (statement.sql.startsWith("SELECT")) {
        return {
          columns: ["id", "parent_id", "created_at", "updated_at", "token"],
          rows: [["doc1", "", 1, 1, "token-1"]],
        };
      }
      return undefined;
    });
    const adapter = new TursoDatabaseAdapter({ client });
    const result = await adapter.query("database/user-db/subscription", {
      limit: 10,
    });
    expect(result.cursor).toBeNull();
  });
});
