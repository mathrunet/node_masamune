import { resolveWorkerDatabasePrefix } from "../src/lib/database_prefix";

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
