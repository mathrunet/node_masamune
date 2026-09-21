import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inspect, diff, createMigration, verify, applySql, Migration, MigrationTarget } from "./lib/migration";
import type { SchemaManifest } from "./lib/types";
interface Input { command: string; root: string; schemaPath: string; directory: string; target: MigrationTarget; version?: string; apply?: boolean; local?: boolean; wrangler?: string }
const execute = promisify(execFile);
function within(root: string, file: string) { const result = path.resolve(root, file); if(!result.startsWith(path.resolve(root) + path.sep)) throw new Error("project内のパスを指定してください。"); return result; }
export async function runMigrate(input: Input): Promise<unknown> {
  if(!["status", "diff", "generate", "apply", "mark"].includes(input.command)) throw new Error("不正なmigrationコマンドです。");
  const t = input.target;
  if(!["dev", "prod"].includes(t.environment) || !/^[a-f0-9]{32}$/.test(t.accountId) || !/^[a-f0-9-]{36}$/.test(t.databaseId) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.database)) throw new Error("対象アカウント・DB ID・環境を明示してください。");
  const directory = within(input.root, input.directory); const schema = JSON.parse(await fs.readFile(within(input.root, input.schemaPath), "utf8")) as SchemaManifest;
  const staging = await fs.mkdtemp(path.join(input.root, ".d1-migrate-"));
  try {
    const config = path.join(staging, "wrangler.json"); const migrationDir = path.join(staging, "migrations"); await fs.mkdir(migrationDir);
    await fs.writeFile(config, JSON.stringify({ name: "masamune-d1-migrate", account_id: t.accountId, compatibility_date: "2026-09-01", d1_databases: [{ binding: "DB", database_name: t.databaseId, database_id: t.databaseId, migrations_dir: migrationDir, migrations_table: "_masamune_wrangler_migrations" }] }));
    const mode = input.local ? ["--local", "--persist-to", path.join(input.root, ".wrangler/state")] : ["--remote"];
    const run = async (args: string[]) => { try { return (await execute(input.wrangler ?? "wrangler", [...args, "--config", config, ...mode], { cwd: input.root, env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" }, maxBuffer: 8 * 1024 * 1024 })).stdout; } catch { throw new Error("D1 migrationの通信・適用に失敗しました。statusで実状態を確認してください。"); } };
    const query = async (sql: string) => { const raw = JSON.parse(await run(["d1", "execute", "DB", "--command", sql, "--json"])); return raw.flatMap((r: any) => { if(r.success === false) throw new Error("SQL失敗"); return r.results ?? []; }); };
    const current = await inspect(query);
    const ledgerExists = await query("SELECT name FROM sqlite_master WHERE name='_masamune_migrations'");
    const ledger = ledgerExists.length ? await query('SELECT * FROM "_masamune_migrations"') : [];
    const names = (await fs.readdir(directory).catch((e: NodeJS.ErrnoException) => { if(e.code === "ENOENT") return []; throw e; })).filter(n => n.endsWith(".json")).sort();
    const migrations: Migration[] = [];
    for(const name of names) { const m = JSON.parse(await fs.readFile(path.join(directory, name), "utf8")); verify(m, t); migrations.push(m); }
    for(const record of ledger) { const m = migrations.find(m => m.version === record.version); if(!m || m.hash !== record.hash || JSON.stringify(t) !== record.target) throw new Error("適用済みmigrationの定義またはhashが一致しません。"); }
    if(input.command === "status") return { target: t, applied: ledger, pending: migrations.filter(m => !ledger.some((r: any) => r.version === m.version)).map(m => m.version), diff: diff(current, schema, t.database) };
    if(input.command === "diff") return { target: t, sql: diff(current, schema, t.database) };
    if(input.command === "generate") {
      if(migrations.some(m => !ledger.some((r: any) => r.version === m.version))) throw new Error("未適用migrationを先に確認してください。");
      if(migrations.some(m => m.version >= (input.version ?? ""))) throw new Error("versionは既存versionより後を指定してください。");
      const m = createMigration(input.version ?? "", t, current, schema); await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, `${m.version}.json`), JSON.stringify(m, null, 2) + "\n", { flag: "wx" }); return m;
    }
    const selected = migrations.find(m => m.version === input.version); if(!selected) throw new Error("生成済みversionを明示してください。");
    if(ledger.some((r: any) => r.version === selected.version)) return { applied: true, alreadyApplied: true, version: selected.version };
    const pending = migrations.filter(m => !ledger.some((r: any) => r.version === m.version)); if(pending[0] !== selected) throw new Error("migrationは生成順で適用してください。");
    const sql = applySql(selected, current, input.command === "mark");
    if(!input.apply) return { dryRun: true, target: t, version: selected.version, sql };
    await fs.writeFile(path.join(migrationDir, `${selected.version}.sql`), sql);
    await run(["d1", "migrations", "apply", "DB"]);
    const after = await inspect(query); if(diff(after, selected.after, t.database).length) throw new Error("適用後schemaが一致しません。");
    return { applied: true, version: selected.version, target: t };
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}
