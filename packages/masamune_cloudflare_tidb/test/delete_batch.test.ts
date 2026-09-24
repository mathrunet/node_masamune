import { executeDirectCrud } from "../src/lib/direct_crud";
import { TidbDirectClient, SchemaManifest } from "../src/lib/direct_client";

const manifest: SchemaManifest = { version: "1", tables: [{
  database: "main", table: "items", primaryKey: ["id"], vectorFields: [],
  columns: [{ name: "id", sqlType: "VARCHAR(255)", nullable: false },
    { name: "name", sqlType: "TEXT", nullable: true }],
}] };
const request = { database: "main", table: "items", where: [{ key: "name", value: "fixture" }] };
const makeClient = () => new TidbDirectClient({ host: "fixture.invalid", username: "fixture", password: "fixture", manifest });

test("deletes 634 matched rows in bounded batches while retaining the original filter", async () => {
  const client = makeClient();
  const ids = Array.from({ length: 634 }, (_, i) => `id-${i}`);
  const execute = jest.spyOn(client, "execute").mockResolvedValue([])
    .mockResolvedValueOnce(ids.map(id => ({ id, name: "fixture" })));
  expect(await executeDirectCrud({ client, method: "DELETE", request })).toEqual([]);
  const deletes = execute.mock.calls.filter(call => call[1].startsWith("DELETE"));
  expect(deletes).toHaveLength(7);
  expect(deletes.flatMap(call => call[2]!.slice(1))).toEqual(ids);
  for (const [, sql, parameters] of deletes) {
    expect(sql).toMatch(/WHERE `name` = \? AND `id` IN \(/);
    expect(parameters![0]).toBe("fixture");
    expect(parameters!.length).toBeLessThanOrEqual(101);
    expect(sql).not.toContain("fixture");
    expect(sql).not.toContain("id-0");
  }
  expect(execute).toHaveBeenCalledTimes(8);
});

test("validates every selected ID before deleting any row", async () => {
  const client = makeClient();
  const execute = jest.spyOn(client, "execute").mockResolvedValue([]).mockResolvedValueOnce([{ id: "valid" }, { id: 42 }]);
  await expect(executeDirectCrud({ client, method: "DELETE", request })).rejects.toThrow("string id");
  expect(execute).toHaveBeenCalledTimes(1);
});

test("does not delete newly matching rows when the selected set is empty", async () => {
  const client = makeClient();
  const execute = jest.spyOn(client, "execute").mockResolvedValue([]);
  expect(await executeDirectCrud({ client, method: "DELETE", request })).toEqual([]);
  expect(execute).toHaveBeenCalledTimes(1);
});

test("does not retry a failed mutation or send later batches", async () => {
  const client = makeClient();
  const execute = jest.spyOn(client, "execute")
    .mockResolvedValueOnce(Array.from({ length: 201 }, (_, i) => ({ id: `id-${i}` })))
    .mockRejectedValueOnce(new Error("upstream failure"));
  await expect(executeDirectCrud({ client, method: "DELETE", request })).rejects.toThrow("upstream failure");
  expect(execute).toHaveBeenCalledTimes(2);
});
