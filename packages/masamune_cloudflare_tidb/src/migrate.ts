/** katana migrateのNode実行入口。設定・資格情報は標準入力だけで受け取る。 */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { connect } from "@tidbcloud/serverless";
import { applyMigration, inspectSchema, MigrationConnection, MigrationPlan, MigrationSchema, MigrationTarget,
  normalizeSchema, planMigration, stableJson } from "./lib/migration";

export interface MigrateInput {
  command: "status" | "diff" | "generate" | "apply" | "mark";
  root: string; schemaPath: string; directory: string;
  target: MigrationTarget; version?: string; apply?: boolean;
  username?: string; password?: string;
}
function safePath(root: string, path: string): string {
  const file = resolve(root, path), delta = relative(resolve(root), file);
  if (isAbsolute(path) || delta.startsWith("..") || isAbsolute(delta)) throw new Error("migrationのパスはproject内に限定してください。");
  return file;
}
const sqlText = (plan: MigrationPlan) => plan.steps.map(s => `${s.sql};`).join("\n") + "\n";

export async function runMigrate(input: MigrateInput, connection?: MigrationConnection): Promise<unknown> {
  if (!["status", "diff", "generate", "apply", "mark"].includes(input.command)) throw new Error("未対応のmigrationコマンドです。");
  if (input.apply && !["apply", "mark"].includes(input.command)) throw new Error("--applyはapply/markでのみ使用できます。");
  const schema = JSON.parse(await readFile(safePath(input.root, input.schemaPath), "utf8")) as MigrationSchema;
  const desired = normalizeSchema(schema, input.target.database);
  // ここでもtargetを検証し、directoryへの識別子混入を拒否する。
  planMigration("20000101_validate", input.target, { version: "1", tables: [] }, desired);
  const directory = safePath(input.root, `${input.directory}/${input.target.environment}/${input.target.database}`);
  let files: string[];
  try { files = await readdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; files = []; }
  const plans: MigrationPlan[] = [];
  for (const file of files.filter(f => f.endsWith(".json")).sort()) {
    const plan = JSON.parse(await readFile(resolve(directory, file), "utf8")) as MigrationPlan;
    if (file !== `${plan.version}.json` || stableJson(plan.target) !== stableJson(input.target) ||
        stableJson(plan) !== stableJson(planMigration(plan.version, plan.target, plan.before, plan.after))) throw new Error("migrationファイルの接続先・hash・名前が不正です。");
    if (await readFile(resolve(directory, `${plan.version}.sql`), "utf8") !== sqlText(plan)) throw new Error("SQLファイルとmigrationが一致しません。");
    if (plans.length && stableJson(plans.at(-1)!.after) !== stableJson(plan.before)) throw new Error("migration snapshotの連鎖が切れています。");
    plans.push(plan);
  }
  const previous = plans.at(-1)?.after ?? { version: "1" as const, tables: [] };
  if (input.command === "diff" || input.command === "generate") {
    if (input.command === "generate" && !input.version) throw new Error("generateには--versionが必要です。");
    const plan = planMigration(input.version ?? "20000101_preview", input.target, previous, desired);
    if (input.command === "diff") return plan;
    if (plans.some(p => p.version >= plan.version)) throw new Error("versionは既存の最終版より後にしてください。");
    if (!plan.steps.length) throw new Error("schema差分がありません。");
    await mkdir(directory, { recursive: true });
    // 既存ファイルは上書きしない。途中失敗したペアは次回の照合で停止する。
    await writeFile(resolve(directory, `${plan.version}.sql`), sqlText(plan), { flag: "wx" });
    await writeFile(resolve(directory, `${plan.version}.json`), `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
    return { generated: plan.version, hash: plan.hash, statements: plan.steps.length };
  }
  const selected = input.version ? plans.find(p => p.version === input.version) : plans.at(-1);
  if (!selected) throw new Error("適用するmigrationがありません。generateを先に実行してください。");
  const db = connection ?? createConnection(input);
  if (input.command === "status") {
    const actual = await inspectSchema(db, input.target, selected.after);
    const exists = await db.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [input.target.database, "_masamune_migrations"]);
    const ledger = exists.length ? await db.execute(`SELECT version, hash, target_hash, progress, complete FROM \`${input.target.database}\`._masamune_migrations ORDER BY version`) : [];
    return { target: input.target, version: selected.version, schemaMatches: stableJson(actual) === stableJson(selected.after), ledger };
  }
  return applyMigration(db, selected, input.target, { apply: input.apply === true, mark: input.command === "mark" });
}

function createConnection(input: MigrateInput): MigrationConnection {
  if (!input.username || !input.password) throw new Error("migration用SQL資格情報がありません。");
  const connection = connect({ host: input.target.host, username: input.username, password: input.password,
    database: input.target.database, debug: false, fetch: async (url, init) => {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 60000);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        return new Response(await response.arrayBuffer(), { status: response.status, statusText: response.statusText, headers: response.headers });
      } finally { clearTimeout(timer); }
    } });
  return { execute: async (sql, args = []) => {
    try { return await connection.execute(sql, args) as Record<string, unknown>[]; }
    catch { throw new Error("TiDB管理queryに失敗しました。接続設定とDBの実行状態を確認してください。"); }
  } };
}
if (require.main === module) {
  (async () => {
    let text = "";
    for await (const chunk of process.stdin) { text += chunk; if (text.length > 1024 * 1024) throw new Error("入力が大きすぎます。"); }
    const result = await runMigrate(JSON.parse(text));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  })().catch(error => {
    // ドライバ例外は接続境界で秘匿済み。予期しない例外のstackや入力は出力しない。
    process.stderr.write(`${error instanceof Error ? error.message : "migrationに失敗しました。"}\n`);
    process.exitCode = 1;
  });
}
