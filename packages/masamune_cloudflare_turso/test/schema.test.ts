import { parseCrudRequest } from "../src/lib/request";
import { Hono } from "hono";
import { executeCrud } from "../src/lib/crud";
import { ensureTableSchema, decodeVectorRow, vectorProjection } from "../src/lib/schema";
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


test("native vector宣言を保持しTEXTとの型不一致を拒否する", async () => {
  const execute = jest.fn(async () => ({ columns: ["name", "type"], rows: [["embedding", "TEXT"]] }));
  const client = { execute, close: async () => {}, concurrent: async (cb: any) => cb() } as TursoClient;
  await expect(ensureTableSchema({ client, table: "items", value: {}, autoCreateTable: true,
    autoMigrateAddColumns: true, declaredColumns: [{ name: "embedding", type: "F32_BLOB(3)" }] })).rejects.toThrow("Column type mismatch");
  expect(JSON.stringify(execute.mock.calls)).toContain("F32_BLOB(3)");
});


test("TursoDBのPRAGMAが省略するvector次元をDDLで照合する", async () => {
  const execute = jest.fn(async (statement: string | { sql: string }) => {
    const sql = typeof statement === "string" ? statement : statement.sql;
    if (sql.startsWith("PRAGMA")) return {columns:["name","type"], rows:[["embedding","F32_BLOB"]]};
    return {columns:["sql"], rows:[['CREATE TABLE "items" ("embedding" F32_BLOB (3))']]};
  });
  const client = { execute, close: async () => {}, concurrent: async (cb: any) => cb() } as TursoClient;
  const options = {client, table:"items", value:{}, autoCreateTable:false, autoMigrateAddColumns:true};
  await expect(ensureTableSchema({...options,declaredColumns:[{name:"embedding",type:"F32_BLOB(3)"}]})).resolves.toBeUndefined();
  await expect(ensureTableSchema({...options,declaredColumns:[{name:"embedding",type:"F32_BLOB(4)"}]})).rejects.toThrow("mismatch");
});


test("native vectorの保存・近傍SQL・値検証・未取得値保持", async () => {
  const execute = jest.fn(async () => ({ rows: [] }));
  const client = { execute, close: async () => {}, concurrent: async (cb: any) => cb() } as TursoClient;
  const base = {client, autoCreateTable:false, autoMigrateAddColumns:false, schemaPrepared:true,
    declaredSchema:{version:"v",columns:[{name:"embedding",type:"F32_BLOB(3)"},{name:"owner",type:"TEXT"}]}};
  const request = {database:"main",table:"items"};
  await executeCrud({...base,method:"POST",request:{...request,value:{id:"a",embedding:{"@vector":[1,0,0],"@measure":"cosine"}}}});
  expect(JSON.stringify(execute.mock.calls)).toContain("vector32(?)");
  expect(JSON.stringify(execute.mock.calls)).toContain("[1,0,0]");
  execute.mockClear();
  await executeCrud({...base,method:"POST",request:{...request,value:{id:"a",embedding:{"@vector":[]},owner:"a"}}});
  const sql = (execute.mock.calls as any)[0][0].sql;
  expect(sql.split("RETURNING")[0]).not.toContain('"embedding"');
  execute.mockClear();
  await executeCrud({...base,method:"GET",request:{...request,nearest:{key:"embedding",value:[1,0,0]},where:[{key:"owner",value:"a"}],limit:3}});
  expect((execute.mock.calls as any)[0][0].sql).toContain("vector_distance_cos");
  expect((execute.mock.calls as any)[0][0].args).toEqual(["a","[1,0,0]",3]);
  for(const value of [[1],[0,0,0],[Infinity,0,0]]) {
    await expect(executeCrud({...base,method:"GET",request:{...request,nearest:{key:"embedding",value}}})).rejects.toThrow();
  }
  await expect(executeCrud({...base,method:"GET",request:{...request,nearest:{key:"embedding",value:[1,0,0]},count:true}})).rejects.toThrow();
});


test("native vectorの射影はmanifest外の通常列とNULLを保持する", () => {
  const columns = [{ name: "embedding", type: "F32_BLOB(3)" }];
  expect(vectorProjection(columns)).toMatch(/^\*, /);
  expect(decodeVectorRow({id:"a",extra:"保持",embedding:new Uint8Array([1]),"embedding.@vector":"[1,0,0]"},undefined,columns))
    .toEqual({id:"a",extra:"保持",embedding:{"@type":"ModelVectorValue","@source":"server","@vector":[1,0,0],"@measure":"cosine"}});
  expect(decodeVectorRow({extra:42,embedding:null,"embedding.@vector":null},undefined,columns)).toEqual({extra:42,embedding:null});
});


test("本文なしDELETEは許可し、不正JSONと本文なしPOSTは拒否する", async () => {
  const app = new Hono();
  app.all("/database/:database/:table/:indexKey", async c => {
    try { return c.json(await parseCrudRequest(c)); }
    catch { return c.json({error:"invalid"},400); }
  });
  const path="http://localhost/database/main/items/a";
  const response=await app.request(path,{method:"DELETE"});
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({database:"main",table:"items",indexKey:"a"});
  expect((await app.request(path,{method:"DELETE",body:"{"})).status).toBe(400);
  expect((await app.request(path,{method:"POST"})).status).toBe(400);
});
