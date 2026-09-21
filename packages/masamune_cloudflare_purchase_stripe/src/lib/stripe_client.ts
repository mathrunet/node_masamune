import Stripe from "stripe";

/**
 * Stripe API version used across this package (parity with
 * `@mathrunet/masamune_firebase_purchase_stripe`).
 *
 * このパッケージ全体で使用するStripe APIバージョン
 * （`@mathrunet/masamune_firebase_purchase_stripe`と同一）。
 */
export const STRIPE_API_VERSION = "2025-02-24.acacia";

/**
 * Options for [createStripeClient].
 *
 * [createStripeClient]のオプション。
 */
export interface CreateStripeClientOptions {
    /**
     * Stripe secret key.
     *
     * Stripeのシークレットキー。
     */
    secretKey: string;

    /**
     * Fetch implementation. Defaults to the global `fetch`. Inject for tests.
     *
     * fetch実装。デフォルトはグローバル`fetch`。テスト時に注入します。
     */
    fetch?: typeof fetch | undefined;
}

/**
 * Create a Stripe SDK client configured for Cloudflare Workers.
 *
 * Uses the fetch-based HTTP client so the SDK works without Node.js APIs.
 *
 * Cloudflare Workers用に構成したStripe SDKクライアントを作成します。
 *
 * fetchベースのHTTPクライアントを使うためNode.js APIなしで動作します。
 */
export function createStripeClient(options: CreateStripeClientOptions): Stripe {
    // 空キーだとSDKコンストラクタが例外を投げ、Webhook署名検証のような
    // APIキー不要の処理まで実行できなくなるためプレースホルダを渡す。
    // 実際のAPI呼び出しはStripe側の認証エラーとして返る。
    return new Stripe(options.secretKey || "sk_not_configured", {
        apiVersion: STRIPE_API_VERSION,
        httpClient: Stripe.createFetchHttpClient(options.fetch),
    });
}

/**
 * Verify a Stripe webhook signature and construct the event.
 *
 * Uses `constructEventAsync` with the SubtleCrypto provider because the
 * synchronous variant is not available on Cloudflare Workers.
 *
 * StripeのWebhook署名を検証しイベントを構築します。
 *
 * 同期版はCloudflare Workersで使用できないため、SubtleCryptoプロバイダ付きの
 * `constructEventAsync`を使用します。
 */
export async function constructStripeEvent(options: {
    client: Stripe,
    payload: string,
    signature: string,
    secret: string,
}): Promise<Stripe.Event> {
    return options.client.webhooks.constructEventAsync(
        options.payload,
        options.signature,
        options.secret,
        undefined,
        Stripe.createSubtleCryptoProvider(),
    );
}
