import { WorkersData } from "@mathrunet/masamune_cloudflare";
import { StripePurchaseWorkersOptions } from "./lib/options";

/**
 * Define a list of applicable Functions for CloudflareWorkers.
 *
 * Endpoints have parity with `@mathrunet/masamune_firebase_purchase_stripe`:
 * `stripe` handles mode-based actions (`create_customer_and_payment`,
 * `create_purchase`, `create_subscription`, etc.) and the webhooks receive
 * events from Stripe. The metered billing library is provided separately in
 * `lib/meter`.
 *
 * CloudflareWorkers用の適用可能なFunctionの一覧を定義します。
 *
 * エンドポイントは`@mathrunet/masamune_firebase_purchase_stripe`と同等です。
 * `stripe`は`mode`分岐のアクション（`create_customer_and_payment`、
 * `create_purchase`、`create_subscription`など）を処理し、各WebhookはStripeから
 * のイベントを受信します。従量課金ライブラリは`lib/meter`で別途提供します。
 */
export const Functions = {
    /**
     * Performs various Stripe processes (mode-based actions).
     *
     * Stripeの各種処理（mode分岐のアクション）を実行します。
     */
    stripe: (options: StripePurchaseWorkersOptions = {}) => new WorkersData({ path: "/stripe", func: require("./workers/stripe"), options: options }),

    /**
     * Receives and processes webhooks from Stripe.
     *
     * StripeからのWebhookを受け取り処理を行います。
     */
    stripeWebhook: (options: StripePurchaseWorkersOptions = {}) => new WorkersData({ path: "/stripe/webhook", func: require("./workers/stripe_webhook"), options: options }),

    /**
     * Receives and processes webhooks for Stripe Connect.
     *
     * Stripe Connect用のWebhookを受信して処理します。
     */
    stripeWebhookConnect: (options: StripePurchaseWorkersOptions = {}) => new WorkersData({ path: "/stripe/webhook/connect", func: require("./workers/stripe_webhook_connect"), options: options }),

    /**
     * Webhook for proper redirection when 3D Secure authentication is required.
     *
     * 3Dセキュア認証が必要な場合、適切なリダイレクトを行うためのWebhookです。
     */
    stripeWebhookSecure: (options: StripePurchaseWorkersOptions = {}) => new WorkersData({ path: "/stripe/webhook/secure", func: require("./workers/stripe_webhook_secure"), options: options }),
} as const;
