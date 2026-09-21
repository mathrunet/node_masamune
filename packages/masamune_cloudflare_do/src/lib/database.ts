import { initializeHubOutbox, enqueueHubs, drainHubs, nextHubAlarm, validateShared } from './shared';
import { DurableObjectSync, SyncContext, SyncSocket } from './sync';
import { DoClient, quote, decode, encode } from './client';
import { executeCrud } from './crud';
import { applyRevisions, verifyRevisions, canonical } from './schema';
import { HttpError } from './http_error';
import { drainVectors, initializeVectors, nextVectorAlarm, rebuildVectors, searchVectors } from './vector';
import type { DoStorage, DoConfig, DoIdentity, CrudRequest, DoCrudMethod, MigrationSource } from './types';
export interface DatabaseOperation { method: DoCrudMethod; request: CrudRequest }
interface Envelope { identity: DoIdentity; operations?: DatabaseOperation[]; admin?: 'status'|'migrate'|'vector-status'|'vector-drain'|'vector-rebuild'; adminRequest?: {table?: string; cursor?: string; limit?: number}; sync?: {request: CrudRequest; ticket?: boolean; expires?: number} }
/** 公開HTTPはWorkerが認可する。このfetchは同じWorkerのbindingからのみ呼ぶ。 */
export class DurableObjectDatabase {
  private ready?: Promise<void>;
  private identity?: DoIdentity;
  private client?: DoClient;
  readonly sync: DurableObjectSync;
  private readonly env: Record<string, unknown>;
  constructor(private readonly ctx: SyncContext, env: unknown, private readonly config: DoConfig) { this.sync = new DurableObjectSync(ctx); this.env = (env ?? {}) as Record<string, unknown>; }
  private get storage() { return this.ctx.storage; }
  private rows(sql:string,...args:unknown[]) { return this.storage.sql.exec(sql,...args).toArray(); }
  private async initialize(identity:DoIdentity) {
    if(!identity || !['dev','prod'].includes(identity.environment) || typeof identity.userId !== 'string' || !identity.userId || typeof identity.database !== 'string') throw new HttpError(400,'DO識別子が不正です。');
    if(this.identity && canonical(this.identity)!==canonical(identity)) throw new HttpError(403,'異なるユーザー・DBへは接続できません。');
    if(!this.ready) {
      if(identity.topic !== undefined) {
        if(!this.config.shared || identity.userId!=='@shared' || !/^[A-Za-z0-9_-]{1,128}$/.test(identity.topic)) throw new HttpError(403,'共有DB設定がありません。');
        validateShared(this.config.shared);
        if(this.config.source) throw new HttpError(400,'共有DBの移行元は未対応です。');
      }
      this.identity=identity;
      this.ready=(async()=>{
        await verifyRevisions(this.config.revisions);
        this.storage.transactionSync(()=>{
          this.rows('CREATE TABLE IF NOT EXISTS _masamune_identity (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
          const old=this.rows('SELECT value FROM _masamune_identity WHERE id=1')[0];
          if(old && old.value!==canonical(identity)) throw new HttpError(403,'永続DO識別子が一致しません。');
          this.rows('INSERT OR IGNORE INTO _masamune_identity VALUES (1,?)',canonical(identity));
          applyRevisions(this.storage,this.config.revisions,this.config.schemaManifest,identity.database);
          initializeVectors(this.storage,this.config.schemaManifest,identity.database);
          this.sync.initialize();
          initializeHubOutbox(this.storage);
          this.rows('CREATE TABLE IF NOT EXISTS _masamune_touched (table_name TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(table_name,id))');
          this.rows('CREATE TABLE IF NOT EXISTS _masamune_import (id INTEGER PRIMARY KEY CHECK(id=1),epoch TEXT NOT NULL,table_index INTEGER NOT NULL,cursor TEXT NOT NULL,complete INTEGER NOT NULL)');
        });
        this.client=new DoClient(this.storage,this.config.schemaManifest,identity.database);
      })();
    }
    await this.ready;
  }
  private async source():Promise<MigrationSource|undefined> {
    const source=this.config.source?.(this.identity!);
    if(!source) {
      if(this.rows('SELECT * FROM _masamune_import WHERE complete=0').length) throw new HttpError(503,'移行元接続がありません。');
      return undefined;
    }
    if(!this.rows('SELECT * FROM _masamune_import').length) {
      const epoch=await source.seal();
      if(!epoch) throw new HttpError(409,'移行元の書込み遮断を確認できません。');
      this.rows('INSERT OR IGNORE INTO _masamune_import VALUES (1,?,0,?,0)',epoch,'');
    }
    return source;
  }
  private state() { return this.rows('SELECT * FROM _masamune_import WHERE id=1')[0]; }
  private importRow(table:string,row:Record<string,unknown>) {
    const schema=this.client!.table(this.identity!.database,table);
    if(typeof row.id !== 'string' || !row.id || row.id.includes('/')) throw new HttpError(409,'移行元のidが不正です。');
    if(Object.keys(row).some(k=>!schema.columns.some(c=>c.name===k))) throw new HttpError(409,'移行元に未定義のカラムがあります。');
    if(this.rows('SELECT id FROM _masamune_touched WHERE table_name=? AND id=?',table,row.id).length) return;
    // 元DBの格納型を一度復元して検証し、日時を含めて保持する。
    const value=decode(row,schema);
    this.rows(`INSERT INTO ${quote(table)} (${schema.columns.map(c=>quote(c.name)).join(',')}) VALUES (${schema.columns.map(()=>'?').join(',')}) ON CONFLICT(id) DO NOTHING`,...schema.columns.map(c=>encode(value[c.name],c)));
  }
  private async page(source:MigrationSource,limit=100) {
    const state=this.state(); if(!state || state.complete) return;
    const tables=this.config.schemaManifest.tables.filter(t=>t.database===this.identity!.database);
    const table=tables[Number(state.table_index)];
    const rows=await source.page(table.table,String(state.cursor),limit,String(state.epoch));
    if(rows.length>limit || rows.some((r,i)=>typeof r.id!=='string' || compareIds(r.id,String(i?rows[i-1].id:state.cursor))<=0)) throw new HttpError(409,'移行ページの順序が不正です。');
    this.storage.transactionSync(()=>{
      const current=this.state();
      if(canonical(current)!==canonical(state)) return;
      for(const row of rows) this.importRow(table.table,row);
      const next=rows.length<limit?Number(state.table_index)+1:Number(state.table_index);
      this.rows('UPDATE _masamune_import SET table_index=?,cursor=?,complete=? WHERE id=1',next,rows.length<limit?'':String(rows.at(-1)!.id),Number(next===tables.length));
    });
  }
  private async hydrate(source:MigrationSource,request:CrudRequest) {
    if(!request.indexKey || this.state()?.complete || this.rows('SELECT id FROM _masamune_touched WHERE table_name=? AND id=?',request.table,request.indexKey).length) return;
    const row=await source.document(request.table,request.indexKey,String(this.state().epoch));
    if(row) {
      if(row.id!==request.indexKey) throw new HttpError(409,'移行元idが一致しません。');
      this.storage.transactionSync(()=>this.importRow(request.table,row));
    }
  }
  async fetch(request:Request):Promise<Response> {
    try {
      if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        const url = new URL(request.url);
        const identity = JSON.parse(request.headers.get('X-Do-Identity') ?? 'null') as DoIdentity;
        // 無効なupgradeで空DOにschemaを作らない。
        if (!this.rows("SELECT name FROM sqlite_master WHERE name='_masamune_identity'").length) throw new HttpError(401, 'ticketが無効です。');
        await this.initialize(identity);
        const attachment = this.sync.consume(url.searchParams.get('ticket') ?? '', identity);
        const Pair = (globalThis as any).WebSocketPair;
        if (!Pair) throw new HttpError(503, 'WebSocket runtimeが必要です。');
        const pair = new Pair();
        await this.sync.accept(pair[1], attachment);
        return new Response(null, {status:101, webSocket:pair[0]} as ResponseInit);
      }
      const payload=await request.json() as Envelope;
      await this.initialize(payload.identity);
      if(payload.admin==='status') return Response.json({data:{schema:this.rows('SELECT version,hash FROM _masamune_schema ORDER BY rowid'),migration:this.state()??null}});
      if(payload.admin==='vector-status') return Response.json({data:this.rows('SELECT status,COUNT(*) AS count,MIN(next_attempt) AS next_attempt FROM _masamune_vector_jobs GROUP BY status')});
      if(payload.admin==='vector-drain') { const data=await drainVectors(this.client!,this.identity!,this.env,payload.adminRequest?.limit); await this.scheduleAlarm(); return Response.json({data}); }
      if(payload.admin==='vector-rebuild') { if(typeof payload.adminRequest?.table!=='string') throw new HttpError(400,'再構築tableが必要です。'); const data=await rebuildVectors(this.client!,this.identity!,payload.adminRequest.table,payload.adminRequest.cursor,payload.adminRequest.limit); await this.scheduleAlarm(); return Response.json({data}); }
      const source=await this.source();
      if(payload.admin==='migrate') { if(source) await this.page(source); return Response.json({data:this.state()??{complete:1}}); }
      if (payload.sync) {
        const {request: query, ticket, expires} = payload.sync;
        if (query.database !== this.identity!.database || query.count || query.nearest) throw new HttpError(400, '同期queryが不正です。');
        if (source) { await this.page(source); if (!this.state()?.complete) throw new HttpError(503, '移行中は購読できません。'); }
        const result = this.storage.transactionSync(() => {
          const data = executeCrud(this.client!, 'GET', query, this.config.maxScanRows);
          if (new TextEncoder().encode(JSON.stringify(data)).length > 1048576) throw new HttpError(413, 'snapshot上限は1MiBです。');
          return {data, sequence:this.sync.sequence, bootId:this.sync.bootId, ...(ticket ? this.sync.ticket(this.identity!, query.table, expires ?? 0) : {})};
        });
        return Response.json(result);
      }
      const ops=payload.operations;
      if(!Array.isArray(ops)||!ops.length||ops.length>100) throw new HttpError(400,'操作は1〜100件です。');
      for(const op of ops) {
        if(!['GET','POST','PUT','DELETE'].includes(op.method)||op.request.database!==this.identity!.database) throw new HttpError(400,'操作またはDBが不正です。');
        this.client!.table(op.request.database,op.request.table);
        if(source && (op.method==='GET'||op.method==='PUT')) {
          if(op.request.indexKey) await this.hydrate(source,op.request);
          else { await this.page(source); if(!this.state()?.complete) throw new HttpError(503,'移行中です。管理migrateまたは再試行で続行してください。'); }
        }
      }
      if(ops.some(op=>op.request.nearest)) {
        if(ops.length!==1||ops[0].method!=='GET') throw new HttpError(400,'nearestは単一GETだけに対応します。');
        const data=await searchVectors(this.client!,this.identity!,this.env,ops[0].request);
        return Response.json({data:[data]});
      }
      const shared=this.identity!.topic ? this.config.shared : undefined;
      if(shared && ops.some(op=>op.method!=='GET')) {
        if(!this.storage.setAlarm) throw new HttpError(503,'共有通知にはAlarm APIが必要です。');
        // commit直後のプロセス終了でも再送を開始できるよう、先に永続alarmを予約する。
        await this.storage.setAlarm(Date.now()+1000);
      }
      const data=this.storage.transactionSync(()=>ops.map(op=>{
        const result=executeCrud(this.client!,op.method,op.request,this.config.maxScanRows);
        if(op.method!=='GET') {
          const id=op.request.indexKey??op.request.value?.id;
          if(typeof id!=='string'||!id) throw new HttpError(400,'変更にはidが必要です。');
          this.rows('INSERT OR IGNORE INTO _masamune_touched VALUES (?,?)',op.request.table,id);
          this.sync.changed();
          if(shared) enqueueHubs(this.storage,shared,this.identity!,op.request.table,this.sync.sequence);
        }
        return result;
      }));
      this.sync.broadcast(new Set(ops.filter(o => o.method !== 'GET').map(o => o.request.table)));
      if(ops.some(o=>o.method!=='GET')) {
        if(shared) await drainHubs(this.storage,this.env);
        await this.scheduleAlarm();
      }
      return Response.json({data});
    } catch(e) {
      if(e instanceof HttpError) return Response.json({error:e.message},{status:e.status});
      console.error('DO処理に失敗',e);
      return Response.json({error:'DO処理に失敗しました。'},{status:500});
    }
  }
  private async restore() {
    const identity = this.rows('SELECT value FROM _masamune_identity WHERE id=1')[0];
    if (!identity) throw new HttpError(409, 'DO識別子がありません。');
    await this.initialize(JSON.parse(String(identity.value)));
  }
  async webSocketMessage(socket: SyncSocket, message: string | ArrayBuffer) {
    await this.restore(); this.sync.message(socket, message);
  }
  webSocketClose(socket: SyncSocket) { socket.close(1000, '購読終了'); }
  webSocketError(socket: SyncSocket) { socket.close(1011, '再接続してください。'); }
  private async scheduleAlarm() {
    if(!this.storage.setAlarm || !this.client) return;
    const candidates=[this.sync.nextAlarm,nextVectorAlarm(this.client),nextHubAlarm(this.storage)].filter((v):v is number=>typeof v==='number');
    if(candidates.length) await this.storage.setAlarm(Math.max(Date.now(), Math.min(...candidates)));
  }
  async alarm() { await this.restore(); await this.sync.alarm(); await drainHubs(this.storage,this.env); await drainVectors(this.client!,this.identity!,this.env); await this.scheduleAlarm(); }
}

function compareIds(a:string,b:string):number {
  const left=new TextEncoder().encode(a),right=new TextEncoder().encode(b);
  for(let i=0;i<Math.min(left.length,right.length);i++)if(left[i]!==right[i])return left[i]-right[i];
  return left.length-right.length;
}
