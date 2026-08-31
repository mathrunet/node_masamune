import { ensureTableSchema } from "../src/lib/schema";
import { TursoClient, TursoResultSet } from "../src/lib/turso_client";

const emptyResult = (): TursoResultSet => ({ rows: [] });

describe("Turso additive schema migration", () => {
  test("treats a concurrent duplicate-column migration as idempotent", async () => {
    let pragmaCalls = 0;
    let releasePragma!: () => void;
    const bothPragmasStarted = new Promise<void>((resolve) => {
      releasePragma = resolve;
    });
    let alterCalls = 0;
    let schemaChanged = false;
    const execute = jest.fn(async (statement: string | { sql: string }) => {
      const sql = typeof statement === "string" ? statement : statement.sql;
      if (sql.startsWith("PRAGMA table_info")) {
        pragmaCalls++;
        if (schemaChanged) {
          return {
            columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
            rows: [
              [0, "id", "TEXT", 0, null, 1],
              [1, "age", "INTEGER", 0, null, 0],
            ],
          };
        }
        if (pragmaCalls === 2) {
          releasePragma();
        }
        await bothPragmasStarted;
        return {
          columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
          rows: [[0, "id", "TEXT", 0, null, 1]],
        };
      }
      if (sql.startsWith("ALTER TABLE")) {
        alterCalls++;
        schemaChanged = true;
        if (alterCalls === 2) {
          throw new Error("duplicate column name: age");
        }
      }
      return emptyResult();
    });
    const client = {
      execute,
      concurrent: async <T>(callback: () => Promise<T>) => callback(),
      close: async () => {},
    } as TursoClient;

    await expect(Promise.all([
      ensureTableSchema({
        client,
        table: "users",
        value: { age: 20 },
        autoCreateTable: false,
        autoMigrateAddColumns: true,
      }),
      ensureTableSchema({
        client,
        table: "users",
        value: { age: 20 },
        autoCreateTable: false,
        autoMigrateAddColumns: true,
      }),
    ])).resolves.toEqual([undefined, undefined]);
  });

  test("does not infer a persistent column type from null", async () => {
    const client = {
      execute: jest.fn(async (statement: string | { sql: string }) => {
        const sql = typeof statement === "string" ? statement : statement.sql;
        if (sql.startsWith("PRAGMA table_info")) {
          return { columns: ["name", "type"], rows: [] };
        }
        return emptyResult();
      }),
      concurrent: async <T>(callback: () => Promise<T>) => callback(),
      close: async () => {},
    } as TursoClient;

    await expect(ensureTableSchema({
      client,
      table: "users",
      value: { age: null },
      autoCreateTable: false,
      autoMigrateAddColumns: true,
    })).rejects.toThrow(
      "Cannot infer SQL type for column age from null. Provide a schema manifest.",
    );
  });
});
