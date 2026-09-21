import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MigrateInput, runMigrate } from "../src/migrate";

test("generate/diffは接続せずSQLとsnapshotを保存し、改変と環境混同を拒否する", async () => {
  const root = await mkdtemp(join(tmpdir(), "tidb-migration-"));
  try {
    await writeFile(join(root, "schema.json"), JSON.stringify({ version: "1", tables: [{ database: "app", table: "items", columns: [
      { name: "id", sqlType: "VARCHAR(255)", nullable: false },
    ], primaryKey: ["id"], vectorFields: [] }] }));
    const input: MigrateInput = { root, schemaPath: "schema.json", directory: "migrations", command: "diff", version: "20260920_initial",
      target: { database: "app", environment: "dev", host: "fixture.invalid", cluster: "fixture", principal: "fixture.user" } };
    const connection = { execute: jest.fn().mockRejectedValue(new Error("外部接続は禁止")) };
    expect(await runMigrate(input, connection)).toEqual(expect.objectContaining({ version: input.version }));
    expect(await runMigrate({ ...input, command: "generate" }, connection)).toEqual(expect.objectContaining({ generated: input.version, statements: 1 }));
    expect(connection.execute).not.toHaveBeenCalled();
    await expect(runMigrate({ ...input, command: "generate" }, connection)).rejects.toThrow("version");
    await expect(runMigrate({ ...input, schemaPath: "../outside.json" }, connection)).rejects.toThrow("project内");
    await expect(runMigrate({ ...input, target: { ...input.target, cluster: "other" } }, connection)).rejects.toThrow("接続先");
    const sql = join(root, "migrations/dev/app/20260920_initial.sql");
    expect(await readFile(sql, "utf8")).toContain("CREATE TABLE `app`.`items`");
    await writeFile(sql, "DROP TABLE `app`.`items`;\n");
    await expect(runMigrate(input, connection)).rejects.toThrow("SQLファイル");
  } finally { await rm(root, { recursive: true, force: true }); }
});
