/**
 * A usage event to be recorded as the source of truth for metered billing.
 *
 * 従量課金の正本として記録される使用量イベント。
 */
export interface StripeUsageEvent {
    /**
     * Unique id of the event.
     *
     * イベントの一意なID。
     */
    id: string;

    /**
     * Key identifying the customer on your side (e.g. API key id).
     *
     * 自側で顧客を識別するキー（例: APIキーID）。
     */
    customerKey: string;

    /**
     * The endpoint or feature that consumed the units.
     *
     * ユニットを消費したエンドポイントや機能。
     */
    endpoint: string;

    /**
     * Number of units consumed.
     *
     * 消費ユニット数。
     */
    units: number;

    /**
     * Optional source label of the event.
     *
     * イベントのソースラベル（任意）。
     */
    source: string | null;

    /**
     * Creation time in milliseconds since epoch.
     *
     * 作成時刻（エポックからのミリ秒）。
     */
    createdAt: number;
}

/**
 * Storage for usage events. The store is the source of truth for billing.
 *
 * 使用量イベントのストレージ。課金の正本となる。
 */
export interface StripeUsageEventStore {
    /**
     * Persist a usage event with `flushed = false`.
     *
     * 使用量イベントを未送信状態で永続化します。
     */
    insert(event: StripeUsageEvent): Promise<void>;

    /**
     * List events not yet flushed to Stripe for the given customer key.
     *
     * 指定した顧客キーのStripe未送信イベントを一覧します。
     */
    listPending(customerKey: string): Promise<{ id: string, units: number }[]>;

    /**
     * Mark the given events as flushed to Stripe.
     *
     * 指定したイベントをStripe送信済みとして記録します。
     */
    markFlushed(ids: string[]): Promise<void>;
}

/**
 * State of the flush-trigger buffer for a customer.
 *
 * 顧客ごとのフラッシュトリガー用バッファの状態。
 */
export interface StripeUsageBufferState {
    /**
     * Accumulated units since the last flush.
     *
     * 前回フラッシュ以降に積み上がったユニット数。
     */
    units: number;

    /**
     * Time in milliseconds when the buffer window started.
     *
     * バッファ窓が開始した時刻（ミリ秒）。
     */
    since: number;
}

/**
 * Buffer used only to decide when to flush. Billing accuracy does not depend on it.
 *
 * フラッシュタイミングの判定のみに使うバッファ。課金精度はこれに依存しない。
 */
export interface StripeUsageBuffer {
    /**
     * Get the buffer state for the customer key. Returns `null` if absent or corrupt.
     *
     * 顧客キーのバッファ状態を取得します。存在しない・壊れている場合は`null`。
     */
    get(customerKey: string): Promise<StripeUsageBufferState | null>;

    /**
     * Store the buffer state for the customer key.
     *
     * 顧客キーのバッファ状態を保存します。
     */
    put(customerKey: string, value: StripeUsageBufferState, ttlSeconds: number): Promise<void>;
}
