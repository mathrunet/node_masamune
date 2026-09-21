import type { DoStorage } from './types';
import { HttpError } from './http_error';
export interface LeaseRequest { action: 'acquire' | 'renew' | 'release' | 'complete'; key: string; owner: string; ttlMs?: number; generation?: number }
/** 世代は解放後も保持する。古い実行者は期限切れ後に復帰しても変更できない。 */
export function lease(store: DoStorage, request: LeaseRequest, now = Date.now()): unknown {
  const {action,key,owner,ttlMs = 30000,generation} = request;
  if(!['acquire','renew','release','complete'].includes(action) || typeof key !== 'string' || !key.length || key.length > 512 || typeof owner !== 'string' || !owner.length || owner.length > 512 || !Number.isSafeInteger(ttlMs) || ttlMs < 100 || ttlMs > 300000) throw new HttpError(400, 'リース引数が不正です。');
  return store.transactionSync(() => {
    store.sql.exec('CREATE TABLE IF NOT EXISTS _masamune_leases (key TEXT PRIMARY KEY, owner TEXT NOT NULL, generation INTEGER NOT NULL, expires INTEGER NOT NULL, completed INTEGER NOT NULL)');
    const old = store.sql.exec('SELECT * FROM _masamune_leases WHERE key=?',key).toArray()[0];
    if(action === 'acquire') {
      if(old && (old.completed || Number(old.expires) > now)) throw new HttpError(409, '取得済みまたは完了済みです。');
      const next = Number(old?.generation ?? 0)+1;
      store.sql.exec('INSERT INTO _masamune_leases VALUES (?,?,?,?,0) ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,generation=excluded.generation,expires=excluded.expires',key,owner,next,now+ttlMs);
      return {key,owner,generation:next,expires:now+ttlMs};
    }
    if(!old || old.owner !== owner || old.generation !== generation || Number(old.expires) <= now || old.completed) throw new HttpError(409, 'リースの所有者・世代・期限が一致しません。');
    const expires = action === 'renew' ? now+ttlMs : 0;
    store.sql.exec('UPDATE _masamune_leases SET expires=?,completed=? WHERE key=?',expires,Number(action === 'complete'),key);
    return {key,owner,generation,expires,completed:action === 'complete'};
  });
}
export class QueueCoordinator {
  constructor(private readonly ctx: {storage: DoStorage}, _env: unknown) {}
  async fetch(request: Request): Promise<Response> {
    try { return Response.json({data:lease(this.ctx.storage,await request.json() as LeaseRequest)}); }
    catch(e) { if(e instanceof HttpError) return Response.json({error:e.message},{status:e.status}); console.error('リース処理に失敗',e); return Response.json({error:'リース処理に失敗しました。'},{status:500}); }
  }
}
