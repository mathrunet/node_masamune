import { HttpError } from './http_error';
import type { DoStorage, DoIdentity } from './types';

/** 文書は配信しない。通知を受けたクライアントが認可付きsnapshotを取得する。 */
export interface SyncSocket {
  send(message: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
export interface SyncContext {
  storage: DoStorage;
  acceptWebSocket?(socket: SyncSocket): void;
  getWebSockets?(): SyncSocket[];
}
interface Attachment { identity: DoIdentity; table: string; expires: number; }
export class DurableObjectSync {
  readonly bootId = crypto.randomUUID();
  constructor(private readonly ctx: SyncContext, private readonly limits = {connections:32, tickets:64}) {}
  private rows(sql: string, ...values: unknown[]) { return this.ctx.storage.sql.exec(sql, ...values).toArray(); }
  initialize() {
    this.rows('CREATE TABLE IF NOT EXISTS _masamune_sync (id INTEGER PRIMARY KEY CHECK(id=1), sequence INTEGER NOT NULL)');
    this.rows('INSERT OR IGNORE INTO _masamune_sync VALUES (1,0)');
    this.rows('CREATE TABLE IF NOT EXISTS _masamune_tickets (ticket TEXT PRIMARY KEY, identity TEXT NOT NULL, table_name TEXT NOT NULL, expires INTEGER NOT NULL)');
  }
  get sequence(): number { return Number(this.rows('SELECT sequence FROM _masamune_sync WHERE id=1')[0].sequence); }
  get nextAlarm(): number | undefined {
    const times = (this.ctx.getWebSockets?.() ?? []).map(s => (s.deserializeAttachment() as Attachment)?.expires).filter(t => t > Date.now());
    return times.length ? Math.min(...times) : undefined;
  }
  /** 呼び出し元のCRUDトランザクション内で実行する。履歴は保持せず常に全snapshotで再同期する。 */
  changed() { this.rows('UPDATE _masamune_sync SET sequence=sequence+1 WHERE id=1'); }
  ticket(identity: DoIdentity, table: string, expires: number, now = Date.now()) {
    this.rows('DELETE FROM _masamune_tickets WHERE expires<=?', now);
    if (expires <= now) throw new HttpError(401, '認証期限切れです。');
    if (Number(this.rows('SELECT count(*) AS n FROM _masamune_tickets')[0].n) >= this.limits.tickets) throw new HttpError(429, '未使用ticketの上限です。');
    const ticket = crypto.randomUUID();
    this.rows('INSERT INTO _masamune_tickets VALUES (?,?,?,?)', ticket, JSON.stringify(identity), table, Math.min(expires, now + 30000));
    return { ticket, expires: Math.min(expires, now + 30000) };
  }
  consume(ticket: string, identity: DoIdentity, now = Date.now()): Attachment {
    return this.ctx.storage.transactionSync(() => {
      const row = this.rows('SELECT * FROM _masamune_tickets WHERE ticket=?', ticket)[0];
      if (!row || Number(row.expires) <= now || row.identity !== JSON.stringify(identity)) throw new HttpError(401, 'ticketが無効です。');
      if ((this.ctx.getWebSockets?.().length ?? 0) >= this.limits.connections) throw new HttpError(429, '接続数の上限です。');
      this.rows('DELETE FROM _masamune_tickets WHERE ticket=?', ticket);
      // ticket自体の有効期限を接続期限にも使い、認証を短い周期で再検証する。
      return { identity, table: String(row.table_name), expires: Number(row.expires) };
    });
  }
  async accept(socket: SyncSocket, attachment: Attachment) {
    if (!this.ctx.acceptWebSocket || !this.ctx.storage.setAlarm) throw new HttpError(503, 'Hibernation APIが必要です。');
    socket.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(socket);
    await this.schedule();
    this.notify(socket);
  }
  private notify(socket: SyncSocket) {
    const state = socket.deserializeAttachment() as Attachment | undefined;
    if (!state || state.expires <= Date.now()) { socket.close(4001, '再認証が必要です。'); return; }
    // データやquery条件を含めず、HTTPでの再認可を必須にする。
    socket.send(JSON.stringify({ type: 'invalidate', sequence: this.sequence, bootId: this.bootId }));
  }
  broadcast(tables: Set<string>) {
    for (const socket of this.ctx.getWebSockets?.() ?? []) {
      try {
        const state = socket.deserializeAttachment() as Attachment | undefined;
        if (!state || tables.has(state.table)) this.notify(socket);
      } catch (error) { console.error('DO通知接続を終了', error); socket.close(1011, '再接続してください。'); }
    }
  }
  message(socket: SyncSocket, message: string | ArrayBuffer) {
    if (message !== 'resync') { socket.close(1008, '未対応messageです。'); return; }
    this.notify(socket);
  }
  async alarm() {
    for (const socket of this.ctx.getWebSockets?.() ?? []) {
      const state = socket.deserializeAttachment() as Attachment | undefined;
      if (!state || state.expires <= Date.now()) socket.close(4001, '再認証が必要です。');
    }
    this.rows('DELETE FROM _masamune_tickets WHERE expires<=?', Date.now());
    await this.schedule();
  }
  private async schedule() {
    const times = (this.ctx.getWebSockets?.() ?? []).map(s => (s.deserializeAttachment() as Attachment)?.expires).filter(t => t > Date.now());
    if (times.length) await this.ctx.storage.setAlarm?.(Math.min(...times));
  }
}
