import { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { DurableObjectDatabase } from '../src/lib/database';
import { SharedHub, databaseName, hubName, initializeHubOutbox, enqueueHubs, drainHubs } from '../src/lib/shared';
import { registerDurableObject, registerDurableObjectSockets } from '../src/lib/route';
import { revision } from '../src/lib/schema';
import type { DoStorage, DoConfig, DoIdentity, DurableObjectWorkersOptions } from '../src/lib/types';
class Store implements DoStorage {
  db=new DatabaseSync(':memory:');
  alarmAt=0;
  async setAlarm(time:number){this.alarmAt=time;}
  sql={exec:(sql:string,...args:unknown[])=>({toArray:()=>this.db.prepare(sql).all(...args as any) as Record<string,unknown>[]})};
  // 実DOと同じくexec時に実行し、カーソルの読出しは副作用を持たせない。
  constructor(){this.sql={exec:(sql:string,...args:unknown[])=>{const rows=this.db.prepare(sql).all(...args as any) as Record<string,unknown>[];return {toArray:()=>rows};}};}
  transactionSync<T>(f:()=>T):T {this.db.exec('SAVEPOINT sp');try{const r=f();this.db.exec('RELEASE sp');return r;}catch(e){this.db.exec('ROLLBACK TO sp; RELEASE sp');throw e;}}
}
class Socket {
  attachment:any; messages:any[]=[]; closed=false;
  serializeAttachment(v:any){this.attachment=v;} deserializeAttachment(){return this.attachment;}
  send(s:string){this.messages.push(JSON.parse(s));} close(){this.closed=true;}
}
const identity:DoIdentity={environment:'prod',database:'main',userId:'@shared',topic:'room'};
const shared={binding:'HUB',shards:4,generation:'v1'};
const schema:any={version:'1',dialect:'sqlite',tables:[{database:'main',table:'items',columns:[{name:'id',sqlType:'TEXT',nullable:false},{name:'value',sqlType:'INTEGER',nullable:true},{name:'created_at',sqlType:'INTEGER',nullable:true},{name:'updated_at',sqlType:'INTEGER',nullable:true}],primaryKey:['id'],vectorFields:[]}]};
let stores:Store[], config:DoConfig, env:any, app:Hono<any>, options:DurableObjectWorkersOptions;
let databases:Map<string,DurableObjectDatabase>, hubs:Map<string,{hub:SharedHub;store:Store;sockets:Socket[]}>;
let fail=false;
function store(){const s=new Store();stores.push(s);return s;}
const req=(body:any)=>new Request('https://internal',{method:'POST',body:JSON.stringify(body)});
beforeEach(async()=>{
  stores=[];databases=new Map();hubs=new Map();fail=false;
  config={schemaManifest:schema,revisions:[await revision('20260921_initial','main',null,schema)],shared};
  env={FLAVOR:'prod',HUB:{idFromName:(n:string)=>n,get:(n:string)=>({fetch:async(r:Request)=>{
    if(fail) return new Response('',{status:503});
    if(!hubs.has(n)){const s=store(),sockets:Socket[]=[];hubs.set(n,{store:s,sockets,hub:new SharedHub({storage:s,getWebSockets:()=>sockets.filter(s=>!s.closed),acceptWebSocket:s=>sockets.push(s as Socket)})});}
    return hubs.get(n)!.hub.fetch(r);
  }})},DO:{idFromName:(n:string)=>n,get:(n:string)=>({fetch:(r:Request)=>{
    if(!databases.has(n))databases.set(n,new DurableObjectDatabase({storage:store()},env,config));
    return databases.get(n)!.fetch(r);
  }})}};
  options={binding:'DO',databases:['main'],shared:{...shared,authorize:(c,s)=>c.get('authentication')?.uid!=='outsider'&&s.topic!=='forbidden'},rules:{version:'1',rules:{database:{'**':{read:'authenticated',write:'authenticated'}}}}};
  app=new Hono<any>();app.use('*',async(c,n)=>{const uid=c.req.header('test-uid');if(uid)c.set('authentication',{uid});await n();});registerDurableObject(app,options);
});
afterEach(()=>stores.forEach(s=>s.db.close()));
function call(path='/database/main/items',method='GET',body?:unknown,uid='alice',topic:string|undefined='room') {return app.request(path,{method,headers:{'test-uid':uid,...(topic===undefined?{}:{'X-Masamune-Topic':topic})},...(body===undefined?{}:{body:JSON.stringify(body)})},env);}
async function write(value=1){const r=await call('/database/main/items/a','POST',{value:{value}});expect(r.status).toBe(200);return r;}
async function ticket(uid='alice'){const r=await call('/sync/main','POST',{table:'items',ticket:true},uid);expect(r.status).toBe(200);return r.json() as Promise<any>;}
test('共有参加者は同じデータを読み、個人・別topicは隔離される',async()=>{
  await write();expect(await (await call(undefined,undefined,undefined,'bob')).json()).toMatchObject({data:[{id:'a',value:1}]});
  expect(await (await call(undefined,undefined,undefined,'alice','other')).json()).toEqual({data:[]});
  expect(await (await call(undefined,undefined,undefined,'alice',undefined)).json()).toMatchObject({data:[{id:'a'}]}); // default引数は共有room
  const personal=await app.request('/database/main/items',{headers:{'test-uid':'alice'}},env);expect(await personal.json()).toEqual({data:[]});
  expect(databaseName(identity)).not.toBe(databaseName({...identity,topic:undefined}));
});
test('未認証・共有無効・参加権なし・rules拒否・他環境を拒否',async()=>{
  for(const uid of ['', 'outsider'])expect((await call(undefined,undefined,undefined,uid)).status).toBe(uid?403:401);
  expect((await call(undefined,undefined,undefined,'alice','forbidden')).status).toBe(403);
  options.shared=undefined;expect((await call()).status).toBe(403);
  options.shared={...shared,authorize:()=>true};options.rules=undefined;expect((await call()).status).toBe(403);
});
test('全シャードへ配信、ticketを購読者・topic・tableへ束縛し再使用を拒否',async()=>{
  await write();expect(hubs.size).toBe(4);
  const t=await ticket();const h=hubs.get(hubName(identity,t.hub.generation,t.hub.shard))!;
  expect(()=>h.hub.sync.consume(t.ticket,{...identity,userId:'bob'})).toThrow();
  expect(()=>h.hub.sync.consume(t.ticket,{...identity,userId:'alice',topic:'other'})).toThrow();
  const attachment=h.hub.sync.consume(t.ticket,{...identity,userId:'alice'});expect(attachment.table).toBe('items');
  expect(()=>h.hub.sync.consume(t.ticket,{...identity,userId:'alice'})).toThrow();
  const socket=new Socket();await h.hub.sync.accept(socket,attachment);await write(2);expect(socket.messages.length).toBe(2);expect(socket.messages[1].data).toBeUndefined();
});
test('snapshot→接続間の更新は接続直後のinvalidateで再取得できる',async()=>{
  const t=await ticket();await write();const h=hubs.get(hubName(identity,t.hub.generation,t.hub.shard))!;
  const socket=new Socket();await h.hub.sync.accept(socket,h.hub.sync.consume(t.ticket,{...identity,userId:'alice'}));expect(socket.messages).toHaveLength(1);
  expect(await (await call('/sync/main','POST',{table:'items'})).json()).toMatchObject({data:[{value:1}]});
});
test('hub停止でもcommit成功、再起動後alarmで永続outboxを排出',async()=>{
  fail=true;await write();const s=stores[0];expect(s.db.prepare('SELECT * FROM _masamune_hub_outbox').all()).toHaveLength(4);expect(s.alarmAt).toBeGreaterThan(0);
  fail=false;s.db.exec('UPDATE _masamune_hub_outbox SET next_attempt=0');const db=new DurableObjectDatabase({storage:s},env,config);await db.alarm();expect(s.db.prepare('SELECT * FROM _masamune_hub_outbox').all()).toHaveLength(0);expect(hubs.size).toBe(4);
});
test('batch失敗時はデータ・連番・outboxをまとめてrollback',async()=>{
  fail=true;const r=await call('/batch/main','POST',{operations:[{method:'POST',table:'items',indexKey:'a',value:{value:1}},{method:'POST',table:'items',indexKey:'b',value:{value:'invalid'}}]});expect(r.status).toBe(400);
  expect(stores[0].db.prepare('SELECT * FROM items').all()).toEqual([]);expect(stores[0].db.prepare('SELECT * FROM _masamune_hub_outbox').all()).toEqual([]);expect(stores[0].db.prepare('SELECT sequence FROM _masamune_sync').get()!.sequence).toBe(0);
});
test('重複・逆順通知はtable単位で抑止し、別tableの遅着は失わない',async()=>{
  await write();const h=[...hubs.values()][0];const post=(table:string,sequence:number)=>h.hub.fetch(req({identity,generation:'v1',shard:0,action:'invalidate',table,sequence}));
  expect((await post('items',4)).ok).toBe(true);expect((await post('items',2)).ok).toBe(true);expect((await post('items',4)).ok).toBe(true);expect((await post('other',3)).ok).toBe(true);
  expect(h.hub.sync.sequence).toBe(3);
});
test('通知送信中の新しいcommitをackで消さない',async()=>{
  const s=store();initializeHubOutbox(s);enqueueHubs(s,{...shared,shards:1},identity,'items',1);
  const fake={HUB:{idFromName:(n:string)=>n,get:()=>({fetch:async()=>{enqueueHubs(s,{...shared,shards:1},identity,'items',2);return Response.json({ok:true});}})}};
  await drainHubs(s,fake);expect(s.db.prepare('SELECT sequence FROM _masamune_hub_outbox').get()!.sequence).toBe(2);
});
test('世代変更後もデータDOのキーを保持し、旧世代outboxと新世代を区別',async()=>{
  fail=true;await write();const s=stores[0];config={...config,shared:{...shared,generation:'v2',shards:2}};databases.set(databaseName(identity),new DurableObjectDatabase({storage:s},env,config));await write(2);
  expect(s.db.prepare('SELECT * FROM _masamune_hub_outbox').all()).toHaveLength(6);
  fail=false;s.db.exec('UPDATE _masamune_hub_outbox SET next_attempt=0');await databases.get(databaseName(identity))!.alarm();expect(hubs.size).toBe(6);
});
test('hubを再構築しても接続・連番を維持、期限切れは終了',async()=>{
  const t=await ticket();const h=hubs.get(hubName(identity,t.hub.generation,t.hub.shard))!;const socket=new Socket();await h.hub.sync.accept(socket,h.hub.sync.consume(t.ticket,{...identity,userId:'alice'}));
  const before=socket.messages[0].bootId;h.hub=new SharedHub({storage:h.store,getWebSockets:()=>h.sockets,acceptWebSocket:s=>h.sockets.push(s as Socket)});h.hub.webSocketMessage(socket,'resync');expect(socket.messages[1].bootId).not.toBe(before);
  socket.attachment.expires=0;await h.hub.alarm();expect(socket.closed).toBe(true);
});
test('未設定の世代・範囲外シャード・他topicのupgradeを拒否',async()=>{
  const sockets=registerDurableObjectSockets(new Hono<any>(),options);
  for(const path of ['/shared/main/room/alice/v2/0','/shared/main/room/alice/v1/4','/shared/main/room/alice/v1/-1'])expect((await sockets.request(path+'?ticket='+crypto.randomUUID(),{headers:{Upgrade:'websocket'}},env)).status).toBe(400);
});
test('共有hubは接続上限と未使用ticket上限を独立に検査する',async()=>{
  const t=await ticket();const h=hubs.get(hubName(identity,t.hub.generation,t.hub.shard))!;
  for(let i=0;i<2048;i++){const s=new Socket();s.attachment={expires:Date.now()+10000};h.sockets.push(s);}
  expect(()=>h.hub.sync.consume(t.ticket,{...identity,userId:'alice'})).toThrow('接続数');
  h.sockets.length=0;
  h.store.db.exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<4095) INSERT INTO _masamune_tickets SELECT 'fake-'||x, '{}', 'items', ${Date.now()+100000} FROM n`);
  expect(()=>h.hub.sync.ticket({...identity,userId:'bob'},'items',Date.now()+10000)).toThrow('未使用ticket');
});
test('期限切れticketを拒否し、共有authorizeはbatchの各操作を検証する',async()=>{
  const t=await ticket();const h=hubs.get(hubName(identity,t.hub.generation,t.hub.shard))!;
  expect(()=>h.hub.sync.consume(t.ticket,{...identity,userId:'alice'},Date.now()+31000)).toThrow();
  options.shared!.authorize=(_,s)=>s.method==='GET';
  expect((await call('/batch/main','POST',{operations:[{method:'POST',table:'items',indexKey:'a',value:{value:1}}]})).status).toBe(403);
});
