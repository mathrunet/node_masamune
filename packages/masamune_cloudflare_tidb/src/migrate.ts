/** katana migrateのNode実行入口。設定・資格情報は標準入力だけで受け取る。 */
import { readFile, readdir, mkdir, writeFile, chmod, rename, unlink, rmdir } from "node:fs/promises";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { resolve, relative, isAbsolute, join } from "node:path";
import { connect } from "@tidbcloud/serverless";
import { applyMigration, identifier, inspectSchema, MigrationConnection, MigrationPlan, MigrationSchema, MigrationTarget,
  normalizeSchema, planMigration, stableJson } from "./lib/migration";

export interface MigrateInput {
  command: "status" | "diff" | "generate" | "apply" | "mark";
  root: string; schemaPath: string; directory: string;
  target: MigrationTarget; version?: string; apply?: boolean;
  username?: string; password?: string;
}

export interface RuntimeUserProvisionInput {
  root: string;
  host: string;
  database: string;
  migrationUsername: string;
  migrationPassword: string;
  runtimeUsername: string;
  runtimePassword: string;
  runtimeRole: string;
  tables: Array<{ database: string; table: string }>;
  environment: "dev" | "prod";
  credentialState: Record<string, unknown>;
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

/** Creates/reconciles a least-privilege runtime user using the existing HTTPS SQL driver. */
export async function provisionRuntimeUser(
  input: RuntimeUserProvisionInput,
  connection?: MigrationConnection,
  runtimeConnection?: (username: string, password: string) => MigrationConnection,
): Promise<{ checkedTables: number; role: string }> {
  const hasRuntimeCredentials = Boolean(input.runtimeUsername && input.runtimePassword && input.runtimeRole);
  const hasPartialRuntimeCredentials = Boolean(input.runtimeUsername || input.runtimePassword || input.runtimeRole) && !hasRuntimeCredentials;
  if (!input.host || !input.database || !input.migrationUsername || !input.migrationPassword ||
      hasPartialRuntimeCredentials || !input.tables.length || !["dev", "prod"].includes(input.environment)) {
    throw new Error("TiDB runtime userの設定が不足しています。");
  }
  const db = connection ?? createConnection({
    command: "status", root: input.root, schemaPath: "", directory: "", target: {
      environment: "dev", cluster: "", host: input.host, database: input.database,
      principal: input.migrationUsername,
    }, username: input.migrationUsername, password: input.migrationPassword,
  });
  // Check the entire manifest set before changing users or grants. A partial schema must be migrated first.
  const tables = [...new Map(input.tables.map((table) => [`${table.database}\0${table.table}`, table])).values()];
  const missing: string[] = [];
  for (const item of tables) {
    if (!item.database || !item.table) throw new Error("TiDB schema manifestのtable識別子が不正です。");
    identifier(item.database);
    identifier(item.table);
    const found = await db.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [item.database, item.table],
    );
    if (!found.length) missing.push(`${item.database}.${item.table}`);
  }
  if (missing.length) {
    throw new Error(`TiDB schema tableが未作成です。先にkatana migrate applyを実行してください: ${missing.join(", ")}`);
  }
  await mkdir(resolve(input.root, "cloudflare"), { recursive: true });
  const lock = resolve(input.root, "cloudflare/.tidb-runtime-user.lock");
  await mkdir(lock).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") {
      let owner = "unknown";
      try { owner = (await readFile(join(lock, "owner"), "utf8")).trim(); } catch { /* stale/incomplete lock */ }
      throw new Error(`TiDB runtime user適用lockが残っています (pid=${owner})。実行中プロセスを確認し、停止済みの場合だけ cloudflare/.tidb-runtime-user.lock を手動削除して再実行してください。`);
    }
    throw error;
  });
  try {
    await writeFile(join(lock, "owner"), `${process.pid}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    await rmdir(lock).catch(() => undefined);
    throw error;
  }
  try {
  // The CLI loaded YAML before starting this process. Compare the JSON format emitted by
  // previous runs so concurrent changes cannot be overwritten from a stale snapshot.
  try {
    const diskText = await readFile(resolve(input.root, "cloudflare/tidb.yaml"), "utf8");
    try {
      const disk = JSON.parse(diskText) as Record<string, unknown>;
      if (stableJson(disk) !== stableJson(input.credentialState)) {
        throw new Error("cloudflare/tidb.yamlが読込後に更新されています。既存設定を保護するため再実行してください。");
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      // First-run/manual YAML remains governed by its parsed snapshot until it is saved as JSON.
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let runtimeUsername = input.runtimeUsername;
  let runtimePassword = input.runtimePassword;
  let runtimeRole = input.runtimeRole;
  const quoteIdentifier = (value: string) => identifier(value);
  const quoteUser = (value: string) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
  const quotePassword = (value: string) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
  const rootState = structuredClone(input.credentialState);
  const cloudflare = (rootState.cloudflare && typeof rootState.cloudflare === "object"
    ? rootState.cloudflare : {}) as Record<string, unknown>;
  const tidb = (cloudflare.tidb && typeof cloudflare.tidb === "object"
    ? cloudflare.tidb : {}) as Record<string, unknown>;
  const users = (tidb.runtime_users && typeof tidb.runtime_users === "object"
    ? tidb.runtime_users : {}) as Record<string, unknown>;
  const stored = (users[input.environment] && typeof users[input.environment] === "object"
    ? users[input.environment] : {}) as Record<string, unknown>;
  if (!runtimeUsername || !runtimePassword || !runtimeRole) {
    if (stored.username && stored.password && stored.role) {
      runtimeUsername = String(stored.username);
      runtimePassword = String(stored.password);
      runtimeRole = String(stored.role);
    } else {
      const current = await db.execute("SELECT CURRENT_USER() AS principal");
      const currentUser = String(current[0]?.principal ?? "").split("@")[0];
      // The dedicated migration principal and runtime principal share the cluster prefix.
      // Authenticate the configured identity before deriving any account names.
      const prefix = currentUser === input.migrationUsername
        ? /^([A-Za-z0-9_-]{1,24})\.[A-Za-z0-9_]+$/.exec(currentUser)?.[1] ?? ""
        : "";
      if (!prefix) {
        throw new Error("TiDB SQL user prefixをmigration接続から判定できません。");
      }
      const suffix = randomBytes(4).toString("hex");
      runtimeUsername = `${prefix}.rt_${suffix}`;
      runtimeRole = `topolia_rw_${suffix}`;
      runtimePassword = randomBytes(32).toString("base64url");
      users[input.environment] = { username: runtimeUsername, password: runtimePassword, role: runtimeRole, owner: "katana-cloudflare-tidb-v1" };
      tidb.runtime_users = users;
      cloudflare.tidb = tidb;
      rootState.cloudflare = cloudflare;
      await saveRuntimeCredentialState(input.root, rootState);
    }
  }
  const owner = stored.owner;
  const expectedPrivileges = ["delete", "insert", "select", "update"];
  const hasOnlyExpectedTableGrants = (grant: string, principal: string): boolean => {
    const match = /^grant\s+(.+?)\s+on\s+(.+?)\s+to\s+(.+)$/i.exec(grant.replace(/\s+/g, " ").trim());
    if (!match) return false;
    const privileges = match[1].split(",").map((item) => item.trim().toLowerCase()).sort();
    if (stableJson(privileges) !== stableJson(expectedPrivileges)) return false;
    const objectMatch = /^(`(?:``|[^`])+`|[A-Za-z0-9_$]+)\s*\.\s*(`(?:``|[^`])+`|[A-Za-z0-9_$]+)$/.exec(match[2].trim());
    if (!objectMatch) return false;
    const unquote = (part: string) => part.startsWith("`") ? part.slice(1, -1).replaceAll("``", "`") : part;
    const objectDatabase = unquote(objectMatch[1]).toLowerCase();
    const objectTable = unquote(objectMatch[2]).toLowerCase();
    return tables.some((item) => {
      return item.database.toLowerCase() === objectDatabase && item.table.toLowerCase() === objectTable &&
        match[3].trim().toLowerCase() === `${quoteUser(principal)}@'%'`.toLowerCase();
    });
  };
  const verifyRuntimeIdentity = async () => {
    const runtimeDb = runtimeConnection?.(runtimeUsername, runtimePassword) ?? createConnection({
      command: "status", root: input.root, schemaPath: "", directory: "", target: {
        environment: input.environment, cluster: "", host: input.host, database: input.database,
        principal: runtimeUsername,
      }, username: runtimeUsername, password: runtimePassword,
    });
    const rows = await runtimeDb.execute("SELECT CURRENT_USER() AS principal");
    const actual = String(rows[0]?.principal ?? "").split("@")[0];
    if (actual !== runtimeUsername) throw new Error("保存済みruntime credentialの接続先identityが一致しません。");
  };
  const existingRole = await db.execute("SELECT User FROM mysql.user WHERE User = ?", [runtimeRole]);
  const existingUser = await db.execute("SELECT User, authentication_string FROM mysql.user WHERE User = ?", [runtimeUsername]);
  if ((existingRole.length || existingUser.length) && owner !== "katana-cloudflare-tidb-v1") {
    throw new Error("TiDB上に同名の未管理runtime user/roleがあります。既存アカウントを確認してから再実行してください。");
  }
  if (existingUser.length) {
    // HTTPS SQL can reject a USAGE-only principal before grants are installed.
    // Check its stored MySQL-native password hash before giving it privileges.
    const storedHash = String(existingUser[0].authentication_string ?? "");
    const firstHash = createHash("sha1").update(runtimePassword).digest();
    const expectedHash = `*${createHash("sha1").update(firstHash).digest("hex").toUpperCase()}`;
    if (!storedHash || storedHash.length !== expectedHash.length ||
        !timingSafeEqual(Buffer.from(storedHash.toUpperCase()), Buffer.from(expectedHash))) {
      throw new Error("保存済みruntime credentialとTiDB userの認証情報が一致しません。");
    }
    const rows = await db.execute(`SHOW GRANTS FOR ${quoteUser(runtimeUsername)}@'%'`);
    const grants = rows.map((row) => String(Object.values(row)[0] ?? "").replace(/\s+/g, " ").trim().toLowerCase());
    const roleGrant = `grant ${quoteUser(runtimeRole)}@'%' to ${quoteUser(runtimeUsername)}@'%'`.toLowerCase();
    const usageGrant = `grant usage on *.* to ${quoteUser(runtimeUsername)}@'%'`.toLowerCase();
    const allowed = (grant: string) => grant === usageGrant || grant === roleGrant || hasOnlyExpectedTableGrants(grant, runtimeUsername);
    if (grants.some((grant) => !allowed(grant))) {
      throw new Error("TiDB runtime userにrole以外または未知形式の権限があります。権限を確認してから再実行してください。");
    }
  }
  // Create/authenticate the user before adding any privileges. A name collision with
  // different credentials therefore fails before receiving the managed role.
  if (!existingUser.length) {
    await db.execute(`CREATE USER ${quoteUser(runtimeUsername)} IDENTIFIED BY ${quotePassword(runtimePassword)}`);
  }
  if (existingRole.length) {
    const rows = await db.execute(`SHOW GRANTS FOR ${quoteUser(runtimeRole)}@'%'`);
    const actual = rows.map((row) => String(Object.values(row)[0] ?? ""));
    if (actual.some((grant) => !hasOnlyExpectedTableGrants(grant, runtimeRole))) {
      throw new Error("TiDB runtime roleにmanifest外または未知形式の権限があります。権限を確認してから再実行してください。");
    }
    const recipients = await db.execute("SELECT TO_USER FROM mysql.role_edges WHERE FROM_USER = ?", [runtimeRole]);
    if (recipients.some((row) => String(row.TO_USER ?? "") !== runtimeUsername)) {
      throw new Error("TiDB runtime roleが別user/roleにも割り当てられています。権限を確認してから再実行してください。");
    }
  }
  await db.execute(`CREATE ROLE IF NOT EXISTS ${quoteUser(runtimeRole)}`);
  for (const item of tables) {
    await db.execute(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ${quoteIdentifier(item.database)}.${quoteIdentifier(item.table)} TO ${quoteUser(runtimeRole)}`,
    );
    // TiDB Serverless HTTPS SQL accepts table privileges but rejects role assignment (DCL).
    await db.execute(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ${quoteIdentifier(item.database)}.${quoteIdentifier(item.table)} TO ${quoteUser(runtimeUsername)}`,
    );
  }
  await verifyRuntimeIdentity();
  return { checkedTables: tables.length, role: runtimeRole };
  } finally {
    await unlink(join(lock, "owner")).catch(() => undefined);
    await rmdir(lock).catch(() => undefined);
  }
}

async function saveRuntimeCredentialState(root: string, state: Record<string, unknown>): Promise<void> {
  const directory = resolve(root, "cloudflare");
  const file = resolve(directory, "tidb.yaml");
  if (!file.startsWith(`${directory}/`)) throw new Error("TiDB credential pathが不正です。");
  const temporary = join(directory, `.tidb.yaml.${randomBytes(8).toString("hex")}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, file);
    await chmod(file, 0o600);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
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
