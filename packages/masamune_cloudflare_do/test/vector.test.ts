import { DatabaseSync } from "node:sqlite";
import { DurableObjectDatabase } from "../src/lib/database";
import { revision } from "../src/lib/schema";
import type { DoIdentity, DoStorage, SchemaManifest, VectorIndex } from "../src/lib/types";

class Store implements DoStorage {
  db = new DatabaseSync(":memory:");
  depth = 0;
  alarms: number[] = [];
  setAlarm = async (time: number) => {
    if (time <= 0) throw new TypeError("setAlarm() cannot be called with an alarm time <= 0");
    this.alarms.push(time);
  };
  sql = { exec: (sql: string, ...args: unknown[]) => { const rows = this.db.prepare(sql).all(...args as never[]) as Record<string, unknown>[]; return { toArray: () => rows }; } };
  transactionSync<T>(callback: () => T): T {
    const name = `vector_${this.depth++}`;
    this.db.exec(`SAVEPOINT ${name}`);
    try { const result = callback(); this.db.exec(`RELEASE ${name}`); return result; }
    catch (error) { this.db.exec(`ROLLBACK TO ${name}`); this.db.exec(`RELEASE ${name}`); throw error; }
    finally { this.depth--; }
  }
}

class FakeIndex implements VectorIndex {
  values = new Map<string, { values: number[]; namespace: string }>();
  fail = false;
  async upsert(values: { id: string; values: number[]; namespace: string }[]) { if (this.fail) throw Error("停止"); for (const value of values) this.values.set(value.id, value); return { mutationId: "upsert" }; }
  async deleteByIds(ids: string[]) { if (this.fail) throw Error("停止"); ids.forEach(id => this.values.delete(id)); return { mutationId: "delete" }; }
  async query(_values: number[], options: { namespace: string }) { return { matches: [...this.values].filter(([, value]) => value.namespace === options.namespace).map(([id]) => ({ id, score: 1 })) }; }
}

const identity: DoIdentity = { environment: "prod", database: "main", userId: "alice" };
const embedding = [1, ...Array(31).fill(0)];
const manifest: SchemaManifest = { version: "1", dialect: "sqlite", tables: [{
  database: "main", table: "items", primaryKey: ["id"], indexes: [], vectorFields: ["embedding"],
  vectors: [{ field: "embedding", dimensions: 32, metric: "cosine", binding: "VECTORS" }],
  columns: [{ name: "id", sqlType: "TEXT", nullable: false }, { name: "name", sqlType: "TEXT", nullable: true }, { name: "embedding", sqlType: "JSON", nullable: true }, { name: "created_at", sqlType: "INTEGER", nullable: true }, { name: "updated_at", sqlType: "INTEGER", nullable: true }],
}] };

let store: Store;
let index: FakeIndex;
let object: DurableObjectDatabase;

beforeEach(async () => {
  store = new Store(); index = new FakeIndex();
  object = new DurableObjectDatabase({ storage: store }, { VECTORS: index }, { schemaManifest: manifest, revisions: [await revision("20260921_vector", "main", null, manifest)] });
});
afterEach(() => store.db.close());

async function operation(method: string, indexKey?: string, value?: unknown, extra: Record<string, unknown> = {}) {
  return object.fetch(new Request("https://test", { method: "POST", body: JSON.stringify({ identity, operations: [{ method, request: { database: "main", table: "items", indexKey, value, ...extra } }] }) }));
}
async function admin(admin: string, adminRequest: Record<string, unknown> = {}) {
  return object.fetch(new Request("https://test", { method: "POST", body: JSON.stringify({ identity, admin, adminRequest }) }));
}

test("本文・世代・jobを同じtransactionに保存しalarmで反映する", async () => {
  expect((await operation("POST", "a", { name: "対象", embedding })).status).toBe(200);
  expect(store.db.prepare('SELECT count(*) n FROM "_masamune_vector_jobs"').get()!.n).toBe(1);
  expect(index.values.size).toBe(0);
  await object.alarm();
  expect(index.values.size).toBe(1);
  const response = await operation("GET", undefined, undefined, { nearest: { key: "embedding", value: embedding } });
  expect((await response.json() as any).data[0].map((row: any) => row.id)).toEqual(["a"]);
});

test("障害を永続化して再起動後に回復し、削除は即時に検索から除外する", async () => {
  await operation("POST", "a", { embedding }); index.fail = true; await object.alarm();
  expect(store.db.prepare('SELECT status FROM "_masamune_vector_jobs"').get()!.status).toBe("failed");
  index.fail = false;
  store.db.exec('UPDATE "_masamune_vector_jobs" SET next_attempt=0');
  object = new DurableObjectDatabase({ storage: store }, { VECTORS: index }, { schemaManifest: manifest, revisions: [await revision("20260921_vector", "main", null, manifest)] });
  await object.alarm(); expect(index.values.size).toBe(1);
  await operation("DELETE", "a");
  const response = await operation("GET", undefined, undefined, { nearest: { key: "embedding", value: embedding } });
  expect((await response.json() as any).data[0]).toEqual([]);
  await object.alarm(); expect(index.values.size).toBe(0);
});

test("入力検証・再構築cursor・管理statusを提供する", async () => {
  expect((await operation("POST", "bad", { embedding: [1, 2] })).status).toBe(400);
  await operation("POST", "a", { embedding });
  const rebuilt = await admin("vector-rebuild", { table: "items", limit: 1 }).then(response => response.json()) as any;
  expect(rebuilt.data).toEqual({ cursor: "a", done: false });
  expect((await admin("vector-status")).status).toBe(200);
});

test("個人と共有topicごとのVectorize namespaceが衝突せず、hub alarmと共存する", async () => {
  const spaces=new Set<string>();
  for(const topic of [undefined,"room-a","room-b"]) {
    const s=new Store();
    try {
      const i={environment:"prod",database:"main",userId:"@shared",...(topic?{topic}:{})};
      const shared={binding:"HUB",shards:2,generation:"v1"};
      const hub={idFromName:(n:string)=>n,get:()=>({fetch:async()=>Response.json({ok:true})})};
      const obj=new DurableObjectDatabase({storage:s},{VECTORS:index,HUB:hub},{schemaManifest:manifest,revisions:[await revision("20260921_vector","main",null,manifest)],shared});
      const result=await obj.fetch(new Request("https://test",{method:"POST",body:JSON.stringify({identity:i,operations:[{method:"POST",request:{database:"main",table:"items",indexKey:"a",value:{embedding}}}]})}));
      expect(result.status).toBe(200);await obj.alarm();
      spaces.add([...index.values.values()].at(-1)!.namespace);
      expect(s.db.prepare('SELECT count(*) n FROM _masamune_hub_outbox').get()!.n).toBe(0);
    }finally{s.db.close();}
  }
  expect(spaces.size).toBe(3);
});
