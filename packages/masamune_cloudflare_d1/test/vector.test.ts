import { D1Client } from "../src/lib/client";
import { executeCrud, mutation } from "../src/lib/crud";
import { diff, inspect } from "../src/lib/migration";
import { drainVectors, rebuildVectors, searchVectors, vectorValues } from "../src/lib/vector";
import { manifest, SqliteBinding } from "./sqlite";
import { Hono } from "hono";
import { registerD1 } from "../src/lib/route";
import type { SchemaManifest, VectorIndex } from "../src/lib/types";
const spec = { field: "embedding", dimensions: 32, metric: "cosine" as const, binding: "VECTORS" };
class FakeIndex implements VectorIndex {
  values = new Map<string, { values: number[]; namespace: string }>(); fail = false;
  before?: () => Promise<void>;
  async upsert(values: { id: string; values: number[]; namespace: string }[]) { if(this.fail) throw Error("停止"); if(this.before) await this.before(); for(const v of values) this.values.set(v.id, v); return { mutationId: "upsert" }; }
  async deleteByIds(ids: string[]) { if(this.fail) throw Error("停止"); ids.forEach(id => this.values.delete(id)); return { mutationId: "delete" }; }
  async query(_v: number[], o: { namespace: string }) { return { matches: [...this.values].filter(([,v]) => v.namespace === o.namespace).map(([id]) => ({id, score: 1})) }; }
}
let binding: SqliteBinding, schema: SchemaManifest, client: D1Client, index: FakeIndex;
const request = { database: "main", table: "items", indexKey: "a" };
const find = () => searchVectors(client, { VECTORS: index }, { database: "main", table: "items", nearest: { key: "embedding", value: [1,...Array(31).fill(0)] } }, async () => true);
const save = (value: Record<string, unknown>) => executeCrud(client, "POST", { ...request, value });
beforeEach(async () => {
 binding = new SqliteBinding();
 schema = structuredClone(manifest);
 schema.tables[0].columns.push({name:"embedding",sqlType:"JSON",nullable:true});
 schema.tables[0].vectorFields = ["embedding"]; schema.tables[0].vectors = [spec];
 // 元fixtureのCHECKだけ除去してmigrationの正確なschema照合も実行。
 binding.db.exec("DROP TABLE items");
 const snapshot = await inspect(async sql => binding.db.prepare(sql).all() as any);
 diff(snapshot,schema,"main").forEach(sql => binding.db.exec(sql));
 client = new D1Client(binding.withSession(),schema,"main"); index = new FakeIndex();
});
afterEach(() => binding.db.close());
test("migration再適用は差分なし・vector定義削除拒否", async () => {
 const snapshot = await inspect(async sql => binding.db.prepare(sql).all() as any);
 expect(diff(snapshot,schema,"main")).toEqual([]);
 const other = structuredClone(schema); other.tables[0].vectors=[];other.tables[0].vectorFields=[];
 expect(() => diff(snapshot,other,"main")).toThrow();
});
test("保存と再試行記録、未取得フィールド保持、null削除", async () => {
 await save({name:"初回",embedding:[1,...Array(31).fill(0)]});
 expect(binding.db.prepare('SELECT COUNT(*) AS n FROM _masamune_vector_jobs').get()!.n).toBe(1);
 await drainVectors(client,{VECTORS:index}); expect(await find()).toHaveLength(1);
 await save({name:"未取得"}); expect(((await find())[0].embedding as any)["@vector"]).toEqual([1,...Array(31).fill(0)]);
 await save({name:"消去",embedding:null}); expect(await find()).toEqual([]);
 await drainVectors(client,{VECTORS:index}); expect(index.values.size).toBe(0);
});
test("障害・再起動・重複回収で復旧", async () => {
 await save({embedding:[1,...Array(31).fill(0)]}); index.fail=true;
 expect((await drainVectors(client,{VECTORS:index},25,1000)).failed).toBe(1);
 index.fail=false; client=new D1Client(binding.withSession(),schema,"main");
 await drainVectors(client,{VECTORS:index},25,3000); await drainVectors(client,{VECTORS:index},25,4000000);
 expect(index.values.size).toBe(1); expect(await find()).toHaveLength(1);
});
test("遅れた旧upsertは現行世代を汚さず定期照合で回収", async () => {
 await save({embedding:[1,...Array(31).fill(0)]});
 index.before=async () => { index.before=undefined; await save({embedding:[0,1,...Array(30).fill(0)]}); await drainVectors(client,{VECTORS:index},25,2000); };
 await drainVectors(client,{VECTORS:index},25,1000);
 expect(index.values.size).toBe(2); expect(await find()).toHaveLength(1);
 await drainVectors(client,{VECTORS:index},25,4000000); expect(index.values.size).toBe(1);
});
test("削除・同一ID再作成・再構築cursorと競合", async () => {
 await save({embedding:[1,...Array(31).fill(0)]}); await drainVectors(client,{VECTORS:index});
 await executeCrud(client,"DELETE",request); expect(await find()).toEqual([]);
 await save({embedding:[0,1,...Array(30).fill(0)]}); expect(await find()).toEqual([]);
 const page=await rebuildVectors(client,"items","",1); expect(page).toEqual({cursor:"a",done:false});
 expect((await rebuildVectors(client,"items",page.cursor,1)).done).toBe(true);
 await drainVectors(client,{VECTORS:index}); expect(await find()).toHaveLength(1); expect(index.values.size).toBe(1);
});
test("batch失敗で本文・世代・jobsすべてrollback", async () => {
 const m=mutation(client,"POST",{...request,value:{embedding:[1,...Array(31).fill(0)]}});
 await expect(client.session.batch([client.session.prepare(m.sql).bind(...m.parameters),client.session.prepare("INSERT INTO missing VALUES (1)")])).rejects.toThrow();
 expect(binding.db.prepare('SELECT COUNT(*) AS n FROM items').get()!.n).toBe(0);
 expect(binding.db.prepare('SELECT COUNT(*) AS n FROM _masamune_vector_jobs').get()!.n).toBe(0);
});
test("認可・条件・環境境界で候補が漏れない", async () => {
 await save({name:"秘密",embedding:[1,...Array(31).fill(0)]}); await drainVectors(client,{VECTORS:index});
 const q={database:"main",table:"items",nearest:{key:"embedding",value:[1,...Array(31).fill(0)]}};
 expect(await searchVectors(client,{VECTORS:index},q,async()=>false)).toEqual([]);
 expect(await searchVectors(client,{VECTORS:index},{...q,where:[{key:"name",value:"違う"}]},async()=>true)).toEqual([]);
 const dev=structuredClone(schema);dev.tables[0].database="dev_main";
 expect(await searchVectors(new D1Client(binding.withSession(),dev,"dev_main"),{VECTORS:index},{...q,database:"dev_main"},async()=>true)).toEqual([]);
});
test("入力検証と管理API拒否", async () => {
 for(const v of [[],[1,0],[NaN,...Array(31).fill(0)],[Infinity,...Array(31).fill(0)],[1e100,...Array(31).fill(0)],Array(32).fill(0)]) expect(()=>vectorValues(v,spec)).toThrow();
 const app=registerD1(new Hono(),{schemaManifest:schema,bindings:{main:"DB"},rules:{version:"1",rules:{database:{"**":{read:"allow",write:"allow"}}}}} as any);
 expect((await app.request('/vector/main/drain',{method:'POST',body:'{}'},{DB:binding,VECTORS:index})).status).toBe(403);
});

