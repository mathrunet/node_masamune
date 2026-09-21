import { Hono } from "hono";
import { jsonError } from "@mathrunet/masamune_cloudflare/dist/lib/src/http_error";
import "@mathrunet/masamune";
import {
    resolveStripeClient,
    resolveStripePurchaseStore,
    resolveStripeSecretKey,
    StripePurchaseWorkersOptions,
} from "../lib/options";

/**
 * Webhook for proper redirection when 3D Secure authentication is required
 * (parity with the `stripeWebhookSecure` function of
 * `@mathrunet/masamune_firebase_purchase_stripe`).
 * Please set here for `returnUrl`.
 *
 * 3Dセキュア認証が必要な場合、適切なリダイレクトを行うためのWebhookです
 * （`@mathrunet/masamune_firebase_purchase_stripe`の`stripeWebhookSecure`と同等）。
 * `returnUrl`にこちらを設定してください。
 *
 * @param {string} PURCHASE_STRIPE_SECRETKEY
 * API key (secret key) to connect to Stripe.
 * Stripeへ接続するためのAPIキー（シークレットキー）。
 */
module.exports = (
    hono: Hono,
    options: StripePurchaseWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.get("/", async (c) => {
        try {
            const apiKey = resolveStripeSecretKey(c, options);
            const store = resolveStripePurchaseStore(c, options);
            const stripeClient = resolveStripeClient(c, options, apiKey);
            const token = c.req.query("token");
            if (!token || typeof token !== "string") {
                return c.json({
                    "error": "Invalid parameters",
                }, 403);
            }
            let param: { [key: string]: any };
            try {
                param = JSON.parse(await token.decrypt({
                    key: apiKey.slice(0, 32),
                    ivKey: apiKey.slice(-16),
                }));
            } catch (err) {
                return c.json({
                    "error": "Invalid parameters",
                }, 403);
            }
            if (!param["userId"] || !param["orderId"] || !param["successUrl"] || !param["failureUrl"]) {
                return c.json({
                    "error": "Invalid parameters",
                }, 403);
            }

            const userId = param["userId"];
            const orderId = param["orderId"];
            const successUrl = param["successUrl"];
            const failureUrl = param["failureUrl"];

            const purchaseDoc = await store.getPurchase(orderId, userId);
            // Firebase実装は`paymentId`を参照するが、購入作成時に保存されるキーは
            // `purchaseId`のためそちらを正とし、`paymentId`はフォールバックに残す。
            const purchaseId = purchaseDoc?.data["purchaseId"] ?? purchaseDoc?.data["paymentId"];
            if (!purchaseDoc || !purchaseId) {
                return c.json({
                    "error": "The purchase data is not found.",
                }, 404);
            }
            const purchase = await stripeClient.paymentIntents.retrieve(
                purchaseId,
            );
            if (!purchase) {
                return c.json({
                    "error": "The purchase data is not found.",
                }, 404);
            }
            const status = purchase.status;
            if (status === "requires_capture" || status === "succeeded" || status === "processing") {
                return c.redirect(successUrl);
            } else {
                return c.redirect(failureUrl);
            }
        } catch (err) {
            return jsonError(c, err);
        }
    });
    return hono;
};
