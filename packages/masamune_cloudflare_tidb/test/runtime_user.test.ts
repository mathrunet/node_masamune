import { MigrationConnection } from "../src/lib/migration";
import { provisionRuntimeUser } from "../src/migrate";
import { mkdtemp, readFile, stat, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const input = {
  root: ".",
  host: "fixture.invalid",
  database: "shared",
  migrationUsername: "prefix.migrate_dev",
  migrationPassword: "fixture-admin-secret",
  runtimeUsername: "prefix.rt_abcd12",
  runtimePassword: "fixture-runtime-secret",
  runtimeRole: "topolia_rw_abcd12",
  environment: "dev" as const,
  credentialState: { cloudflare: { tidb: { runtime_users: { dev: { owner: "katana-cloudflare-tidb-v1" } } } } } as Record<string, unknown>,
  tables: [
    { database: "shared", table: "landmarks" },
    { database: "shared", table: "regions" },
  ],
};

function connection(
  existing: string[] = ["landmarks", "regions"],
  accounts: string[] = [],
  grants: string[] | ((sql: string) => string[]) = [],
  failOn?: string,
): {
  connection: MigrationConnection;
  statements: string[];
} {
  const statements: string[] = [];
  const passwordHash = `*${createHash("sha1").update(createHash("sha1").update(input.runtimePassword).digest()).digest("hex").toUpperCase()}`;
  return {
    statements,
    connection: {
      execute: async (sql, parameters) => {
        statements.push(sql.replaceAll(input.runtimePassword, "<redacted>"));
        if (failOn && sql.startsWith(failOn)) throw new Error("fixture interruption");
        if (sql.startsWith("SELECT TABLE_NAME")) {
          return existing.includes(String(parameters?.[1])) ? [{ TABLE_NAME: "found" }] : [];
        }
        if (sql.includes("FROM mysql.user")) {
          return accounts.includes(String(parameters?.[0])) ? [{ User: parameters?.[0], authentication_string: passwordHash }] : [];
        }
        if (sql.startsWith("SHOW GRANTS")) {
          const selected = typeof grants === "function" ? grants(sql) : grants;
          return selected.map((grant) => ({ Grants: grant }));
        }
        if (sql.startsWith("SELECT CURRENT_USER")) return [{ principal: "prefix.migrate_dev@%" }];
        return [];
      },
    },
  };
}

const runtimeConnection = (username: string): MigrationConnection => ({
  execute: async () => [{ principal: `${username}@%` }],
});

describe("provisionRuntimeUser", () => {
  test.each([false, true])("connects as runtime only after all table grants (existing user=%s)", async (existing) => {
    const fixture = connection(
      ["landmarks", "regions"],
      existing ? [input.runtimeUsername] : [],
      ["GRANT USAGE ON *.* TO 'prefix.rt_abcd12'@'%'"],
    );
    let identityChecks = 0;
    const runtime = (username: string): MigrationConnection => ({
      execute: async () => {
        identityChecks++;
        for (const { database, table } of input.tables) {
          const grant = `GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.\`${table}\` TO '${username}'`;
          if (!fixture.statements.includes(grant)) {
            throw new Error("401: default database access denied before table grants");
          }
        }
        return [{ principal: `${username}@%` }];
      },
    });
    await expect(provisionRuntimeUser(input, fixture.connection, runtime)).resolves.toEqual({
      checkedTables: 2, role: input.runtimeRole,
    });
    expect(identityChecks).toBe(1);
  });

  test("checks all manifest tables before making any user or grant changes", async () => {
    const fixture = connection(["landmarks"]);
    await expect(provisionRuntimeUser(input, fixture.connection)).rejects.toThrow(
      "先にkatana migrate applyを実行してください: shared.regions",
    );
    expect(fixture.statements.some((sql) => sql.startsWith("CREATE "))).toBe(false);
    expect(fixture.statements.some((sql) => sql.startsWith("GRANT "))).toBe(false);
  });

  test("grants only CRUD on manifest tables and can be retried with the same credentials", async () => {
    const fixture = connection();
    const result = await provisionRuntimeUser(input, fixture.connection, (username) => runtimeConnection(username));
    expect(result.checkedTables).toBe(2);
    expect(fixture.statements).toContain("CREATE ROLE IF NOT EXISTS 'topolia_rw_abcd12'");
    expect(fixture.statements).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON `shared`.`landmarks` TO 'topolia_rw_abcd12'",
    );
    expect(fixture.statements).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON `shared`.`landmarks` TO 'prefix.rt_abcd12'",
    );
    expect(fixture.statements).toContain(
      "CREATE USER 'prefix.rt_abcd12' IDENTIFIED BY '<redacted>'",
    );
    expect(fixture.statements).not.toContain("GRANT 'topolia_rw_abcd12' TO 'prefix.rt_abcd12'");
    expect(fixture.statements.some((sql) => sql.startsWith("SET DEFAULT ROLE"))).toBe(false);
    expect(fixture.statements.join("\n")).not.toContain(input.runtimePassword);
    expect(fixture.statements).not.toContain("GRANT ALL");

    fixture.statements.length = 0;
    await provisionRuntimeUser(input, fixture.connection, (username) => runtimeConnection(username));
    expect(fixture.statements.filter((sql) => sql.startsWith("CREATE ROLE"))).toHaveLength(1);
    expect(fixture.statements.filter((sql) => sql.startsWith("CREATE USER"))).toHaveLength(1);
  });

  test("rejects unsafe manifest identifiers", async () => {
    const fixture = connection();
    const invalid = { ...input, tables: [{ database: "shared; DROP USER x", table: "landmarks" }] };
    await expect(provisionRuntimeUser(invalid, fixture.connection)).rejects.toThrow("不正なSQL識別子");
  });

  test("does not modify an unowned colliding SQL account", async () => {
    const fixture = connection(["landmarks", "regions"], [input.runtimeUsername]);
    const unowned = { ...input, credentialState: {} };
    await expect(provisionRuntimeUser(unowned, fixture.connection)).rejects.toThrow("未管理runtime user/role");
    expect(fixture.statements.some((sql) => sql.startsWith("CREATE "))).toBe(false);
  });

  test("fails closed when an owned role has unknown or excessive privileges", async () => {
    const fixture = connection(["landmarks", "regions"], [input.runtimeRole], [
      "GRANT ALL PRIVILEGES ON *.* TO 'topolia_rw_abcd12'@'%'",
    ]);
    await expect(provisionRuntimeUser(input, fixture.connection, (username) => runtimeConnection(username))).rejects.toThrow("manifest外または未知形式の権限");
    expect(fixture.statements.some((sql) => sql.startsWith("GRANT "))).toBe(false);
    expect(fixture.statements.some((sql) => sql.startsWith("CREATE ROLE"))).toBe(false);
  });

  test.each([false, true])("resumes an owned role with USAGE (existing table grants=%s)", async (withTableGrants) => {
    const fixture = connection(["landmarks", "regions"], [input.runtimeRole, input.runtimeUsername], (sql) =>
      sql.startsWith("SHOW GRANTS FOR 'topolia_rw_abcd12'")
        ? [
            "GRANT USAGE ON *.* TO 'topolia_rw_abcd12'@'%'",
            ...(withTableGrants ? ["GRANT Delete,Insert,Select,Update ON shared.landmarks TO 'topolia_rw_abcd12'@'%'"] : []),
          ]
        : ["GRANT USAGE ON *.* TO 'prefix.rt_abcd12'@'%'"]);
    await expect(provisionRuntimeUser(input, fixture.connection, runtimeConnection)).resolves.toEqual({
      checkedTables: 2, role: input.runtimeRole,
    });
    expect(fixture.statements.some((sql) => sql.startsWith("CREATE USER"))).toBe(false);
  });

  test.each([
    "GRANT USAGE ON *.* TO 'another_role'@'%'",
    "GRANT USAGE ON *.* TO 'topolia_rw_abcd12'@'localhost'",
    "GRANT USAGE ON *.* TO 'topolia_rw_abcd12'@'%' WITH GRANT OPTION",
    "GRANT SELECT ON *.* TO 'topolia_rw_abcd12'@'%'",
  ])("rejects unexpected role grants: %s", async (grant) => {
    const fixture = connection(["landmarks", "regions"], [input.runtimeRole], [grant]);
    await expect(provisionRuntimeUser(input, fixture.connection, runtimeConnection))
      .rejects.toThrow("TiDB runtime roleにmanifest外または未知形式の権限があります。");
    expect(fixture.statements.some((sql) => sql.startsWith("GRANT "))).toBe(false);
  });

  test("rejects inherited roles outside the managed role on an owned runtime user", async () => {
    const fixture = connection(["landmarks", "regions"], [input.runtimeUsername], [
      "GRANT USAGE ON *.* TO 'prefix.rt_abcd12'@'%'",
      "GRANT 'topolia_rw_abcd12'@'%' TO 'prefix.rt_abcd12'@'%'",
      "GRANT 'role_admin'@'%' TO 'prefix.rt_abcd12'@'%'",
    ]);
    await expect(provisionRuntimeUser(input, fixture.connection, (username) => runtimeConnection(username))).rejects.toThrow("role以外または未知形式の権限");
    expect(fixture.statements.some((sql) => sql.startsWith("CREATE USER"))).toBe(false);
  });

  test("reuses owned accounts with TiDB unquoted SHOW GRANTS identifiers", async () => {
    const fixture = connection(["landmarks", "regions"], [input.runtimeRole, input.runtimeUsername], (sql) =>
      sql.startsWith("SHOW GRANTS FOR 'topolia_rw_abcd12'")
        ? [
            "GRANT Delete,Insert,Select,Update ON shared.landmarks TO 'topolia_rw_abcd12'@'%'",
            "GRANT Delete,Insert,Select,Update ON shared.regions TO 'topolia_rw_abcd12'@'%'",
          ]
        : [
            "GRANT USAGE ON *.* TO 'prefix.rt_abcd12'@'%'",
            "GRANT 'topolia_rw_abcd12'@'%' TO 'prefix.rt_abcd12'@'%'",
            "GRANT Delete,Insert,Select,Update ON shared.landmarks TO 'prefix.rt_abcd12'@'%'",
          ]);
    const result = await provisionRuntimeUser(input, fixture.connection, (username) => runtimeConnection(username));
    expect(result.checkedTables).toBe(2);
    expect(fixture.statements).toContain("SHOW GRANTS FOR 'topolia_rw_abcd12'@'%'");
    expect(fixture.statements).toContain("SHOW GRANTS FOR 'prefix.rt_abcd12'@'%'");
    expect(fixture.statements.some((sql) => sql.includes(" USING "))).toBe(false);
    expect(fixture.statements.some((sql) => sql.startsWith("CREATE USER"))).toBe(false);
  });

  test("refuses to grant privileges when the existing account password hash differs", async () => {
    const fixture = connection(["landmarks", "regions"], [input.runtimeUsername]);
    const wrongPassword = { ...input, runtimePassword: "different-runtime-secret" };
    await expect(provisionRuntimeUser(wrongPassword, fixture.connection)).rejects.toThrow("認証情報が一致しません");
    expect(fixture.statements.some((sql) => sql.startsWith("CREATE ROLE"))).toBe(false);
    expect(fixture.statements.some((sql) => sql.startsWith("GRANT "))).toBe(false);
  });

  test("refuses a stale or concurrent lock and leaves it for explicit operator recovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "tidb-runtime-lock-"));
    try {
      const lock = join(root, "cloudflare", ".tidb-runtime-user.lock");
      await mkdir(lock, { recursive: true });
      await writeFile(join(lock, "owner"), "1234\n");
      const fixture = connection();
      await expect(provisionRuntimeUser({ ...input, root }, fixture.connection)).rejects.toThrow("pid=1234");
      expect(fixture.statements.some((sql) => sql.startsWith("CREATE "))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("persists fresh credentials atomically before SQL mutations and reuses them after interruption", async () => {
    const root = await mkdtemp(join(tmpdir(), "tidb-runtime-state-"));
    try {
      const fixture = connection(["landmarks", "regions"], [], [], "CREATE ROLE");
      await expect(provisionRuntimeUser({
        ...input,
        root,
        runtimeUsername: "",
        runtimePassword: "",
        runtimeRole: "",
      }, fixture.connection, (username) => runtimeConnection(username))).rejects.toThrow("fixture interruption");
      const path = join(root, "cloudflare", "tidb.yaml");
      const saved = JSON.parse(await readFile(path, "utf8"));
      const statResult = await stat(path);
      expect(statResult.mode & 0o777).toBe(0o600);
      expect(saved.cloudflare.tidb.runtime_users.dev.username).toMatch(/^prefix\.rt_[a-f0-9]{8}$/);
      expect(fixture.statements.indexOf("SELECT CURRENT_USER() AS principal"))
        .toBeLessThan(fixture.statements.findIndex((sql) => sql.startsWith("CREATE ROLE")));
      const pendingUsername = saved.cloudflare.tidb.runtime_users.dev.username;
      const pendingRole = saved.cloudflare.tidb.runtime_users.dev.role;
      const firstCreateUser = fixture.statements.find((sql) => sql.startsWith("CREATE USER"));
      expect(firstCreateUser).toContain(pendingUsername);

      const retry = connection();
      const second = await provisionRuntimeUser({
        ...input,
        root,
        runtimeUsername: "",
        runtimePassword: "",
        runtimeRole: "",
        credentialState: saved,
      }, retry.connection, (username) => runtimeConnection(username));
      expect(second.role).toBe(pendingRole);
      expect(retry.statements.find((sql) => sql.startsWith("CREATE USER"))).toBe(firstCreateUser);
      expect(retry.statements.some((sql) => sql.startsWith("SELECT CURRENT_USER"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects an unexpected migration identity before generating credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "tidb-runtime-identity-"));
    try {
      const fixture = connection();
      const wrong: MigrationConnection = { execute: async (sql, parameters) =>
        sql.startsWith("SELECT CURRENT_USER") ? [{ principal: "prefix.root@%" }] : fixture.connection.execute(sql, parameters) };
      await expect(provisionRuntimeUser({ ...input, root, runtimeUsername: "", runtimePassword: "", runtimeRole: "" }, wrong))
        .rejects.toThrow("prefixをmigration接続から判定できません");
      expect(fixture.statements.some((sql) => sql.startsWith("CREATE ") || sql.startsWith("GRANT "))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
