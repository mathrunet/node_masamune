import { HttpError } from './http_error';
import { DurableObjectSync, SyncContext, SyncSocket } from './sync';
import type { DoIdentity, DoNamespace, DoStorage, SharedHubConfig } from './types';

/** データDOと配信DOは別の名前空間キーを使う。個人DOの既存キーは変更しない。 */
export function databaseName(i: DoIdentity): string {
  return JSON.stringify(i.topic === undefined ? [i.environment, i.database, i.userId] : ['shared', i.environment, i.database, i.topic]);
}
export function validateShared(config: SharedHubConfig): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(config.binding) || !/^[A-Za-z0-9_-]{1,64}$/.test(config.generation) || !Number.isInteger(config.shards) || config.shards < 1 || config.shards > 32) throw new HttpError(500, '共有hub設定が不正です。');
}
export function hubName(i: DoIdentity, generation: string, shard: number): string {
  return JSON.stringify(['hub', i.environment, i.database, i.topic, generation, shard]);
}
export function hubStub(env: Record<string, unknown>, binding: string, name: string) {
  const ns = env[binding] as DoNamespace;
  if (!ns?.idFromName) throw new HttpError(503, '共有hub bindingがありません。');
  return ns.get(ns.idFromName(name));
}
export function initializeHubOutbox(storage: DoStorage): void {
  storage.sql.exec('CREATE TABLE IF NOT EXISTS _masamune_hub_outbox (target TEXT NOT NULL, table_name TEXT NOT NULL, binding TEXT NOT NULL, payload TEXT NOT NULL, sequence INTEGER NOT NULL, next_attempt INTEGER NOT NULL, PRIMARY KEY(target,table_name))');
}
/** CRUDと同じtransactionで呼ぶ。各table・hubへの未送信通知は最新連番へ集約する。 */
export function enqueueHubs(storage: DoStorage, config: SharedHubConfig, identity: DoIdentity, table: string, sequence: number) {
  for (let shard = 0; shard < config.shards; shard++) {
    const target = hubName(identity, config.generation, shard);
    const payload = JSON.stringify({identity, generation: config.generation, shard, table, sequence, action: 'invalidate'});
    storage.sql.exec('INSERT INTO _masamune_hub_outbox VALUES (?,?,?,?,?,0) ON CONFLICT(target,table_name) DO UPDATE SET binding=excluded.binding,payload=excluded.payload,sequence=excluded.sequence,next_attempt=0', target, table, config.binding, payload, sequence);
  }
}
export function nextHubAlarm(storage: DoStorage): number | undefined {
  const value = storage.sql.exec('SELECT MIN(next_attempt) AS next FROM _masamune_hub_outbox').toArray()[0]?.next;
  return value == null ? undefined : Number(value);
}
export async function drainHubs(storage: DoStorage, env: Record<string, unknown>) {
  const jobs = storage.sql.exec('SELECT * FROM _masamune_hub_outbox WHERE next_attempt<=? ORDER BY next_attempt LIMIT 32', Date.now()).toArray();
  await Promise.all(jobs.map(async job => {
    try {
      const result = await hubStub(env, String(job.binding), String(job.target)).fetch(new Request('https://hub.internal', {method:'POST', body:String(job.payload)}));
      if (!result.ok) throw new Error(`共有hub応答: ${result.status}`);
      await result.arrayBuffer();
      // 配信中に到着した次の変更を消さない。
      storage.sql.exec('DELETE FROM _masamune_hub_outbox WHERE target=? AND table_name=? AND sequence=?', job.target, job.table_name, job.sequence);
    } catch (error) {
      console.error('共有hub通知を再試行', error);
      storage.sql.exec('UPDATE _masamune_hub_outbox SET next_attempt=? WHERE target=? AND table_name=? AND sequence=?', Date.now()+1000, job.target, job.table_name, job.sequence);
    }
  }));
}

