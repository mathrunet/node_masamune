/**
 * Copyright (c) 2026 mathru. All rights reserved.
 *
 * Standalone entry point exposing the Stripe purchase library (mode actions,
 * webhooks, stores) without the full Masamune re-exports. Import from
 * `@mathrunet/masamune_cloudflare_purchase_stripe/dist/purchase` to keep
 * Workers bundles small.
 *
 * Stripe購入ライブラリ（modeアクション、Webhook、ストア）のみを公開する単独
 * エントリポイント。Masamune全体の再エクスポートをWorkersバンドルに含めたく
 * ない場合は`@mathrunet/masamune_cloudflare_purchase_stripe/dist/purchase`から
 * インポートしてください。
 *
 * [mathru.net]: https://mathru.net
 * [YouTube]: https://www.youtube.com/c/mathrunetchannel
 */
import { Hono } from "hono";
import { StripePurchaseWorkersOptions } from "./lib/options";

export * from "./lib/options";
export * from "./lib/stripe_client";
export * from "./lib/purchase/interface";
export * from "./lib/purchase/d1_purchase_store";
export * from "./lib/purchase/helpers";
export * from "./lib/purchase/sync_payment";

/**
 * Builder signature of the purchase workers (`stripe` / `stripeWebhook` /
 * `stripeWebhookConnect` / `stripeWebhookSecure`).
 *
 * 購入ワーカー（`stripe` / `stripeWebhook` / `stripeWebhookConnect` /
 * `stripeWebhookSecure`）のビルダーシグネチャ。
 */
export type StripeWorkerBuilder = (
    hono: Hono,
    options: StripePurchaseWorkersOptions,
    data: { [key: string]: any },
) => Hono;

/**
 * Build the mode-based Stripe action handler onto a Hono app.
 *
 * mode分岐のStripeアクションハンドラをHonoアプリへ構築します。
 */
export const buildStripe: StripeWorkerBuilder = require("./workers/stripe");

/**
 * Build the main Stripe webhook handler onto a Hono app.
 *
 * StripeメインWebhookハンドラをHonoアプリへ構築します。
 */
export const buildStripeWebhook: StripeWorkerBuilder = require("./workers/stripe_webhook");

/**
 * Build the Stripe Connect webhook handler onto a Hono app.
 *
 * Stripe Connect用WebhookハンドラをHonoアプリへ構築します。
 */
export const buildStripeWebhookConnect: StripeWorkerBuilder = require("./workers/stripe_webhook_connect");

/**
 * Build the 3D Secure redirect webhook handler onto a Hono app.
 *
 * 3DセキュアリダイレクトWebhookハンドラをHonoアプリへ構築します。
 */
export const buildStripeWebhookSecure: StripeWorkerBuilder = require("./workers/stripe_webhook_secure");
