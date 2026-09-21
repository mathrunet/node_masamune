import { Hono } from "hono";
import { jsonError } from "@mathrunet/masamune_cloudflare/dist/lib/src/http_error";
import {
    resolveStripeClient,
    resolveStripePurchaseStore,
    resolveStripeSecretKey,
    resolveStripeWebhookConnectSecret,
    StripePurchaseWorkersOptions,
} from "../lib/options";
import { constructStripeEvent } from "../lib/stripe_client";

/**
 * Receive and process webhooks for Stripe Connect (parity with the
 * `stripeWebhookConnect` function of
 * `@mathrunet/masamune_firebase_purchase_stripe`).
 * If you do not use Stripe Connect, do not configure it as a Webhook.
 *
 * Stripe Connect用のWebhookを受信して処理します
 * （`@mathrunet/masamune_firebase_purchase_stripe`の`stripeWebhookConnect`と同等）。
 * Stripe Connectを利用しない場合はWebhookとして設定しないでください。
 *
 * @param {string} PURCHASE_STRIPE_SECRETKEY
 * API key (secret key) to connect to Stripe.
 * Stripeへ接続するためのAPIキー（シークレットキー）。
 *
 * @param {string} PURCHASE_STRIPE_WEBHOOKCONNECTSECRET
 * Specify the **Signature Secret** after setting it up as a webhook.
 * Webhookとして設定したあとの**署名シークレット**を指定します。
 */
module.exports = (
    hono: Hono,
    options: StripePurchaseWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (c) => {
        try {
            const apiKey = resolveStripeSecretKey(c, options);
            const webhookConnectSecret = resolveStripeWebhookConnectSecret(c, options);
            const store = resolveStripePurchaseStore(c, options);
            const stripeClient = resolveStripeClient(c, options, apiKey);
            const signature = c.req.header("stripe-signature");
            if (!signature || !webhookConnectSecret) {
                return c.json({
                    "error": "Access denied.",
                }, 403);
            }
            const payload = await c.req.text();
            let event;
            try {
                event = await constructStripeEvent({
                    client: stripeClient,
                    payload,
                    signature,
                    secret: webhookConnectSecret,
                });
            } catch (err) {
                console.warn(err);
                return c.json({
                    "error": "Access denied.",
                }, 403);
            }

            switch (event.type) {
                case "account.updated": {
                    const account = event.data.object as {
                        [key: string]: any
                    };
                    const id = account["id"];
                    if (!id) {
                        return c.json({
                            "error": "The account id is not found.",
                        }, 404);
                    }
                    const user = await store.findUserByAccountId(id);
                    if (!user) {
                        return c.json({
                            "error": "The account data is not found.",
                        }, 404);
                    }
                    const update: { [key: string]: any } = {};
                    if (account["capabilities"]) {
                        const capability: { [key: string]: any } = {};
                        if (account["capabilities"]["card_payments"]) {
                            capability["card_payments"] = true;
                        }
                        if (account["capabilities"]["transfers"]) {
                            capability["transfers"] = true;
                        }
                        update["capability"] = capability;
                    }
                    await store.saveUser(user.userId, update);
                    return c.json({
                        "success": true,
                    });
                }
                default: {
                    return c.json({
                        "error": `Event ${event.type} is not found.`,
                    }, 404);
                }
            }
        } catch (err) {
            return jsonError(c, err);
        }
    });
    return hono;
};
