import { DatabaseSync } from "node:sqlite";
import { inspect, createMigration, verify, applySql, diff } from "../src/lib/migration";
import { manifest } from "./sqlite";
const target = { accountId: "a".repeat(32), databaseId: "00000000-0000-0000-0000-000000000000", database: "main", environment: "dev" as const };
let db: DatabaseSync;
beforeEach(() => { db = new DatabaseSync(":memory:"); }); afterEach(() => db.close());
const snapshot = () => inspect(async sql => db.prepare(sql).all());
function atomic(sql: string) { db.exec("BEGIN"); try { db.exec(sql); db.exec("COMMIT"); } catch(e) { db.exec("ROLLBACK"); throw e; } }
test("作成・追加・ledgerを原子的に適用し再適用を拒否する", async () => {
  const before = await snapshot(); const m = createMigration("2026092001_initial", target, before, manifest); verify(m, target); atomic(applySql(m, before));
  expect(diff(await snapshot(), manifest, "main")).toEqual([]);
  expect(() => atomic(applySql(m, before))).toThrow();
  db.exec("INSERT INTO items (id,name) VALUES ('a','日本語')");
  const after = structuredClone(manifest); after.tables[0].columns.push({ name: "added", sqlType: "TEXT", nullable: true }); after.tables[0].indexes = [{ name: "name", columns: ["name"], unique: false }];
  const current = await snapshot(); const m2 = createMigration("2026092002_add", target, current, after); atomic(applySql(m2, current));
  expect(diff(await snapshot(), after, "main")).toEqual([]); expect(db.prepare("SELECT name FROM items").get()?.name).toBe("日本語");
});
test("SQL hash変更・接続先不一致・破壊的差分を拒否する", async () => {
  const m = createMigration("2026092001_initial", target, await snapshot(), manifest);
  expect(() => verify({ ...m, sql: ["DROP TABLE items"] }, target)).toThrow(); expect(() => verify(m, { ...target, environment: "prod" })).toThrow();
  atomic(applySql(m, await snapshot())); const altered = structuredClone(manifest); altered.tables[0].columns = altered.tables[0].columns.filter(c => c.name !== "name"); expect(() => diff(m.before, { ...manifest, tables: [] }, "main")).toThrow(); expect(() => createMigration("2026092002_drop", target, { ...m.before, columns: {} }, altered)).not.toThrow();
  await expect((async () => diff(await snapshot(), altered, "main"))()).rejects.toThrow();
});
test("DDL後ledger失敗はrollback、通信応答喪失後はledgerから識別できる", async () => {
  const before = await snapshot(); const m = createMigration("2026092001_initial", target, before, manifest); const sql = applySql(m, before);
  expect(() => atomic(sql.replace('DROP TABLE "_masamune_guard"', 'INSERT INTO missing_table VALUES (1)'))).toThrow(); expect((await snapshot()).objects).toEqual([]);
  atomic(sql); expect(db.prepare('SELECT hash FROM "_masamune_migrations"').get()?.hash).toBe(m.hash);
});
test("生成後の競合schema変更はtransaction内のガードで拒否する", async () => {
  const before = await snapshot(); const m = createMigration("2026092001_initial", target, before, manifest); const sql = applySql(m, before); db.exec("CREATE TABLE other (id TEXT)"); expect(() => atomic(sql)).toThrow(); expect(db.prepare("SELECT name FROM sqlite_master WHERE name='items'").all()).toEqual([]);
});
test("markは完成schemaだけを許可する", async () => {
  const before = await snapshot(); const m = createMigration("2026092001_initial", target, before, manifest); expect(() => applySql(m, before, true)).toThrow(); db.exec(m.sql.join(";")); atomic(applySql(m, await snapshot(), true)); expect(db.prepare('SELECT version FROM "_masamune_migrations"').all()).toHaveLength(1);
});
