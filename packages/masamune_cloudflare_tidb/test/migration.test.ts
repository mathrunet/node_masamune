import { applyMigration, MigrationConnection, MigrationPlan, MigrationSchema, MigrationTarget,
  normalizeSchema, planMigration, sha256, stableJson } from "../src/lib/migration";

const target: MigrationTarget = { environment: "dev", cluster: "fixture", host: "fixture.invalid", database: "testdb", principal: "fixture.user" };
const empty: MigrationSchema = { version: "1", tables: [] };
const schema: MigrationSchema = { version: "1", tables: [{ database: "testdb", table: "items",
  columns: [{ name: "id", sqlType: "VARCHAR(255)", nullable: false }], primaryKey: ["id"], indexes: [], vectorFields: [] }] };
const initial = () => planMigration("20260920_initial", target, empty, schema);

/** 接続境界でschemaとledgerを保持し、DDL成功後の応答喪失を再現する。 */
class Database implements MigrationConnection {
  principal = "fixture.user";
  actual: MigrationSchema = structuredClone(empty);
  ledger: Record<string, unknown>[] = [];
  lock: string | undefined;
  queries: string[] = [];
  loseDdlResponse = false;
  failProgress = false;
  constructor(readonly plan: MigrationPlan) {}
  async execute(sql: string, p: unknown[] = []): Promise<Record<string, unknown>[]> {
    this.queries.push(sql);
    if (sql.includes("CURRENT_USER()")) return [{ principal: this.principal }];
    const table = this.actual.tables.find(t => t.table === p[1]);
    if (sql.includes("information_schema.COLUMNS")) return table?.columns.map(c => ({ ...c, nullable: c.nullable ? "YES" : "NO", defaultValue: null, extra: "" })) ?? [];
    if (sql.includes("information_schema.STATISTICS")) return table ? [
      ...table.primaryKey.map((columnName, i) => ({ name: "PRIMARY", columnName, nonUnique: 0, position: i + 1, subPart: null })),
      ...(table.indexes ?? []).flatMap(index => index.columns.map((columnName, i) => ({ name: index.name, columnName, nonUnique: index.unique ? 0 : 1, position: i + 1, subPart: null }))),
    ] : [];
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS")) return [];
    if (sql.startsWith("INSERT INTO") && sql.includes("migration_lock")) {
      if (this.lock) throw new Error("duplicate"); this.lock = String(p[0]); return [];
    }
    if (sql.startsWith("DELETE FROM") && sql.includes("migration_lock")) { if (this.lock === p[0]) this.lock = undefined; return []; }
    if (sql.startsWith("SELECT *")) return this.ledger;
    if (sql.startsWith("INSERT INTO")) {
      this.ledger.push({ version: p[0], hash: p[1], target_hash: p[2], progress: 0, complete: 0, snapshot: p[3] }); return [];
    }
    if (sql.startsWith("UPDATE")) {
      if (this.failProgress) { this.failProgress = false; throw new Error("ledger write unavailable"); }
      const row = this.ledger.find(r => r.version === p[2])!;
      Object.assign(row, { progress: p[0], snapshot: p[1], complete: sql.includes("complete = 1") ? 1 : 0 }); return [];
    }
    const step = this.plan.steps.find(s => s.sql === sql);
    if (!step) throw new Error("unexpected query");
    this.actual = structuredClone(step.after);
    if (this.loseDdlResponse) { this.loseDdlResponse = false; throw new Error("connection reset after DDL"); }
    return [];
  }
}

test("同じgatewayでも接続したSQLユーザーが異なる場合は適用を拒否する", async () => {
  const boundTarget = { ...target, principal: "fixture.user" };
  const plan = planMigration("20260920_bound", boundTarget, empty, schema);
  const db = new Database(plan); db.principal = "other_cluster.user";
  await expect(applyMigration(db, plan, boundTarget, { apply: true })).rejects.toThrow("SQLユーザー");
  expect(db.actual.tables).toHaveLength(0);
});

