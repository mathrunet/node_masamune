import { normalizeVectorValue, resolveVectorIndex, vectorNamespace, vectorRetryAt } from "@mathrunet/masamune_cloudflare";
import type { CloudflareKvNamespace, KvVectorField, VectorIndex } from "./types";

interface SqlStorage {
  setAlarm(time: number): Promise<void>;
  transactionSync<T>(callback: () => T): T;
  sql: { exec(sql: string, ...values: unknown[]): { toArray(): Record<string, unknown>[] } };
}
interface CoordinatorContext { storage: SqlStorage }
interface WriteCommand { action: "write"; key: string; value: Record<string, unknown> | null; specs: KvVectorField[]; kvBinding: string; namespaceParts: string[] }
interface SearchCommand { action: "search"; prefix: string; nearest: { key: string; value: unknown }; limit: number; specs: KvVectorField[]; kvBinding: string; namespaceParts: string[] }
interface DrainCommand { action: "drain"; limit?: number }
interface StatusCommand { action: "status" }
type Command = WriteCommand | SearchCommand | DrainCommand | StatusCommand;

export class KvVectorCoordinator {
  constructor(private readonly ctx: CoordinatorContext, private readonly env: Record<string, unknown>) { this.initialize(); }
  private rows(sql: string, ...values: unknown[]) { return this.ctx.storage.sql.exec(sql, ...values).toArray(); }
  private initialize() {
    this.rows('CREATE TABLE IF NOT EXISTS _masamune_vector_state (key_name TEXT NOT NULL,field TEXT NOT NULL,generation TEXT NOT NULL,PRIMARY KEY(key_name,field))');
    this.rows('CREATE TABLE IF NOT EXISTS _masamune_vector_jobs (generation TEXT PRIMARY KEY,key_name TEXT NOT NULL,field TEXT NOT NULL,value TEXT,deleted INTEGER NOT NULL,spec TEXT NOT NULL,kv_binding TEXT NOT NULL,namespace_parts TEXT NOT NULL,next_attempt INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT \'pending\',mutation_id TEXT)');
    this.rows('CREATE INDEX IF NOT EXISTS _masamune_vector_due ON _masamune_vector_jobs(next_attempt,generation)');
  }
  private namespace(binding: string): CloudflareKvNamespace {
    const value = this.env[binding] as CloudflareKvNamespace;
    if (!value?.get || !value.put || !value.delete) throw new Error("Cloudflare KV binding is not found.");
    return value;
  }
  private index(spec: KvVectorField): VectorIndex { return resolveVectorIndex(this.env, spec) as VectorIndex; }
  private async enqueue(command: WriteCommand) {
    const serialized = command.value == null ? null : JSON.stringify(command.value);
    if (command.value != null) for (const spec of command.specs) {
      const vector = command.value[spec.field];
      if (vector != null) normalizeVectorValue(vector, spec);
    }
    this.ctx.storage.transactionSync(() => {
      for (const spec of command.specs) {
        const generation = crypto.randomUUID().replace(/-/g, "");
        this.rows('INSERT INTO _masamune_vector_state VALUES (?,?,?) ON CONFLICT(key_name,field) DO UPDATE SET generation=excluded.generation', command.key, spec.field, generation);
        this.rows('INSERT INTO _masamune_vector_jobs(generation,key_name,field,value,deleted,spec,kv_binding,namespace_parts) VALUES (?,?,?,?,?,?,?,?)', generation, command.key, spec.field, serialized, Number(command.value == null), JSON.stringify(spec), command.kvBinding, JSON.stringify(command.namespaceParts));
      }
    });
    // 外部I/Oより先に永続alarmを置き、Vectorize呼出し中の中断でもintentを回収する。
    await this.ctx.storage.setAlarm(Date.now());
    await this.drain(Math.max(1, command.specs.length));
    await this.schedule();
    return command.value ?? {};
  }
  private async apply(job: Record<string, unknown>, now: number) {
    const spec = JSON.parse(String(job.spec)) as KvVectorField;
    const namespace = this.namespace(String(job.kv_binding));
    const current = this.rows('SELECT generation FROM _masamune_vector_state WHERE key_name=? AND field=?', job.key_name, job.field)[0];
    let mutation: { mutationId: string };
    if (current?.generation !== job.generation) {
      mutation = await this.index(spec).deleteByIds([String(job.generation)]);
    } else {
      const value = job.value == null ? null : JSON.parse(String(job.value)) as Record<string, unknown>;
      if (Number(job.deleted)) await namespace.delete(String(job.key_name));
      else await namespace.put(String(job.key_name), JSON.stringify(value));
      const vector = value?.[spec.field];
      mutation = value == null || vector == null
        ? await this.index(spec).deleteByIds([String(job.generation)])
        : await this.index(spec).upsert([{ id: String(job.generation), values: normalizeVectorValue(vector, spec), namespace: await vectorNamespace([...JSON.parse(String(job.namespace_parts)), spec.field]) }]);
    }
    this.rows('UPDATE _masamune_vector_jobs SET next_attempt=?,attempts=0,status=\'accepted\',mutation_id=? WHERE generation=?', now + 3600000, mutation.mutationId, job.generation);
  }
  private async drain(limit = 10, now = Date.now()) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("処理件数は1〜100です。");
    const jobs = this.rows('SELECT * FROM _masamune_vector_jobs WHERE next_attempt<=? ORDER BY next_attempt,generation LIMIT ?', now, limit);
    const result = { accepted: 0, failed: 0 };
    for (const job of jobs) {
      try { await this.apply(job, now); result.accepted++; }
      catch { this.rows('UPDATE _masamune_vector_jobs SET next_attempt=?,attempts=attempts+1,status=\'failed\' WHERE generation=?', vectorRetryAt(now, Number(job.attempts)), job.generation); result.failed++; }
    }
    return result;
  }
  private async search(command: SearchCommand) {
    const spec = command.specs.find(value => value.field === command.nearest.key && (command.prefix.startsWith(value.prefix ?? "") || `${command.prefix}/`.startsWith(value.prefix ?? "")));
    if (!spec || !Number.isInteger(command.limit) || command.limit < 1 || command.limit > 100) throw new Error("ベクトル検索条件が不正です。");
    const matches = await this.index(spec).query(normalizeVectorValue(command.nearest.value, spec), { topK: 100, namespace: await vectorNamespace([...command.namespaceParts, spec.field]), returnMetadata: "none", returnValues: false });
    const namespace = this.namespace(command.kvBinding);
    const documentPrefix = command.prefix.endsWith("/") ? command.prefix : `${command.prefix}/`;
    const data: Record<string, unknown>[] = [];
    for (const match of matches.matches.slice(0, 100)) {
      const state = this.rows('SELECT s.key_name,j.value,j.deleted FROM _masamune_vector_state s JOIN _masamune_vector_jobs j ON j.generation=s.generation WHERE s.field=? AND s.generation=?', spec.field, match.id)[0];
      if (!state || !String(state.key_name).startsWith(documentPrefix)) continue;
      const text = await namespace.get(String(state.key_name), "text");
      // KVの別拠点cacheが旧本文を返す間は結果不足として扱う。
      if (text == null || Number(state.deleted) || text !== state.value) continue;
      const value = JSON.parse(text) as Record<string, unknown>;
      data.push({ ...value, __masamune_kv_key: String(state.key_name) });
      if (data.length >= command.limit) break;
    }
    return data;
  }
  private async schedule() {
    const next = this.rows('SELECT MIN(next_attempt) next_attempt FROM _masamune_vector_jobs')[0]?.next_attempt;
    if (typeof next === "number") await this.ctx.storage.setAlarm(next);
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const command = await request.json() as Command;
      let data: unknown;
      if (command.action === "write") data = await this.enqueue(command);
      else if (command.action === "search") data = await this.search(command);
      else if (command.action === "drain") data = await this.drain(command.limit);
      else if (command.action === "status") data = this.rows('SELECT status,COUNT(*) count,MIN(next_attempt) next_attempt FROM _masamune_vector_jobs GROUP BY status');
      else throw new Error("不正なvector操作です。");
      return Response.json({ data });
    } catch (error) { console.error("KV vector coordinator failed", error); return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: error instanceof TypeError ? 400 : 500 }); }
  }
  async alarm() { await this.drain(); await this.schedule(); }
}
