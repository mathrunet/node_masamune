import { Hono } from "hono";
import { jsonError } from "@mathrunet/masamune_cloudflare";
import {
    resolveStripeClient,
    resolveStripePurchaseStore,
    resolveStripeSecretKey,
    resolveStripeWebhookSecret,
    StripePurchaseWorkersOptions,
} from "../lib/options";
import { constructStripeEvent } from "../lib/stripe_client";
import { syncStripePayment } from "../lib/purchase/sync_payment";
import {
    resolvePaymentIntentReceipt,
    resolveSubscriptionPurchaseFields,
} from "../lib/purchase/stripe_mapping";

/**
 * Receives and processes webhooks from Stripe (parity with the `stripeWebhook`
 * function of `@mathrunet/masamune_firebase_purchase_stripe`).
 * Please register the URL when you deploy this in your Stripe webhook settings.
 *
 * StripeからのWebhookを受け取り処理を行います
 * （`@mathrunet/masamune_firebase_purchase_stripe`の`stripeWebhook`と同等）。
 * こちらをデプロイした際のURLをStripeのWebhook設定に登録してください。
 *
 * @param {string} PURCHASE_STRIPE_SECRETKEY
 * API key (secret key) to connect to Stripe.
 * Stripeへ接続するためのAPIキー（シークレットキー）。
 *
 * @param {string} PURCHASE_STRIPE_WEBHOOKSECRET
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
            const webhookSecret = resolveStripeWebhookSecret(c, options);
            const store = resolveStripePurchaseStore(c, options);
            const stripeClient = resolveStripeClient(c, options, apiKey);
            const signature = c.req.header("stripe-signature");
            if (!signature || !webhookSecret) {
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
                    secret: webhookSecret,
                });
            } catch (err) {
                console.warn(err);
                return c.json({
                    "error": "Access denied.",
                }, 403);
            }

            switch (event.type) {
                case "payment_intent.requires_action":
                case "payment_intent.amount_capturable_updated": {
                    const payment = event.data.object as {
                        [key: string]: any
                    };
                    const purchaseId = payment["id"];
                    const customerId = payment["customer"];
                    const status = payment["status"];
                    if (!customerId) {
                        return c.json({
                            "error": "The customer id is not found.",
                        }, 404);
                    }
                    if (!status) {
                        return c.json({
                            "error": "The status is not found.",
                        }, 404);
                    }
                    const user = await store.findUserByCustomerId(customerId);
                    if (!user) {
                        return c.json({
                            "error": "The account data is not found.",
                        }, 404);
                    }
                    const purchase = await store.findPurchaseByPurchaseId(purchaseId);
                    if (!purchase) {
                        return c.json({
                            "error": "The purchase data is not found.",
                        }, 404);
                    }
                    const update: { [key: string]: any } = {};
                    switch (status) {
                        case "requires_payment_method":
                        case "requires_confirmation": {
                            update["confirm"] = false;
                            update["verify"] = false;
                            update["capture"] = false;
                            update["success"] = false;
                            break;
                        }
                        case "requires_action": {
                            update["confirm"] = true;
                            update["verify"] = false;
                            update["capture"] = false;
                            update["success"] = false;
                            break;
                        }
                        case "requires_capture": {
                            update["confirm"] = true;
                            update["verify"] = true;
                            update["capture"] = false;
                            update["success"] = false;
                            break;
                        }
                    }
                    update["updatedTime"] = new Date();
                    await store.savePurchase(purchase.orderId, update);
                    return c.json({
                        "success": true,
                    });
                }
                case "payment_intent.succeeded": {
                    const payment = event.data.object as {
                        [key: string]: any
                    };
                    const purchaseId = payment["id"];
                    const customerId = payment["customer"];
                    if (!customerId) {
                        return c.json({
                            "error": "The customer id is not found.",
                        }, 404);
                    }
                    const user = await store.findUserByCustomerId(customerId);
                    if (!user) {
                        return c.json({
                            "error": "The account data is not found.",
                        }, 404);
                    }
                    const purchase = await store.findPurchaseByPurchaseId(purchaseId);
                    if (!purchase) {
                        return c.json({
                            "error": "The purchase data is not found.",
                        }, 404);
                    }
                    const update: { [key: string]: any } = {};
                    update["confirm"] = true;
                    update["verify"] = true;
                    update["capture"] = true;
                    update["success"] = true;
                    update["error"] = null;
                    update["errorMessage"] = null;
                    update["updatedTime"] = new Date();

                    // `PaymentIntent.charges` no longer exists; resolve the receipt via `latest_charge`.
                    const receipt = await resolvePaymentIntentReceipt({
                        stripeClient,
                        paymentIntent: payment,
                    });
                    if (receipt.receiptUrl) {
                        update["receiptUrl"] = receipt.receiptUrl;
                    }
                    if (receipt.capturedAmount) {
                        update["capturedAmount"] = receipt.capturedAmount;
                    }
                    await store.savePurchase(purchase.orderId, update);
                    return c.json({
                        "success": true,
                    });
                }
                case "payment_intent.payment_failed": {
                    const payment = event.data.object as {
                        [key: string]: any
                    };
                    const purchaseId = payment["id"];
                    const customerId = payment["customer"];
                    const status = payment["status"];
                    if (!customerId) {
                        return c.json({
                            "error": "The customer id is not found.",
                        }, 404);
                    }
                    const user = await store.findUserByCustomerId(customerId);
                    if (!user) {
                        return c.json({
                            "error": "The account data is not found.",
                        }, 404);
                    }
                    const purchase = await store.findPurchaseByPurchaseId(purchaseId);
                    if (!purchase) {
                        return c.json({
                            "error": "The purchase data is not found.",
                        }, 404);
                    }
                    const errorMessage = payment["last_payment_error"]?.["message"];
                    const update: { [key: string]: any } = {};
                    switch (status) {
                        case "requires_payment_method":
                        case "requires_confirmation": {
                            update["confirm"] = false;
                            update["verify"] = false;
                            update["capture"] = false;
                            update["success"] = false;
                            break;
                        }
                        case "requires_action": {
                            update["confirm"] = true;
                            update["verify"] = false;
                            update["capture"] = false;
                            update["success"] = false;
                            break;
                        }
                        case "requires_capture": {
                            update["confirm"] = true;
                            update["verify"] = true;
                            update["capture"] = false;
                            update["success"] = false;
                            break;
                        }
                    }
                    update["updatedTime"] = new Date();
                    update["error"] = true;
                    update["errorMessage"] = errorMessage;
                    await store.savePurchase(purchase.orderId, update);
                    return c.json({
                        "success": true,
                    });
                }
                case "payment_method.detached":
                case "payment_method.updated": {
                    const payment = event.data.object as {
                        [key: string]: any
                    };
                    const previous = event.data.previous_attributes as {
                        [key: string]: any
                    };
                    let customerId = payment["customer"];
                    if (!customerId) {
                        customerId = previous?.["customer"];
                    }
                    if (!customerId) {
                        return c.json({
                            "error": "The customer id is not found.",
                        }, 404);
                    }
                    const user = await store.findUserByCustomerId(customerId);
                    if (!user) {
                        return c.json({
                            "error": "The account data is not found.",
                        }, 404);
                    }
                    await syncStripePayment({
                        stripeClient,
                        store,
                        userId: user.userId,
                        customerId,
                    });
                    return c.json({
                        "success": true,
                    });
                }
                case "customer.updated": {
                    const customer = event.data.object as {
                        [key: string]: any
                    };
                    const customerId = customer["id"];
                    if (!customerId) {
                        return c.json({
                            "error": "The customer id is not found.",
                        }, 404);
                    }
                    const user = await store.findUserByCustomerId(customerId);
                    if (!user) {
                        return c.json({
                            "error": "The account data is not found.",
                        }, 404);
                    }
                    await syncStripePayment({
                        stripeClient,
                        store,
                        userId: user.userId,
                        customerId,
                    });
                    return c.json({
                        "success": true,
                    });
                }
                case "checkout.session.completed": {
                    const session = event.data.object as {
                        [key: string]: any
                    };
                    const customerId = session["customer"];
                    if (!customerId) {
                        return c.json({
                            "error": "The customer id is not found.",
                        }, 404);
                    }
                    const setupIntent = session["setup_intent"];
                    if (!setupIntent) {
                        return c.json({
                            "error": "The setup intent is not found.",
                        }, 404);
                    }
                    const user = await store.findUserByCustomerId(customerId);
                    if (!user) {
                        return c.json({
                            "error": "The account data is not found.",
                        }, 404);
                    }
                    await store.saveUser(user.userId, {
                        setupIntent: session["setup_intent"],
                    });
                    await syncStripePayment({
                        stripeClient,
                        store,
                        userId: user.userId,
                        customerId,
                    });
                    return c.json({
                        "success": true,
                    });
                }
                case "customer.subscription.trial_will_end":
                case "customer.subscription.updated":
                case "customer.subscription.created": {
                    const now = new Date();
                    const update: { [key: string]: any } = {};
                    const subscription = event.data.object as {
                        [key: string]: any
                    };
                    const status = subscription["status"];
                    if (status != "active") {
                        return c.json({
                            "success": "Subscription is not active.",
                        });
                    }
                    // Since basil the period and price live on the subscription items.
                    const fields = resolveSubscriptionPurchaseFields(subscription);
                    const id = subscription["id"];
                    const userId = subscription["metadata"]?.["userId"] as string;
                    const orderId = (subscription["metadata"]?.["orderId"] as string) ?? id;

                    const existing = await store.findPurchaseBySubscriptionId(id);
                    const targetOrderId = existing?.orderId ?? orderId;
                    update["expired"] = fields.current_period_end !== null
                        ? now.getTime() >= fields.current_period_end * 1000
                        : false;
                    if (userId) {
                        update["user"] = userId;
                    }
                    update["@uid"] = orderId;
                    update["@time"] = new Date();
                    update["subscription"] = id;
                    update["application"] = subscription["application"];
                    update["application_fee_percent"] = subscription["application_fee_percent"];
                    update["cancel_at"] = subscription["cancel_at"];
                    update["cancel_at_period_end"] = subscription["cancel_at_period_end"];
                    update["canceled_at"] = subscription["canceled_at"];
                    update["collection_method"] = subscription["collection_method"];
                    update["currency"] = subscription["currency"];
                    update["current_period_start"] = fields.current_period_start;
                    update["current_period_end"] = fields.current_period_end;
                    update["customer"] = subscription["customer"];
                    update["default_payment_method"] = subscription["default_payment_method"];
                    update["ended_at"] = subscription["ended_at"];
                    update["latest_invoice"] = subscription["latest_invoice"];
                    update["price_id"] = fields.price_id;
                    update["active"] = fields.active;
                    update["amount"] = fields.amount;
                    update["billing_scheme"] = fields.billing_scheme;
                    update["interval"] = fields.interval;
                    update["interval_count"] = fields.interval_count;
                    update["usage_type"] = fields.usage_type;
                    update["quantity"] = fields.quantity;
                    update["start_date"] = subscription["start_date"];
                    console.log(`Subscription status is ${status}.`);
                    await store.savePurchase(targetOrderId, update, {
                        userId: userId || undefined,
                    });
                    return c.json({
                        "success": "Subscription is active.",
                    });
                }
                case "customer.subscription.deleted": {
                    const subscription = event.data.object as {
                        [key: string]: any
                    };
                    const status = subscription["status"];
                    const id = subscription["id"];
                    console.log(`Subscription status is ${status} expired.`);
                    const existing = id ? await store.findPurchaseBySubscriptionId(id) : null;
                    if (existing) {
                        await store.savePurchase(existing.orderId, {
                            expired: true,
                            ended_at: subscription["ended_at"],
                            canceled_at: subscription["canceled_at"],
                            "@time": new Date(),
                        });
                    }
                    return c.json({
                        "success": true,
                    });
                }
                default: {
                    return c.json({
                        "error": "Event is not found.",
                    }, 404);
                }
            }
        } catch (err) {
            return jsonError(c, err);
        }
    });
    return hono;
};