/** トピックごとの通知専用DO。文書・query・認証tokenは保持しない。 */
export class SharedHub {
  readonly sync: DurableObjectSync;
  constructor(private readonly ctx: SyncContext, _env?: unknown) {
    this.sync = new DurableObjectSync(ctx, {connections: 2048, tickets: 4096});
  }
  private initialize(identity: DoIdentity, generation: string, shard: number) {
    if (!identity || !['dev','prod'].includes(identity.environment) || !/^[A-Za-z0-9_-]{1,128}$/.test(identity.topic ?? '') || identity.userId !== '@shared' || !/^[A-Za-z0-9_-]{1,64}$/.test(generation) || !Number.isInteger(shard) || shard < 0 || shard >= 32) throw new HttpError(400, '共有hub識別子が不正です。');
    const key = hubName(identity, generation, shard);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS _masamune_hub_identity (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
      const row = this.ctx.storage.sql.exec('SELECT value FROM _masamune_hub_identity WHERE id=1').toArray()[0];
      if (row && row.value !== key) throw new HttpError(403, '共有hub識別子が一致しません。');
      this.ctx.storage.sql.exec('INSERT OR IGNORE INTO _masamune_hub_identity VALUES (1,?)', key);
      this.sync.initialize();
      this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS _masamune_hub_sequences (table_name TEXT PRIMARY KEY, sequence INTEGER NOT NULL)');
    });
  }
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        if (!this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE name='_masamune_hub_identity'").toArray().length) throw new HttpError(401, 'ticketが無効です。');
        const state = JSON.parse(request.headers.get('X-Hub-Identity') ?? 'null');
        this.initialize(state.identity, state.generation, state.shard);
        const attachment = this.sync.consume(new URL(request.url).searchParams.get('ticket') ?? '', {...state.identity, userId: state.userId});
        const pair = new (globalThis as any).WebSocketPair();
        await this.sync.accept(pair[1], attachment);
        return new Response(null, {status:101, webSocket:pair[0]} as ResponseInit);
      }
      const body = await request.json() as any;
      this.initialize(body.identity, body.generation, body.shard);
      if (typeof body.table !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(body.table)) throw new HttpError(400, 'tableが不正です。');
      if (body.action === 'ticket') {
        if (typeof body.userId !== 'string' || !body.userId || body.userId.length > 256 || !Number.isFinite(body.expires)) throw new HttpError(400, '購読者が不正です。');
        const ticket = this.sync.ticket({...body.identity, userId:body.userId}, body.table, body.expires);
        return Response.json(ticket);
      }
      if (body.action !== 'invalidate' || !Number.isSafeInteger(body.sequence) || body.sequence < 0) throw new HttpError(400, '通知が不正です。');
      const changed = this.ctx.storage.transactionSync(() => {
        const last = this.ctx.storage.sql.exec('SELECT sequence FROM _masamune_hub_sequences WHERE table_name=?', body.table).toArray()[0];
        if (last && Number(last.sequence) >= body.sequence) return false;
        this.ctx.storage.sql.exec('INSERT INTO _masamune_hub_sequences VALUES (?,?) ON CONFLICT(table_name) DO UPDATE SET sequence=excluded.sequence', body.table, body.sequence);
        this.sync.changed();
        return true;
      });
      if (changed) this.sync.broadcast(new Set([body.table]));
      return Response.json({ok:true});
    } catch (error) {
      if (error instanceof HttpError) return Response.json({error:error.message}, {status:error.status});
      console.error('共有hub処理に失敗', error);
      return Response.json({error:'共有hub処理に失敗しました。'}, {status:500});
    }
  }
  webSocketMessage(socket: SyncSocket, message: string | ArrayBuffer) { this.sync.message(socket, message); }
  webSocketClose(socket: SyncSocket) { socket.close(1000, '購読終了'); }
  webSocketError(socket: SyncSocket) { socket.close(1011, '再接続してください。'); }
  async alarm() { await this.sync.alarm(); }
}
