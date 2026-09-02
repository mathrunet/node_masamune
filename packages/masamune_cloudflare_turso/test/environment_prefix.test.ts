import { resolveWorkerDatabasePrefix } from "../src/lib/database_prefix";

describe("Turso Worker environment prefix", () => {
  test("maps dev to exactly one dev prefix", () => {
    expect(resolveWorkerDatabasePrefix({}, "dev_", "dev").databasePrefix)
      .toBe("dev_");
    expect(resolveWorkerDatabasePrefix(
      { databasePrefix: "dev_" },
      "dev_",
      "dev",
    ).databasePrefix).toBe("dev_");
  });

  test("keeps prod unprefixed", () => {
    expect(resolveWorkerDatabasePrefix({}, undefined, "prod").databasePrefix)
      .toBeUndefined();
    expect(resolveWorkerDatabasePrefix({}, undefined, undefined).databasePrefix)
      .toBeUndefined();
  });

  test.each([
    ["dev", undefined],
    ["prod", "dev_"],
    ["stg", undefined],
  ])("rejects FLAVOR=%s with request prefix %s", (flavor, prefix) => {
    expect(() => resolveWorkerDatabasePrefix({}, prefix, flavor)).toThrow();
  });
});
