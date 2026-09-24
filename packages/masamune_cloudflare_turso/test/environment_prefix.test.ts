import { resolveWorkerDatabasePrefix } from "../src/lib/database_prefix";
import { resolvePhysicalDatabaseName } from "../src/lib/database_name";
import { TursoWorkersOptions } from "../src/lib/types";

const bindings = {
  dev: { main: { database: "example-dev-main", group: "example-dev" } },
  prod: { main: { database: "example-prod-main", group: "example-prod" } },
};

describe("既存DBへの環境別対応表", () => {
  const options = { databaseBindings: bindings, autoCreateDatabase: true } as TursoWorkersOptions;
  const resolve = resolveWorkerDatabasePrefix;

  test("prefixを送らない旧クライアントをdevの既存DBへ限定する", async () => {
    const result = resolve(options, undefined, "dev", "main");
    await expect(resolvePhysicalDatabaseName("main", result)).resolves.toBe("example-dev-main");
    expect(result.autoCreateDatabase).toBe(false);
    expect(result.groups).toEqual([{ name: "example-dev" }]);
    await expect(resolvePhysicalDatabaseName("other", result)).rejects.toThrow();
  });

  test("prodはprod用の対応表だけを使う", async () => {
    const result = resolve(options, undefined, "prod", "main");
    await expect(resolvePhysicalDatabaseName("main", result)).resolves.toBe("example-prod-main");
  });

  test.each([
    [undefined, undefined, "main"],
    [undefined, "stg", "main"],
    [undefined, "dev", "unknown"],
    ["dev_", "dev", "main"],
    ["prod_", "dev", "main"],
  ])("曖昧な環境・未登録DB・クライアントprefixを拒否 %p %p %p", (prefix, flavor, database) => {
    expect(() => resolve(options, prefix, flavor, database)).toThrow();
  });

  test("devとprodで同じ物理DBを指定した設定を拒否", () => {
    const invalid = { databaseBindings: {
      dev: bindings.dev, prod: bindings.dev,
    } } as TursoWorkersOptions;
    expect(() => resolve(invalid, undefined, "dev", "main")).toThrow();
  });

  test("対応表のある未解決optionsを直接DB解決へ渡してもfail closed", async () => {
    await expect(resolvePhysicalDatabaseName("main", options)).rejects.toThrow();
  });

  test.each([
    { databaseBindings: null },
    { databaseBindings: {} },
    { databaseBindings: { dev: {} } },
    { databaseBindings: { stg: bindings.dev } },
    { databaseBindings: { dev: { main: { database: "invalid_name", group: "dev" } } } },
    { databaseBindings: { dev: { main: { database: "example-dev-main", group: "" } } } },
    { databaseBindings: { dev: { main: bindings.dev.main, alias: bindings.dev.main } } },
    { databaseBindings: bindings, group: "wrong-group" },
    { databaseBindings: bindings, groups: [{ name: "wrong-group" }] },
    { databaseBindings: bindings, databasePrefix: "dev_" },
  ])("無効な設定を接続前に拒否 %p", (invalid) => {
    expect(() => resolve(invalid as TursoWorkersOptions, undefined, "dev", "main")).toThrow();
  });
});

describe("Turso Worker environment prefix", () => {
  test("prod without request prefix keeps databasePrefix undefined", () => {
    expect(resolveWorkerDatabasePrefix({}, undefined, "prod").databasePrefix)
      .toBeUndefined();
    expect(resolveWorkerDatabasePrefix({}, undefined, undefined).databasePrefix)
      .toBeUndefined();
  });

  test("prod with request prefix appends after boundary", () => {
    expect(resolveWorkerDatabasePrefix({}, "bench_", "prod").databasePrefix)
      .toBe("bench_");
  });

  test("dev without request prefix uses dev boundary", () => {
    expect(resolveWorkerDatabasePrefix({}, undefined, "dev").databasePrefix)
      .toBe("dev_");
  });

  test("dev with request prefix composes after boundary", () => {
    expect(resolveWorkerDatabasePrefix({}, "bench_", "dev").databasePrefix)
      .toBe("dev_bench_");
  });

  test("dev with request prefix duplicating boundary keeps boundary intact", () => {
    expect(resolveWorkerDatabasePrefix({}, "dev_", "dev").databasePrefix)
      .toBe("dev_dev_");
  });

  test("server prefix equal to boundary composes without duplication", () => {
    expect(
      resolveWorkerDatabasePrefix(
        { databasePrefix: "dev_" },
        "bench_",
        "dev",
      ).databasePrefix,
    ).toBe("dev_bench_");
  });

  test("server prefix extending boundary is preserved before request prefix", () => {
    expect(
      resolveWorkerDatabasePrefix(
        { databasePrefix: "dev_ns_" },
        "bench_",
        "dev",
      ).databasePrefix,
    ).toBe("dev_ns_bench_");
  });

  test("rejects server prefix that does not match dev boundary", () => {
    expect(() =>
      resolveWorkerDatabasePrefix(
        { databasePrefix: "prod_" },
        undefined,
        "dev",
      ),
    ).toThrow();
  });

  test("rejects server prefix that does not match prod boundary", () => {
    expect(() =>
      resolveWorkerDatabasePrefix(
        { databasePrefix: "dev_" },
        undefined,
        "prod",
      ),
    ).toThrow();
  });

  test("rejects unknown FLAVOR", () => {
    expect(() => resolveWorkerDatabasePrefix({}, undefined, "stg")).toThrow();
  });
});
