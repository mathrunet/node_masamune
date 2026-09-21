import { createHash, randomUUID } from "node:crypto";

/** migrationは管理者用Nodeプロセスのみで実行し、Workerの公開routeへ登録しない。 */
export interface MigrationColumn { name: string; sqlType: string; nullable: boolean }
export interface MigrationIndex { name: string; columns: string[]; unique: boolean }
export interface MigrationTable {
  database: string; table: string; columns: MigrationColumn[];
  primaryKey: string[]; indexes?: MigrationIndex[]; vectorFields: string[];
}
export interface MigrationSchema { version: "1"; tables: MigrationTable[]; sourceHash?: string }
export interface MigrationTarget { environment: string; cluster: string; host: string; database: string; principal: string }
export interface MigrationStep { sql: string; after: MigrationSchema }
export interface MigrationPlan {
  version: string; target: MigrationTarget; before: MigrationSchema;
  after: MigrationSchema; steps: MigrationStep[]; hash: string;
}
export interface MigrationConnection {
  execute(sql: string, parameters?: unknown[]): Promise<Record<string, unknown>[]>;
}

function fail(message: string): never { throw new Error(message); }
export function identifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value)) fail("不正なSQL識別子です。");
  return `\`${value}\``;
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .filter(([, v]) => v !== undefined).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
export function normalizeType(value: string): string {
  const type = value.toUpperCase().replace(/\s+/g, "").replace(/^INTEGER$/, "INT")
    .replace(/^(BIGINT|INT)\(\d+\)$/, "$1").replace(/^(BOOL|BOOLEAN)$/, "TINYINT(1)");
  if (!/^(TEXT|JSON|BIGINT|INT|DOUBLE|FLOAT|DATE|DATETIME|TIMESTAMP|TINYINT\(1\)|VARCHAR\([1-9][0-9]*\)|DECIMAL\([1-9][0-9]*,[0-9]+\)|VECTOR\([1-9][0-9]*\))$/.test(type)) {
    fail("未対応または危険なSQL型です。");
  }
  return type;
}
export function normalizeSchema(schema: MigrationSchema, database: string): MigrationSchema {
  identifier(database);
  if (schema.version !== "1" || !Array.isArray(schema.tables)) fail("manifestの形式が不正です。");
  const tables = schema.tables.filter(t => t.database === database).map(t => {
    identifier(t.table);
    if (t.table.startsWith("_masamune_")) fail("管理テーブル名は使用できません。");
    const columns = t.columns.map(c => {
      identifier(c.name);
      if (typeof c.nullable !== "boolean") fail("nullableの型が不正です。");
      return { name: c.name, sqlType: normalizeType(c.sqlType), nullable: c.nullable };
    }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    const names = new Set(columns.map(c => c.name));
    if (columns.length === 0 || names.size !== columns.length) fail("空または重複columnです。");
    if (stableJson(t.primaryKey) !== '["id"]' || !columns.some(c => c.name === "id" && c.sqlType === "VARCHAR(255)" && !c.nullable)) fail("id主キーが不正です。");
    const indexes = (t.indexes ?? []).map(index => {
      identifier(index.name);
      if (index.name.toUpperCase() === "PRIMARY" || typeof index.unique !== "boolean" ||
          index.columns.length === 0 || new Set(index.columns).size !== index.columns.length ||
          index.columns.some(c => !names.has(c))) fail("indexの形式が不正です。");
      return { name: index.name, columns: index.columns, unique: index.unique };
    }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    if (new Set(indexes.map(i => i.name)).size !== indexes.length) fail("index名が重複しています。");
    return { database, table: t.table, columns, primaryKey: ["id"], indexes,
      vectorFields: columns.filter(c => c.sqlType.startsWith("VECTOR(")).map(c => c.name) };
  }).sort((a, b) => a.table < b.table ? -1 : a.table > b.table ? 1 : 0);
  if (new Set(tables.map(t => t.table)).size !== tables.length) fail("tableが重複しています。");
  return { version: "1", tables };
}
const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const columnSql = (c: MigrationColumn) => `${identifier(c.name)} ${normalizeType(c.sqlType)}${c.nullable ? " NULL" : " NOT NULL"}`;
const indexSql = (i: MigrationIndex) => `${i.unique ? "UNIQUE " : ""}INDEX ${identifier(i.name)} (${i.columns.map(identifier).join(", ")})`;

/** 安全な追加だけを生成する。既存カラム変更や制約の追加を黙って無視しない。 */
export function planMigration(version: string, target: MigrationTarget, previous: MigrationSchema, desired: MigrationSchema): MigrationPlan {
  if (!/^[0-9]{8,20}_[a-z0-9_]+$/.test(version)) fail("versionは日時_名前の形式で指定してください。");
  if (!["dev", "prod"].includes(target.environment) || !target.cluster ||
      !/^[a-zA-Z0-9.-]+$/.test(target.host) || !/^[A-Za-z0-9_.-]+$/.test(target.principal ?? "")) fail("接続先の識別子が不正です。");
  const before = normalizeSchema(previous, target.database);
  const after = normalizeSchema(desired, target.database);
  if (!after.tables.length) fail("対象databaseのtableがありません。");
  const state = clone(before);
  const steps: MigrationStep[] = [];
  const add = (sql: string) => steps.push({ sql, after: normalizeSchema(clone(state), target.database) });
  for (const old of before.tables) {
    if (!after.tables.some(t => t.table === old.table)) fail("DROP TABLEは自動適用できません。");
  }
  for (const table of after.tables) {
    const fullName = `${identifier(target.database)}.${identifier(table.table)}`;
    const old = state.tables.find(t => t.table === table.table);
    if (!old) {
      state.tables.push(clone(table));
      add(`CREATE TABLE ${fullName} (${[...table.columns.map(columnSql), "PRIMARY KEY (`id`)", ...(table.indexes ?? []).map(indexSql)].join(", ")})`);
      continue;
    }
    for (const c of old.columns) {
      if (!same(c, table.columns.find(n => n.name === c.name))) fail("既存カラムの削除・型・NULL制約変更は拒否しました。");
    }
    for (const i of old.indexes ?? []) {
      if (!same(i, table.indexes?.find(n => n.name === i.name))) fail("既存indexの削除・変更は拒否しました。");
    }
    for (const c of table.columns.filter(c => !old.columns.some(o => o.name === c.name))) {
      if (!c.nullable) fail("既存tableへのNOT NULL追加は拒否しました。");
      old.columns.push(c);
      add(`ALTER TABLE ${fullName} ADD COLUMN ${columnSql(c)}`);
    }
    for (const i of table.indexes?.filter(i => !old.indexes?.some(o => o.name === i.name)) ?? []) {
      if (i.unique) fail("既存tableへのUNIQUE追加は拒否しました。");
      (old.indexes ??= []).push(i);
      add(`ALTER TABLE ${fullName} ADD ${indexSql(i)}`);
    }
  }
  const plan = { version, target, before, after, steps };
  return { ...plan, hash: sha256(plan) };
}

/** 実schemaを読み、NULL/default/generated column・indexを含めて照合する。 */
export async function inspectSchema(db: MigrationConnection, target: MigrationTarget, inventory: MigrationSchema): Promise<MigrationSchema> {
  const identity = await db.execute("SELECT SUBSTRING_INDEX(CURRENT_USER(), '@', 1) AS principal");
  if (identity[0]?.principal !== target.principal) fail("接続したSQLユーザーがmigrationの接続先と一致しません。");
  const tables: MigrationTable[] = [];
  for (const table of inventory.tables) {
    const rows = await db.execute(
      "SELECT COLUMN_NAME AS name, COLUMN_TYPE AS sqlType, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS defaultValue, EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
      [target.database, table.table]);
    if (!rows.length) continue;
    if (rows.some(r => r.defaultValue !== null || String(r.extra ?? "") !== "")) fail("未対応のdefault/generated columnを検出しました。");
    const indexRows = await db.execute(
      "SELECT INDEX_NAME AS name, COLUMN_NAME AS columnName, NON_UNIQUE AS nonUnique, SEQ_IN_INDEX AS position, SUB_PART AS subPart FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX",
      [target.database, table.table]);
    if (indexRows.some(r => r.subPart !== null)) fail("prefix indexは自動移行できません。");
    const indexes = new Map<string, MigrationIndex>();
    for (const r of indexRows) {
      const name = String(r.name);
      const index = indexes.get(name) ?? { name, columns: [], unique: Number(r.nonUnique) === 0 };
      index.columns.push(String(r.columnName)); indexes.set(name, index);
    }
    const primaryKey = indexes.get("PRIMARY")?.columns ?? [];
    indexes.delete("PRIMARY");
    tables.push({ database: target.database, table: table.table,
      columns: rows.map(r => ({ name: String(r.name), sqlType: String(r.sqlType), nullable: r.nullable === "YES" })),
      primaryKey, indexes: [...indexes.values()], vectorFields: [] });
  }
  return normalizeSchema({ version: "1", tables }, target.database);
}

/** 永続ロックは時間経過で奪わない。プロセス強制終了時は停止確認後に管理者が解除する。 */
export async function applyMigration(db: MigrationConnection, plan: MigrationPlan, target: MigrationTarget,
  options: { apply?: boolean; mark?: boolean } = {}): Promise<{ applied: boolean; statements: number; hash: string }> {
  if (!same(plan.target, target)) fail("環境・cluster・host・databaseがmigrationと一致しません。");
  const regenerated = planMigration(plan.version, target, plan.before, plan.after);
  if (!same(plan, regenerated)) fail("migrationのSQLまたはhashが一致しません。");
  // dry-runでも実schemaを照合するが管理tableの作成を含め書き込みは行わない。
  const inventory = plan.after;
  const read = () => inspectSchema(db, target, inventory);
  let actual = await read();
  if (![plan.before, ...plan.steps.map(s => s.after)].some(s => same(s, actual))) fail("実schemaがsnapshotと一致しません。");
  if (options.mark && !same(actual, plan.after)) fail("markには最終schemaとの完全一致が必要です。");
  if (!options.apply) return { applied: false, statements: plan.steps.length, hash: plan.hash };
  const name = (suffix: string) => `${identifier(target.database)}.${identifier(`_masamune_${suffix}`)}`;
  // databaseは明示的に用意されたものだけを使う。DB作成権限を要求しない。
  await db.execute(`CREATE TABLE IF NOT EXISTS ${name("migration_lock")} (id INT PRIMARY KEY, owner VARCHAR(64) NOT NULL)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS ${name("migrations")} (version VARCHAR(128) PRIMARY KEY, hash VARCHAR(64) NOT NULL, target_hash VARCHAR(64) NOT NULL, progress INT NOT NULL, complete TINYINT(1) NOT NULL, snapshot LONGTEXT NOT NULL)`);
  const owner = randomUUID();
  try { await db.execute(`INSERT INTO ${name("migration_lock")} (id, owner) VALUES (1, ?)`, [owner]); }
  catch { fail("migrationロックを取得できません。別実行または残存ロックを確認してください。"); }
  let release = true;
  try {
    const ledger = await db.execute(`SELECT * FROM ${name("migrations")} ORDER BY version`);
    const row = ledger.find(r => r.version === plan.version);
    if (row && (row.hash !== plan.hash || row.target_hash !== sha256(target))) fail("同versionのSQL hashまたは接続先が異なります。");
    if (ledger.some(r => r.version !== plan.version && (!Number(r.complete) || String(r.version) > plan.version))) fail("先行する未完了migrationまたは新しいversionがあります。");
    const latest = ledger.filter(r => r.version !== plan.version).at(-1);
    if (!latest && !row && !options.mark && plan.before.tables.length) fail("先行migrationのledgerがありません。既存schemaはmarkで採用してください。");
    if (latest && (latest.target_hash !== sha256(target) || !same(JSON.parse(String(latest.snapshot)), plan.before))) fail("ledgerと適用前snapshotが一致しません。");
    actual = await read();
    if (options.mark && !same(actual, plan.after)) fail("mark対象のschemaが変更されました。");
    let progress = row ? Number(row.progress) : 0;
    if (!Number.isSafeInteger(progress) || progress < 0 || progress > plan.steps.length) fail("ledgerの進捗が不正です。");
    if (!row) {
      if (!options.mark && !same(actual, plan.before)) fail("ledgerなしの途中schemaは適用できません。既存DBはmarkで採用してください。");
      await db.execute(`INSERT INTO ${name("migrations")} (version, hash, target_hash, progress, complete, snapshot) VALUES (?, ?, ?, 0, 0, ?)`,
        [plan.version, plan.hash, sha256(target), stableJson(plan.before)]);
    }
    if (Number(row?.complete) === 1) {
      if (!same(actual, plan.after)) fail("適用済みschemaにdriftがあります。");
      return { applied: true, statements: 0, hash: plan.hash };
    }
    if (!options.mark) {
      const expected = progress ? plan.steps[progress - 1].after : plan.before;
      // DDL成功後、ledger記録前に途切れた1文だけを実schemaから回収する。
      if (!same(actual, expected)) {
        if (progress < plan.steps.length && same(actual, plan.steps[progress].after)) progress++;
        else fail("途中schemaとledgerが一致しません。");
      }
      for (let i = progress; i < plan.steps.length; i++) {
        try { await db.execute(plan.steps[i].sql); }
        catch {
          // DDLの応答喪失ではサーバー処理の終了を断定できないためロックを残す。
          release = false;
          fail("DDLの結果が不明です。再送せず、DB処理終了と実schemaを確認してロックを解除してください。");
        }
        actual = await read();
        if (!same(actual, plan.steps[i].after)) fail("DDL実行後のschema照合に失敗しました。");
        await db.execute(`UPDATE ${name("migrations")} SET progress = ?, snapshot = ? WHERE version = ? AND hash = ?`,
          [i + 1, stableJson(actual), plan.version, plan.hash]);
      }
    }
    actual = await read();
    if (!same(actual, plan.after)) fail("最終schemaが一致しません。");
    await db.execute(`UPDATE ${name("migrations")} SET progress = ?, complete = 1, snapshot = ? WHERE version = ? AND hash = ?`,
      [plan.steps.length, stableJson(plan.after), plan.version, plan.hash]);
    return { applied: true, statements: plan.steps.length - progress, hash: plan.hash };
  } finally {
    if (release) await db.execute(`DELETE FROM ${name("migration_lock")} WHERE id = 1 AND owner = ?`, [owner]);
  }
}
