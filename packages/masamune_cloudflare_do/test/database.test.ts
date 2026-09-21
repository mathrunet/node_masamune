import { DatabaseSync } from 'node:sqlite';
import { DurableObjectDatabase } from '../src/lib/database';
import { revision, applyRevisions, verifyRevisions } from '../src/lib/schema';
import { lease } from '../src/lib/lease';
import { registerDurableObject } from '../src/lib/route';
import { Hono } from 'hono';
import type { DoStorage, SchemaManifest, DoConfig, DoIdentity, MigrationSource } from '../src/lib/types';
class Store implements DoStorage {
  setAlarm?: (time:number)=>Promise<void>;
  db=new DatabaseSync(':memory:'); depth=0;
  sql={exec:(sql:string,...args:unknown[])=>{const rows=this.db.prepare(sql).all(...args as any) as Record<string,unknown>[];return {toArray:()=>rows};}};
  transactionSync<T>(callback:()=>T):T { const name='sp'+this.depth++;this.db.exec('SAVEPOINT '+name);try{const r=callback();this.db.exec('RELEASE '+name);return r;}catch(e){this.db.exec('ROLLBACK TO '+name);this.db.exec('RELEASE '+name);throw e;}finally{this.depth--;}}
}
const identity:DoIdentity={environment:'prod',database:'main',userId:'alice'};
const manifest:SchemaManifest={version:'1',dialect:'sqlite',tables:[{database:'main',table:'items',columns:[{name:'id',sqlType:'TEXT',nullable:false},{name:'name',sqlType:'TEXT',nullable:true},{name:'value',sqlType:'INTEGER',nullable:true},{name:'created_at',sqlType:'INTEGER',nullable:true},{name:'updated_at',sqlType:'INTEGER',nullable:true}],primaryKey:['id'],vectorFields:[],indexes:[]}]};
let store:Store,config:DoConfig,object:DurableObjectDatabase;
beforeEach(async()=>{store=new Store();config={schemaManifest:manifest,revisions:[await revision('20260920_initial','main',null,manifest)]};object=new DurableObjectDatabase({storage:store},{},config);});
afterEach(()=>store.db.close());
async function send(method='GET',id?:string,value?:unknown,extra:any={}){return object.fetch(new Request('https://test',{method:'POST',body:JSON.stringify({identity,operations:[{method,request:{database:'main',table:'items',indexKey:id,value,...extra}}]})}));}
async function rows(){const r=await send();expect(r.status).toBe(200);return (await r.json() as any).data[0];}
async function admin(operation='status'){return object.fetch(new Request('https://test',{method:'POST',body:JSON.stringify({identity,admin:operation})}));}
test('CRUD・query・JSON精度・部分更新',async()=>{expect((await send('POST','a',{name:'日本語',value:1})).status).toBe(200);expect((await send('PUT','a',{value:2})).status).toBe(200);expect(await rows()).toMatchObject([{name:'日本語',value:2}]);expect((await send('POST','b',{value:Number.MAX_SAFE_INTEGER+1})).status).toBe(400);expect((await send('DELETE','a')).status).toBe(200);expect(await rows()).toEqual([]);});
test('batch途中失敗は本文と変更記録をrollback',async()=>{const r=await object.fetch(new Request('https://test',{method:'POST',body:JSON.stringify({identity,operations:[{method:'POST',request:{database:'main',table:'items',indexKey:'a',value:{value:1}}},{method:'POST',request:{database:'main',table:'items',indexKey:'b',value:{value:'不正'}}}]})}));expect(r.status).toBe(400);expect(await rows()).toEqual([]);expect(store.db.prepare('SELECT * FROM _masamune_touched').all()).toEqual([]);});
test('別ユーザー・別DBの内部要求を拒否',async()=>{await rows();for(const i of [{...identity,userId:'bob'},{...identity,database:'other'}]){expect((await object.fetch(new Request('https://test',{method:'POST',body:JSON.stringify({identity:i,admin:'status'})}))).status).toBe(403);}});
test('休眠・新規DOが承認済みのnullable列を適用し、古い配備を拒否',async()=>{await send('POST','a',{name:'保持'});const next=structuredClone(manifest);next.tables[0].columns.push({name:'added',sqlType:'TEXT',nullable:true});const r=await revision('20260921_add','main',manifest,next);const cfg={schemaManifest:next,revisions:[...config.revisions,r]};object=new DurableObjectDatabase({storage:store},{},cfg);expect(await rows()).toMatchObject([{name:'保持',added:null}]);const fresh=new Store();applyRevisions(fresh,cfg.revisions,next,'main');fresh.db.close();object=new DurableObjectDatabase({storage:store},{},config);expect((await send()).status).toBe(409);});
test('migration改ざん・破壊DDL・実schemaドリフトを拒否',async()=>{const bad=structuredClone(config.revisions);bad[0].sql.push('DROP TABLE items');await expect(verifyRevisions(bad)).rejects.toThrow();const next=structuredClone(manifest);next.tables[0].columns.pop();await expect(revision('20260921_bad','main',manifest,next)).rejects.toThrow();await rows();store.db.exec('ALTER TABLE items ADD COLUMN rogue TEXT');object=new DurableObjectDatabase({storage:store},{},config);expect((await send()).status).toBe(409);});
test('同時初回アクセスと再起動後もデータ・適用履歴を保持',async()=>{const result=await Promise.all(Array.from({length:10},(_,i)=>send('POST',String(i),{value:i})));expect(result.every(r=>r.ok)).toBe(true);object=new DurableObjectDatabase({storage:store},{},config);expect(await rows()).toHaveLength(10);expect(store.db.prepare('SELECT * FROM _masamune_schema').all()).toHaveLength(1);});
test('leaseの競合・期限・fencing・完了後再取得を拒否',()=>{const a=lease(store,{action:'acquire',key:'job',owner:'a',ttlMs:100},0) as any;expect(()=>lease(store,{action:'acquire',key:'job',owner:'b'},1)).toThrow();const b=lease(store,{action:'acquire',key:'job',owner:'b',ttlMs:100},101) as any;expect(b.generation).toBe(a.generation+1);for(const action of ['renew','release','complete'] as const)expect(()=>lease(store,{action,key:'job',owner:'a',generation:a.generation},102)).toThrow();lease(store,{action:'renew',key:'job',owner:'b',generation:b.generation,ttlMs:100},102);lease(store,{action:'complete',key:'job',owner:'b',generation:b.generation},103);expect(()=>lease(store,{action:'acquire',key:'job',owner:'c'},300)).toThrow();});
function source():MigrationSource {const old=Array.from({length:220},(_,i)=>({id:String(i).padStart(3,'0'),name:'元データ',value:i,created_at:1,updated_at:2}));return {seal:async()=> 'epoch',page:async(_,after,limit)=>old.filter(r=>r.id>after).slice(0,limit),document:async(_,id)=>old.find(r=>r.id===id)};}
test('移行中の更新・削除・再作成・再起動・cursor再開を保持',async()=>{config.source=()=>source();await admin('migrate');await send('PUT','150',{name:'変更'});await send('DELETE','151');await send('DELETE','152');await send('POST','152',{name:'再作成'});object=new DurableObjectDatabase({storage:store},{},config);await admin('migrate');await admin('migrate');const result=await rows();expect(result).toHaveLength(219);expect(result.find((r:any)=>r.id==='150')).toMatchObject({name:'変更',value:150,created_at:1});expect(result.some((r:any)=>r.id==='151')).toBe(false);expect(result.find((r:any)=>r.id==='152').name).toBe('再作成');});
test('フォールバック読みに削除済み文書を復活させない',async()=>{config.source=()=>source();await send('DELETE','150');const r=await send('GET','150');expect((await r.json() as any).data[0]).toEqual([]);});
test('移行元通信断はcursorを進めず、再開できる',async()=>{const original=source();let fail=true;config.source=()=>({...original,page:async(...args)=>{if(fail)throw new Error('模擬通信断');return original.page(...args);}});expect((await admin('migrate')).status).toBe(500);expect(store.db.prepare('SELECT cursor FROM _masamune_import').get()!.cursor).toBe('');fail=false;expect((await admin('migrate')).status).toBe(200);});
test('並行コピーの途中で削除しても遅着したページが復活させない',async()=>{const original=source();let resume!:()=>void;const gate=new Promise<void>(r=>resume=r);let started!:()=>void;const ready=new Promise<void>(r=>started=r);config.source=()=>({...original,page:async(...args)=>{started();await gate;return original.page(...args);}});const copying=admin('migrate');await ready;await send('DELETE','001');resume();await copying;expect((await send('GET','001').then(r=>r.json()) as any).data[0]).toEqual([]);});
test('HTTPは認証uidをnamespaceに使い、未認証・空rules・他DBを拒否',async()=>{const ids:string[]=[];const ns={idFromName:(s:string)=>{ids.push(s);return s;},get:()=>({fetch:(r:Request)=>object.fetch(r)})};const app=new Hono<any>();app.use('*',async(c,next)=>{if(c.req.header('test-uid'))c.set('authentication',{uid:c.req.header('test-uid')});await next();});registerDurableObject(app,{binding:'DO',databases:['main'],rules:{version:'1',rules:{database:{'**':{read:'authenticated',write:'authenticated'}}}}});const call=(path:string,uid?:string)=>app.request(path,{headers:uid?{'test-uid':uid}:{}},{DO:ns,FLAVOR:'prod'});expect((await call('/database/main/items')).status).toBe(401);expect((await call('/database/other/items','alice')).status).toBe(400);expect((await call('/database/main/items?userId=bob','alice')).status).toBe(200);expect(JSON.parse(ids[0])).toEqual(['prod','main','alice']);expect((await call('/database/main/items?prefix=other','alice')).status).toBe(400);const denied=registerDurableObject(new Hono<any>().use('*',async(c,n)=>{c.set('authentication',{uid:'alice'});await n();}),{binding:'DO',databases:['main']});expect((await denied.request('/database/main/items',{}, {DO:ns})).status).toBe(403);});
test('MiniflareのDO内部tableはユーザーschemaとして扱わない',async()=>{store.db.exec('CREATE TABLE __miniflare_do_name (name TEXT)');expect((await send('POST','a',{name:'検証'})).status).toBe(200);expect(await rows()).toHaveLength(1);});
test('正式FunctionsAdapterのbodyなしDELETEを受け付ける',async()=>{const app=new Hono<any>();app.use('*',async(c,n)=>{c.set('authentication',{uid:'alice'});await n();});registerDurableObject(app,{binding:'DO',databases:['main'],rules:{version:'1',rules:{database:{'**':{read:'authenticated',write:'authenticated'}}}}});const env={DO:{idFromName:()=>'',get:()=>({fetch:(r:Request)=>object.fetch(r)})}};await send('POST','a',{name:'削除対象'});expect((await app.request('/database/main/items/a',{method:'DELETE'},env)).status).toBe(200);expect(await rows()).toEqual([]);});
test('移行cursorはSQLiteのUTF-8 BINARY順序に一致する',async()=>{config.source=()=>({seal:async()=> 'epoch',page:async()=>[{id:'\ue000',name:'BMP',value:1},{id:'😀',name:'補助平面',value:2}],document:async()=>undefined});expect((await admin('migrate')).status).toBe(200);expect(await rows()).toHaveLength(2);});

