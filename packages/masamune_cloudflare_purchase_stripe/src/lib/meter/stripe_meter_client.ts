import Stripe from "stripe";
import { createStripeClient } from "../stripe_client";

/**
 * Options for [StripeMeterClient].
 *
 * [StripeMeterClient]のオプション。
 */
export interface StripeMeterClientOptions {
    /**
     * Stripe secret key. When empty the client is disabled and sends nothing.
     *
     * Stripeのシークレットキー。空の場合クライアントは無効となり何も送信しません。
     */
    secretKey?: string | undefined;

    /**
     * Meter event name registered on Stripe (billing meters, basil or later).
     *
     * Stripeに登録したMeterイベント名（billing meters、basil以降）。
     */
    eventName: string;

    /**
     * Fetch implementation used by the Stripe SDK's fetch HTTP client.
     * Defaults to the global `fetch`. Inject for tests.
     *
     * Stripe SDKのfetch HTTPクライアントが使用するfetch実装。
     * デフォルトはグローバル`fetch`。テスト時に注入します。
     */
    fetch?: typeof fetch | undefined;

    /**
     * Stripe SDK client instance. When specified, `secretKey` / `fetch` are not
     * used to construct a client.
     *
     * Stripe SDKのクライアントインスタンス。指定した場合`secretKey` / `fetch`は
     * クライアント生成に使用されません。
     */
    stripeClient?: Stripe | undefined;
}

/**
 * Client for the Stripe Meter Event API (`/v1/billing/meter_events`).
 *
 * Uses the Stripe SDK with the fetch HTTP client so it works on Cloudflare
 * Workers.
 *
 * Stripe Meter Event API（`/v1/billing/meter_events`）用のクライアント。
 *
 * Cloudflare Workersで動作するようfetch HTTPクライアント付きのStripe SDKを
 * 使用します。
 */
export class StripeMeterClient {
    /**
     * Client for the Stripe Meter Event API (`/v1/billing/meter_events`).
     *
     * Stripe Meter Event API（`/v1/billing/meter_events`）用のクライアント。
     */
    constructor(options: StripeMeterClientOptions) {
        this._secretKey = options.secretKey ?? "";
        this._eventName = options.eventName;
        this._fetch = options.fetch;
        this._client = options.stripeClient;
    }

    private readonly _secretKey: string;
    private readonly _eventName: string;
    private readonly _fetch: typeof fetch | undefined;
    private _client: Stripe | undefined;

    /**
     * Whether the client can send meter events.
     *
     * Meterイベントを送信できる状態かどうか。
     */
    get enabled(): boolean {
        return (this._client !== undefined || this._secretKey.length > 0) && this._eventName.length > 0;
    }

    private get client(): Stripe {
        if (!this._client) {
            this._client = createStripeClient({
                secretKey: this._secretKey,
                fetch: this._fetch,
            });
        }
        return this._client;
    }

    /**
     * Send one meter event. Returns `false` when Stripe responds with an error.
     *
     * Meterイベントを1件送信します。Stripeがエラーを返した場合は`false`を返します。
     */
    async sendMeterEvent(options: {
        stripeCustomerId: string,
        value: number,
        identifier: string,
    }): Promise<boolean> {
        try {
            await this.client.billing.meterEvents.create({
                event_name: this._eventName,
                identifier: options.identifier,
                payload: {
                    stripe_customer_id: options.stripeCustomerId,
                    value: String(options.value),
                },
            });
            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn("stripe meter flush failed", message.slice(0, 240));
            return false;
        }
    }
}