test("ModelVectorValueの往復・型不正時は書き込みなし", async () => {
 await save({embedding:{"@type":"ModelVectorValue","@vector":[1,...Array(31).fill(0)],"@measure":"cosine","@source":"user"}});
 const row=(await executeCrud(client,"GET",request) as any[])[0];
 expect(row.embedding["@vector"]).toEqual([1,...Array(31).fill(0)]);
 await expect(save({embedding:{"@vector":[1,...Array(31).fill(0)],"@measure":"euclidean"}})).rejects.toThrow();
 expect(binding.db.prepare("SELECT COUNT(*) AS n FROM _masamune_vector_jobs").get()!.n).toBe(1);
});
test("index定義変更はmigrationで黙って適用しない", async () => {
 const snapshot=await inspect(async sql=>binding.db.prepare(sql).all() as any);
 const changed=structuredClone(schema);changed.tables[0].vectors![0].dimensions=64;
 expect(()=>diff(snapshot,changed,"main")).toThrow();
});
test("WranglerがSQLコメントを除去しても適用後schemaが一致する", async () => {
 binding.db.exec("DROP TRIGGER _masamune_vector_items_embedding_insert; DROP TRIGGER _masamune_vector_items_embedding_update; DROP TRIGGER _masamune_vector_items_embedding_delete; DROP TABLE items; DROP TABLE _masamune_vector_state; DROP TABLE _masamune_vector_jobs");
 const before=await inspect(async sql=>binding.db.prepare(sql).all() as any);
 for(const sql of diff(before,schema,"main")) binding.db.exec(sql.replace(/\/\*[\s\S]*?\*\//g,""));
 expect(diff(await inspect(async sql=>binding.db.prepare(sql).all() as any),schema,"main")).toEqual([]);
});
test("再構築ページ取得後の更新・削除で古い世代を復活させない", async () => {
 await save({embedding:[1,...Array(31).fill(0)]}); await drainVectors(client,{VECTORS:index}); index.values.clear();
 const original=client.session.batch.bind(client.session);
 client.session.batch=async statements => {
   client.session.batch=original;
   await save({embedding:[0,1,...Array(30).fill(0)]});
   return original(statements);
 };
 await rebuildVectors(client,"items"); await drainVectors(client,{VECTORS:index});
 expect(((await find())[0].embedding as any)["@vector"]).toEqual([0,1,...Array(30).fill(0)]);
 client.session.batch=async statements => {client.session.batch=original;await executeCrud(client,"DELETE",request);return original(statements);};
 await rebuildVectors(client,"items"); await drainVectors(client,{VECTORS:index});
 expect(await find()).toEqual([]); expect(index.values.size).toBe(0);
});
test("管理APIのstatus/drain/rebuildはserver tokenでのみ実行できる", async () => {
 await save({embedding:[1,...Array(31).fill(0)]});
 const app=registerD1(new Hono(),{schemaManifest:schema,bindings:{main:"DB"},serverAccessToken:"fixture"});
 for(const operation of ["status","rebuild","drain"]){
   const res=await app.request('/vector/main/'+operation,{method:'POST',headers:{'content-type':'application/json','x-masamune-server-token':'fixture'},body:JSON.stringify({table:'items'})},{DB:binding,VECTORS:index});
   expect(res.status).toBe(200);
 }
 expect(await find()).toHaveLength(1);
});
test("100候補の分割照合と認可中の世代変更", async () => {
 for(let i=0;i<100;i++) await executeCrud(client,"POST",{...request,indexKey:`doc${i}`,value:{name:"対象",embedding:[1,...Array(31).fill(0)]}});
 await drainVectors(client,{VECTORS:index},100);
 const q={database:"main",table:"items",nearest:{key:"embedding",value:[1,...Array(31).fill(0)]},where:[{key:"name",value:"対象"}],limit:100};
 expect(await searchVectors(client,{VECTORS:index},q,async()=>true)).toHaveLength(100);
 const rows=await searchVectors(client,{VECTORS:index},q,async id=>{await executeCrud(client,"POST",{...request,indexKey:id,value:{embedding:[0,1,...Array(30).fill(0)]}});return true;});
 expect(rows).toEqual([]);
});

test("Vectorizeの実API次元範囲をmanifestで検証する", () => {
 for(const dimensions of [1, 3, 31, 1537]) {
  const invalid=structuredClone(schema); invalid.tables[0].vectors![0].dimensions=dimensions;
  expect(()=>new D1Client(binding.withSession(),invalid,"main")).toThrow();
 }
});