test("正規化とSQL hashは順序に依存せず、危険な変更は拒否する", () => {
  const before = structuredClone(schema);
  const after = structuredClone(schema);
  after.tables[0].columns.push({ name: "title", sqlType: "TEXT", nullable: true });
  after.tables[0].indexes = [{ name: "by_id", columns: ["id"], unique: false }];
  const plan = planMigration("20260921_added", target, before, after);
  expect(plan.steps.map(s => s.sql)).toEqual([
    "ALTER TABLE `testdb`.`items` ADD COLUMN `title` TEXT NULL",
    "ALTER TABLE `testdb`.`items` ADD INDEX `by_id` (`id`)",
  ]);
  after.tables[0].columns.reverse();
  expect(planMigration(plan.version, target, before, after)).toEqual(plan);
  after.tables[0].columns.find(c => c.name === "title")!.nullable = false;
  expect(() => planMigration(plan.version, target, before, after)).toThrow("NOT NULL");
  expect(() => planMigration(plan.version, target, schema, empty)).toThrow();
  after.tables[0].columns.find(c => c.name === "title")!.nullable = true;
  after.tables[0].indexes![0].unique = true;
  expect(() => planMigration(plan.version, target, before, after)).toThrow("UNIQUE");
  after.tables[0].columns[0].sqlType = "TEXT; DROP TABLE items";
  expect(() => normalizeSchema(after, target.database)).toThrow();
});

test("dry-runは管理tableも作らず、applyはledger記録後に再実行可能", async () => {
  const plan = initial(), db = new Database(plan);
  expect((await applyMigration(db, plan, target)).applied).toBe(false);
  expect(db.queries.every(q => q.startsWith("SELECT"))).toBe(true);
  await applyMigration(db, plan, target, { apply: true });
  expect(db.ledger[0].complete).toBe(1);
  expect(db.lock).toBeUndefined();
  expect((await applyMigration(db, plan, target, { apply: true })).statements).toBe(0);
});

test("SQL・接続先・同versionのhash改変を適用前に拒否する", async () => {
  const plan = initial(), db = new Database(plan);
  await expect(applyMigration(db, plan, { ...target, environment: "prod" }, { apply: true })).rejects.toThrow("一致");
  const modified = structuredClone(plan); modified.steps[0].sql = "DROP TABLE items";
  await expect(applyMigration(db, modified, target, { apply: true })).rejects.toThrow("hash");
  expect(db.queries).toHaveLength(0);
  await applyMigration(db, plan, target, { apply: true });
  db.ledger[0].hash = "changed";
  await expect(applyMigration(db, plan, target, { apply: true })).rejects.toThrow("hash");
});

test("競合時にDDLを実行せず、他実行のロックを削除しない", async () => {
  const plan = initial(), db = new Database(plan); db.lock = "other-owner";
  await expect(applyMigration(db, plan, target, { apply: true })).rejects.toThrow("ロック");
  expect(db.actual.tables).toHaveLength(0); expect(db.lock).toBe("other-owner");
});

test("DDL成功後のledger記録失敗をschema照合で回収し再送しない", async () => {
  const plan = initial(), db = new Database(plan); db.failProgress = true;
  await expect(applyMigration(db, plan, target, { apply: true })).rejects.toThrow("ledger write");
  expect(db.ledger[0].progress).toBe(0);
  await applyMigration(db, plan, target, { apply: true });
  expect(db.queries.filter(q => q === plan.steps[0].sql)).toHaveLength(1);
  expect(db.ledger[0].complete).toBe(1);
});

test("DDL応答喪失時はロックを保持し、終了確認・解除後にschemaから再開する", async () => {
  const plan = initial(), db = new Database(plan); db.loseDdlResponse = true;
  await expect(applyMigration(db, plan, target, { apply: true })).rejects.toThrow("結果が不明");
  expect(db.lock).toBeDefined();
  await expect(applyMigration(db, plan, target, { apply: true })).rejects.toThrow("ロック");
  db.lock = undefined; // 管理者による実行終了確認後の解除を表す。
  await applyMigration(db, plan, target, { apply: true });
  expect(db.queries.filter(q => q === plan.steps[0].sql)).toHaveLength(1);
});

test("markは完全一致する既存schemaのみ採用し、driftと未完了先行版を拒否する", async () => {
  const plan = initial(), db = new Database(plan);
  await expect(applyMigration(db, plan, target, { apply: true, mark: true })).rejects.toThrow("完全一致");
  db.actual = plan.after;
  await applyMigration(db, plan, target, { apply: true, mark: true });
  expect(db.queries.filter(q => q === plan.steps[0].sql)).toHaveLength(0);
  db.actual = empty;
  await expect(applyMigration(db, plan, target, { apply: true })).rejects.toThrow("drift");
  db.ledger = [{ version: "20260919_old", target_hash: sha256(target), hash: "other", progress: 0, complete: 0, snapshot: stableJson(empty) }];
  await expect(applyMigration(db, plan, target, { apply: true })).rejects.toThrow("未完了");
});
