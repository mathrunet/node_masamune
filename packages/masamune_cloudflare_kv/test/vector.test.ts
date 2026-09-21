import { DatabaseSync } from "node:sqlite";
import { deploy } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";
import { KvVectorCoordinator } from "../src/lib/vector";
import type { VectorIndex } from "../src/lib/types";

class Store {
  db = new DatabaseSync(":memory:"); depth = 0; alarms: number[] = [];
  sql = { exec: (sql: string, ...args: unknown[]) => { const rows = this.db.prepare(sql).all(...args as never[]) as Record<string, unknown>[]; return { toArray: () => rows }; } };
  setAlarm = async (time: number) => { this.alarms.push(time); };
  transactionSync<T>(callback: () => T): T { const name = `kv_${this.depth++}`; this.db.exec(`SAVEPOINT ${name}`); try { const value = callback(); this.db.exec(`RELEASE ${name}`); return value; } catch (error) { this.db.exec(`ROLLBACK TO ${name}`); this.db.exec(`RELEASE ${name}`); throw error; } finally { this.depth--; } }
}
class FakeIndex implements VectorIndex {
  values = new Map<string, { values: number[]; namespace: string }>(); fail = false;
  async upsert(values: { id: string; values: number[]; namespace: string }[]) { if (this.fail) throw Error("停止"); for (const value of values) this.values.set(value.id, value); return { mutationId: "upsert" }; }
  async deleteByIds(ids: string[]) { if (this.fail) throw Error("停止"); ids.forEach(id => this.values.delete(id)); return { mutationId: "delete" }; }
  async query(_values: number[], options: { namespace: string }) { return { matches: [...this.values].filter(([, value]) => value.namespace === options.namespace).map(([id]) => ({ id, score: 1 })) }; }
}

const rules = { version: "1", rules: { database: { "**": { read: "allow", write: "allow" } } } } as const;
const spec = { field: "embedding", dimensions: 32, metric: "cosine" as const, binding: "VECTORS", prefix: "items/" };
const embedding = [1, ...Array(31).fill(0)];
let store: Store, index: FakeIndex, values: Map<string, string>, coordinator: KvVectorCoordinator;

beforeEach(() => {
  store = new Store(); index = new FakeIndex(); values = new Map();
  const kv = { get: async (key: string) => values.get(key) ?? null, put: async (key: string, value: string) => { values.set(key, value); }, delete: async (key: string) => { values.delete(key); } };
  coordinator = new KvVectorCoordinator({ storage: store }, { MASAMUNE_KV: kv, VECTORS: index });
});
afterEach(() => store.db.close());

function app() {
  const namespace = { idFromName: (name: string) => name, get: () => ({ fetch: (request: Request) => coordinator.fetch(request) }) };
  return { worker: deploy([Functions.kv({ rules, vectors: [spec] })]), env: { MASAMUNE_KV: { get: async (key: string) => values.get(key) ?? null, put: async (key: string, value: string) => { values.set(key, value); }, delete: async (key: string) => { values.delete(key); } }, MASAMUNE_KV_VECTOR_COORDINATOR: namespace, VECTORS: index, FLAVOR: "prod" } };
}

async function put(worker: ReturnType<typeof app>["worker"], env: ReturnType<typeof app>["env"], key: string, value: unknown) {
  return worker.request(`http://localhost/kv/document/${key}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ value }) }, env);
}

test("intentを先に永続化してKV保存とVectorize反映を行う", async () => {
  const { worker, env } = app();
  expect((await put(worker, env, "items/a", { id: "a", embedding })).status).toBe(200);
  expect(JSON.parse(values.get("items/a")!)).toMatchObject({ id: "a" });
  expect(index.values.size).toBe(1);
  expect(store.db.prepare("SELECT status FROM _masamune_vector_jobs").get()!.status).toBe("accepted");
});

test("nearestは現行世代・prefix・rulesを通った文書だけ返す", async () => {
  const { worker, env } = app();
  await put(worker, env, "items/a", { id: "a", embedding });
  await coordinator.fetch(new Request("https://kv-vector.internal", {
    method: "POST",
    body: JSON.stringify({ action: "write", key: "items2/b", value: { id: "b", embedding }, specs: [spec], kvBinding: "MASAMUNE_KV", namespaceParts: ["prod", "MASAMUNE_KV"] }),
  }));
  const nearest = encodeURIComponent(JSON.stringify({ key: "embedding", value: embedding }));
  const response = await worker.request(`http://localhost/kv/collection/items?nearest=${nearest}&limit=10`, undefined, env);
  expect(response.status).toBe(200);
  expect((await response.json() as any).data).toEqual({ a: { id: "a", embedding } });
  values.set("items/a", JSON.stringify({ id: "a", name: "旧cache", embedding }));
  const stale = await worker.request(`http://localhost/kv/collection/items?nearest=${nearest}`, undefined, env);
  expect((await stale.json() as any).data).toEqual({});
  values.set("items/a", JSON.stringify({ id: "a", embedding }));
  await worker.request("http://localhost/kv/document/items/a", { method: "DELETE" }, env);
  const deleted = await worker.request(`http://localhost/kv/collection/items?nearest=${nearest}`, undefined, env);
  expect((await deleted.json() as any).data).toEqual({});
});

test("Vectorize障害でもintentとKV本文を保持しalarmで回復する", async () => {
  const { worker, env } = app(); index.fail = true;
  expect((await put(worker, env, "items/a", { id: "a", embedding })).status).toBe(200);
  expect(values.has("items/a")).toBe(true);
  expect(store.db.prepare("SELECT status FROM _masamune_vector_jobs").get()!.status).toBe("failed");
  index.fail = false; store.db.exec("UPDATE _masamune_vector_jobs SET next_attempt=0"); await coordinator.alarm();
  expect(index.values.size).toBe(1);
});

test("未取得vectorは既存値を保持し、不正な次元は本文を書き換えない", async () => {
  const { worker, env } = app();
  await put(worker, env, "items/a", { id: "a", embedding });
  const unloaded = { "@type": "ModelVectorValue", "@vector": [], "@measure": "cosine" };
  await put(worker, env, "items/a", { id: "a", name: "更新", embedding: unloaded });
  expect(JSON.parse(values.get("items/a")!).embedding).toEqual(embedding);
  const before = values.get("items/a");
  expect((await put(worker, env, "items/a", { id: "a", embedding: [1, 2] })).status).toBe(400);
  expect(values.get("items/a")).toBe(before);
});