// 同期は常に認可付きsnapshotを使い、通知に文書を含めない。
async function snapshot(ticket=false, extra:any={}) {
  return object.fetch(new Request('https://test',{method:'POST',body:JSON.stringify({identity,sync:{request:{database:'main',table:'items',...extra},ticket,expires:Date.now()+30000}})}));
}
test('snapshotの連番はcommitだけで進み、削除とquery集合を再同期できる',async()=>{
  await send('POST','a',{value:2});await send('POST','b',{value:1});
  const a=await snapshot(false,{orderBy:[{key:'value'}],limit:1}).then(r=>r.json()) as any;
  expect(a.sequence).toBe(2);expect(a.data.map((r:any)=>r.id)).toEqual(['b']);
  await send('DELETE','b');const b=await snapshot(false,{orderBy:[{key:'value'}],limit:1}).then(r=>r.json()) as any;
  expect(b.sequence).toBe(3);expect(b.data.map((r:any)=>r.id)).toEqual(['a']);
  await send('POST','bad',{value:'wrong'});expect((await snapshot().then(r=>r.json()) as any).sequence).toBe(3);
});
test('ticketはUID・環境・DBに束縛され一回限りで期限切れを拒否',async()=>{
  const a=await snapshot(true).then(r=>r.json()) as any;
  expect(()=>object.sync.consume(a.ticket,{...identity,userId:'bob'})).toThrow();
  expect(object.sync.consume(a.ticket,identity).table).toBe('items');
  expect(()=>object.sync.consume(a.ticket,identity)).toThrow();
  const b=await snapshot(true).then(r=>r.json()) as any;
  expect(()=>object.sync.consume(b.ticket,identity,b.expires)).toThrow();
});
test('Hibernation再構築でattachmentと永続連番を復元しデータなし通知を送る',async()=>{
  const sockets:any[]=[];let alarm=0;store.setAlarm=async n=>{alarm=n;};
  const ctx={storage:store,getWebSockets:()=>sockets,acceptWebSocket:(s:any)=>sockets.push(s)};
  object=new DurableObjectDatabase(ctx,{},config);
  await send('POST','a',{name:'秘密'});const ticket=await snapshot(true).then(r=>r.json()) as any;
  let attachment:any;const sent:any[]=[];const closed:number[]=[];
  const socket={serializeAttachment:(v:any)=>{attachment=v;},deserializeAttachment:()=>attachment,send:(s:string)=>sent.push(JSON.parse(s)),close:(code:number)=>closed.push(code)};
  await object.sync.accept(socket,object.sync.consume(ticket.ticket,identity));
  const boot=object.sync.bootId;object=new DurableObjectDatabase(ctx,{},config);
  await object.webSocketMessage(socket,'resync');
  expect(sent.at(-1).bootId).not.toBe(boot);expect(sent.at(-1).sequence).toBe(1);expect(JSON.stringify(sent)).not.toContain('秘密');expect(alarm).toBeGreaterThan(Date.now());
  await send('DELETE','a');expect(sent.at(-1).sequence).toBe(2);
  attachment.expires=Date.now()-1;await object.alarm();expect(closed).toContain(4001);
});
test('HTTP snapshotは認可変更を毎回再評価し、別ユーザーheaderを拒否',async()=>{
  const rules:any={version:'1',rules:{database:{'**':{read:'authenticated',write:'authenticated'}}}};
  const app=new Hono<any>();app.use('*',async(c,n)=>{c.set('authentication',{uid:'alice'});await n();});registerDurableObject(app,{binding:'DO',databases:['main'],rules});
  const env={DO:{idFromName:()=>'',get:()=>({fetch:(r:Request)=>object.fetch(r)})}};
  const call=(headers={})=>app.request('/sync/main',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({table:'items',ticket:true})},env);
  expect((await call()).status).toBe(200);expect((await call({'X-Masamune-User-Id':'bob'})).status).toBe(403);
  rules.rules.database={};expect((await call()).status).toBe(403);
});
test('whereへの出入りとlimit境界をsnapshotで追跡',async()=>{
  const query={where:[{type:'greaterThan',key:'value',value:0}],orderBy:[{key:'value'}],limit:1};
  await send('POST','a',{value:-1});await send('POST','b',{value:2});
  expect((await snapshot(false,query).then(r=>r.json()) as any).data.map((r:any)=>r.id)).toEqual(['b']);
  await send('PUT','a',{value:1});expect((await snapshot(false,query).then(r=>r.json()) as any).data.map((r:any)=>r.id)).toEqual(['a']);
  await send('PUT','a',{value:0});expect((await snapshot(false,query).then(r=>r.json()) as any).data.map((r:any)=>r.id)).toEqual(['b']);
});
test('ticket数・接続数・snapshotサイズの上限を拒否し、期限切れticketを回収',async()=>{
  for(let i=0;i<64;i++) expect((await snapshot(true)).status).toBe(200);
  expect((await snapshot(true)).status).toBe(429);
  store.db.exec('UPDATE _masamune_tickets SET expires=0');expect((await snapshot(true)).status).toBe(200);
  expect(store.db.prepare('SELECT count(*) n FROM _masamune_tickets').get()!.n).toBe(1);
  const ctx={storage:store,getWebSockets:()=>Array.from({length:32},()=>({send:()=>{},close:()=>{},serializeAttachment:()=>{},deserializeAttachment:()=>({})}))};
  object=new DurableObjectDatabase(ctx,{},config);const t=await snapshot(true).then(r=>r.json()) as any;
  expect(()=>object.sync.consume(t.ticket,identity)).toThrow('接続数');
  expect((await send('POST','large',{name:'x'.repeat(1048576)})).status).toBe(200);
  expect((await snapshot()).status).toBe(413);
});
test('snapshot取得と接続の間のcommitを接続時の連番で検知',async()=>{
  const socketList:any[]=[];store.setAlarm=async()=>{};
  object=new DurableObjectDatabase({storage:store,getWebSockets:()=>socketList,acceptWebSocket:s=>socketList.push(s)},{},config);
  const t=await snapshot(true).then(r=>r.json()) as any;
  await send('POST','a',{value:1});let attachment:any;const sent:any[]=[];
  const socket={send:(s:string)=>sent.push(JSON.parse(s)),close:()=>{},serializeAttachment:(a:any)=>{attachment=a;},deserializeAttachment:()=>attachment};
  await object.sync.accept(socket,object.sync.consume(t.ticket,identity));expect(sent[0].sequence).toBeGreaterThan(t.sequence);
});
