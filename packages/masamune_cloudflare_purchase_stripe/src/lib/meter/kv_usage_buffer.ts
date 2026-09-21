import { StripeUsageBuffer, StripeUsageBufferState } from "./interface";

/**
 * Minimal structural interface for a KV-like namespace.
 *
 * Cloudflare's `KVNamespace` satisfies this without depending on
 * `@cloudflare/workers-types`.
 *
 * KV相当のネームスペースの最小の構造的インターフェース。
 *
 * `@cloudflare/workers-types`に依存せずCloudflareの`KVNamespace`が適合します。
 */
export interface KVNamespaceLike {
    /**
     * Get a JSON value for the key.
     *
     * キーに対応するJSON値を取得します。
     */
    get(key: string, type: "json"): Promise<unknown | null>;

    /**
     * Store a string value for the key.
     *
     * キーに対応する文字列値を保存します。
     */
    put(
        key: string,
        value: string,
        options?: { expirationTtl?: number | undefined },
    ): Promise<void>;
}

/**
 * [StripeUsageBuffer] backed by Cloudflare KV.
 *
 * Cloudflare KVを用いた[StripeUsageBuffer]。
 */
export class KVUsageBuffer implements StripeUsageBuffer {
    /**
     * [StripeUsageBuffer] backed by Cloudflare KV.
     *
     * Cloudflare KVを用いた[StripeUsageBuffer]。
     */
    constructor(kv: KVNamespaceLike, options: { prefix?: string | undefined } = {}) {
        this._kv = kv;
        this._prefix = options.prefix ?? "usage:";
    }

    private readonly _kv: KVNamespaceLike;
    private readonly _prefix: string;

    /**
     * Get the buffer state for the customer key. Returns `null` if absent or corrupt.
     *
     * 顧客キーのバッファ状態を取得します。存在しない・壊れている場合は`null`。
     */
    async get(customerKey: string): Promise<StripeUsageBufferState | null> {
        try {
            const stored = await this._kv.get(`${this._prefix}${customerKey}`, "json");
            if (stored && typeof stored === "object") {
                return stored as StripeUsageBufferState;
            }
        } catch {
            // ignore corrupt buffer
        }
        return null;
    }

    /**
     * Store the buffer state for the customer key.
     *
     * 顧客キーのバッファ状態を保存します。
     */
    async put(customerKey: string, value: StripeUsageBufferState, ttlSeconds: number): Promise<void> {
        await this._kv.put(`${this._prefix}${customerKey}`, JSON.stringify(value), {
            expirationTtl: ttlSeconds,
        });
    }
}
