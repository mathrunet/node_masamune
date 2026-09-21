import { StripeUsageEvent, StripeUsageEventStore } from "./interface";

/**
 * Minimal structural interface for a D1-like SQL database.
 *
 * Cloudflare's `D1Database` satisfies this without depending on
 * `@cloudflare/workers-types`.
 *
 * D1相当のSQLデータベースの最小の構造的インターフェース。
 *
 * `@cloudflare/workers-types`に依存せずCloudflareの`D1Database`が適合します。
 */
export interface SqlDatabaseLike {
    /**
     * Prepare a SQL statement.
     *
     * SQLステートメントを準備します。
     */
    prepare(sql: string): {
        bind(...args: unknown[]): {
            run(): Promise<unknown>;
            all<T = Record<string, unknown>>(): Promise<{ results?: T[] | undefined }>;
        },
    };
}

/**
 * Column mapping options for [D1UsageEventStore]. Defaults follow the
 * `usage_events` schema (id / api_key_id / endpoint / units / decision_source /
 * created_at / flushed_to_stripe).
 *
 * [D1UsageEventStore]のカラムマッピングオプション。デフォルトは`usage_events`
 * スキーマ（id / api_key_id / endpoint / units / decision_source / created_at /
 * flushed_to_stripe）に従います。
 */
export interface D1UsageEventStoreOptions {
    /**
     * Table name. Defaults to `usage_events`.
     *
     * テーブル名。デフォルトは`usage_events`。
     */
    table?: string | undefined;

    /**
     * Primary key column. Defaults to `id`.
     *
     * 主キーのカラム。デフォルトは`id`。
     */
    idColumn?: string | undefined;

    /**
     * Customer key column. Defaults to `api_key_id`.
     *
     * 顧客キーのカラム。デフォルトは`api_key_id`。
     */
    customerKeyColumn?: string | undefined;

    /**
     * Endpoint column. Defaults to `endpoint`.
     *
     * エンドポイントのカラム。デフォルトは`endpoint`。
     */
    endpointColumn?: string | undefined;

    /**
     * Units column. Defaults to `units`.
     *
     * ユニット数のカラム。デフォルトは`units`。
     */
    unitsColumn?: string | undefined;

    /**
     * Source label column. Defaults to `decision_source`.
     *
     * ソースラベルのカラム。デフォルトは`decision_source`。
     */
    sourceColumn?: string | undefined;

    /**
     * Creation time column. Defaults to `created_at`.
     *
     * 作成時刻のカラム。デフォルトは`created_at`。
     */
    createdAtColumn?: string | undefined;

    /**
     * Flushed flag column (0/1). Defaults to `flushed_to_stripe`.
     *
     * 送信済みフラグ（0/1）のカラム。デフォルトは`flushed_to_stripe`。
     */
    flushedColumn?: string | undefined;
}

/**
 * [StripeUsageEventStore] backed by Cloudflare D1 (or any compatible SQL database).
 *
 * Cloudflare D1（または互換SQLデータベース）を用いた[StripeUsageEventStore]。
 */
export class D1UsageEventStore implements StripeUsageEventStore {
    /**
     * [StripeUsageEventStore] backed by Cloudflare D1 (or any compatible SQL database).
     *
     * Cloudflare D1（または互換SQLデータベース）を用いた[StripeUsageEventStore]。
     */
    constructor(db: SqlDatabaseLike, options: D1UsageEventStoreOptions = {}) {
        this._db = db;
        this._table = options.table ?? "usage_events";
        this._id = options.idColumn ?? "id";
        this._customerKey = options.customerKeyColumn ?? "api_key_id";
        this._endpoint = options.endpointColumn ?? "endpoint";
        this._units = options.unitsColumn ?? "units";
        this._source = options.sourceColumn ?? "decision_source";
        this._createdAt = options.createdAtColumn ?? "created_at";
        this._flushed = options.flushedColumn ?? "flushed_to_stripe";
    }

    private readonly _db: SqlDatabaseLike;
    private readonly _table: string;
    private readonly _id: string;
    private readonly _customerKey: string;
    private readonly _endpoint: string;
    private readonly _units: string;
    private readonly _source: string;
    private readonly _createdAt: string;
    private readonly _flushed: string;

    /**
     * Persist a usage event with `flushed = 0`.
     *
     * 使用量イベントを未送信状態で永続化します。
     */
    async insert(event: StripeUsageEvent): Promise<void> {
        await this._db
            .prepare(
                `INSERT INTO ${this._table}
                  (${this._id}, ${this._customerKey}, ${this._endpoint}, ${this._units}, ${this._source}, ${this._createdAt}, ${this._flushed})
                 VALUES (?, ?, ?, ?, ?, ?, 0)`,
            )
            .bind(event.id, event.customerKey, event.endpoint, event.units, event.source, event.createdAt)
            .run();
    }

    /**
     * List events not yet flushed to Stripe for the given customer key.
     *
     * 指定した顧客キーのStripe未送信イベントを一覧します。
     */
    async listPending(customerKey: string): Promise<{ id: string, units: number }[]> {
        const pending = await this._db
            .prepare(
                `SELECT ${this._id} AS id, ${this._units} AS units FROM ${this._table}
                 WHERE ${this._customerKey} = ? AND ${this._flushed} = 0`,
            )
            .bind(customerKey)
            .all<{ id: string, units: number }>();
        return pending.results ?? [];
    }

    /**
     * Mark the given events as flushed to Stripe.
     *
     * 指定したイベントをStripe送信済みとして記録します。
     */
    async markFlushed(ids: string[]): Promise<void> {
        if (ids.length <= 0) {
            return;
        }
        const placeholders = ids.map(() => "?").join(",");
        await this._db
            .prepare(
                `UPDATE ${this._table} SET ${this._flushed} = 1 WHERE ${this._id} IN (${placeholders})`,
            )
            .bind(...ids)
            .run();
    }
}
