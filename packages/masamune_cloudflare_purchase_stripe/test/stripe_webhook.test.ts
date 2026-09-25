import Stripe from "stripe";
import { Hono } from "hono";
import { StripePurchaseWorkersOptions } from "../src/lib/options";
import { STRIPE_API_VERSION } from "../src/lib/stripe_client";
import { MemoryPurchaseStore } from "./helpers/mem_store";

const buildWebhook = require("../src/workers/stripe_webhook") as (
    hono: Hono,
    options: StripePurchaseWorkersOptions,
    data: { [key: string]: any },
) => Hono;

const WEBHOOK_SECRET = "whsec_test_secret";
const stripeForSigning = new Stripe("sk_test_dummy", {
    apiVersion: STRIPE_API_VERSION,
});

const NOW = Math.floor(Date.now() / 1000);
const PERIOD_START = NOW - 60;
const PERIOD_END = NOW + 86400 * 30;

function subscriptionObject(overrides: { [key: string]: any } = {}): { [key: string]: any } {
    return {
        id: "sub_test_1",
        object: "subscription",
        status: "active",
        customer: "cus_test_1",
        cancel_at: null,
        cancel_at_period_end: false,
        canceled_at: null,
        collection_method: "charge_automatically",
        currency: "jpy",
        default_payment_method: "pm_test_1",
        ended_at: null,
        latest_invoice: "in_test_1",
        start_date: PERIOD_START,
        application: null,
        application_fee_percent: null,
        metadata: {
            userId: "user_1",
            orderId: "order_1",
        },
        items: {
            object: "list",
            data: [
                {
                    id: "si_test_1",
                    object: "subscription_item",
                    current_period_start: PERIOD_START,
                    current_period_end: PERIOD_END,
                    quantity: 1,
                    price: {
                        id: "price_test_1",
                        object: "price",
                        active: true,
                        unit_amount: 500,
                        billing_scheme: "per_unit",
                        recurring: {
                            interval: "month",
                            interval_count: 1,
                            usage_type: "licensed",
                        },
                    },
                },
            ],
        },
        ...overrides,
    };
}

function eventPayload(type: string, object: { [key: string]: any }, apiVersion: string = STRIPE_API_VERSION): string {
    return JSON.stringify({
        id: "evt_test_1",
        object: "event",
        api_version: apiVersion,
        type,
        data: {
            object,
        },
    });
}

function subscriptionEvent(type: string, overrides: { [key: string]: any } = {}): string {
    return eventPayload(type, subscriptionObject(overrides));
}

function sign(payload: string, secret: string = WEBHOOK_SECRET): string {
    return stripeForSigning.webhooks.generateTestHeaderString({
        payload,
        secret,
    });
}

function buildApp(store: MemoryPurchaseStore, stripeClient: unknown = stripeForSigning): Hono {
    return buildWebhook(new Hono(), {
        secretKey: "sk_test_dummy",
        webhookSecret: WEBHOOK_SECRET,
        store: () => store,
        stripeClient: () => stripeClient as Stripe,
    }, {});
}

async function post(app: Hono, payload: string, signature: string | null): Promise<Response> {
    const headers: { [key: string]: string } = {
        "content-type": "application/json",
    };
    if (signature) {
        headers["stripe-signature"] = signature;
    }
    return app.request("/", {
        method: "POST",
        headers,
        body: payload,
    });
}

describe("stripeWebhook", () => {
    it("正しい署名のcustomer.subscription.createdで購入レコードを保存する", async () => {
        const store = new MemoryPurchaseStore();
        const app = buildApp(store);
        const payload = subscriptionEvent("customer.subscription.created");

        const res = await post(app, payload, sign(payload));

        expect(res.status).toBe(200);
        const purchase = await store.getPurchase("order_1");
        expect(purchase).not.toBeNull();
        expect(purchase?.userId).toBe("user_1");
        expect(purchase?.data).toMatchObject({
            subscription: "sub_test_1",
            price_id: "price_test_1",
            active: true,
            amount: 500,
            billing_scheme: "per_unit",
            interval: "month",
            interval_count: 1,
            usage_type: "licensed",
            quantity: 1,
            current_period_start: PERIOD_START,
            current_period_end: PERIOD_END,
            expired: false,
            customer: "cus_test_1",
        });
        expect((await store.findPurchaseBySubscriptionId("sub_test_1"))?.orderId).toBe("order_1");
    });

    it("サブスクリプションアイテムの期間が終了していればexpiredをtrueにする", async () => {
        const store = new MemoryPurchaseStore();
        const app = buildApp(store);
        const base = subscriptionObject();
        base["items"]["data"][0]["current_period_start"] = NOW - 86400 * 31;
        base["items"]["data"][0]["current_period_end"] = NOW - 60;
        const payload = eventPayload("customer.subscription.updated", base);

        const res = await post(app, payload, sign(payload));

        expect(res.status).toBe(200);
        const purchase = await store.getPurchase("order_1");
        expect(purchase?.data["expired"]).toBe(true);
        expect(purchase?.data["current_period_end"]).toBe(NOW - 60);
    });

    it("旧APIバージョン（acacia）のペイロードではトップレベルのperiodとplanにフォールバックする", async () => {
        const store = new MemoryPurchaseStore();
        const app = buildApp(store);
        const legacy = subscriptionObject({
            current_period_start: PERIOD_START,
            current_period_end: PERIOD_END,
            quantity: 2,
            plan: {
                id: "price_legacy_1",
                active: true,
                amount: 800,
                billing_scheme: "per_unit",
                interval: "year",
                interval_count: 1,
                usage_type: "licensed",
            },
            items: {
                object: "list",
                data: [],
            },
        });
        const payload = eventPayload("customer.subscription.created", legacy, "2025-02-24.acacia");

        const res = await post(app, payload, sign(payload));

        expect(res.status).toBe(200);
        expect((await store.getPurchase("order_1"))?.data).toMatchObject({
            price_id: "price_legacy_1",
            amount: 800,
            interval: "year",
            quantity: 2,
            current_period_start: PERIOD_START,
            current_period_end: PERIOD_END,
            expired: false,
        });
    });

    it("payment_intent.succeededでlatest_chargeを取得してreceiptUrlとcapturedAmountを保存する", async () => {
        const store = new MemoryPurchaseStore();
        await store.saveUser("user_1", { customer: "cus_test_1" });
        await store.savePurchase("order_pi_1", {
            purchaseId: "pi_test_1",
            user: "user_1",
            success: false,
        });
        const retrieve = jest.fn(async (id: string) => ({
            id,
            object: "charge",
            receipt_url: "https://pay.stripe.com/receipts/test",
            amount_captured: 1200,
        }));
        const stripeStub = {
            webhooks: stripeForSigning.webhooks,
            charges: { retrieve },
        };
        const app = buildApp(store, stripeStub);
        const payload = eventPayload("payment_intent.succeeded", {
            id: "pi_test_1",
            object: "payment_intent",
            customer: "cus_test_1",
            status: "succeeded",
            latest_charge: "ch_test_1",
        });

        const res = await post(app, payload, sign(payload));

        expect(res.status).toBe(200);
        expect(retrieve).toHaveBeenCalledWith("ch_test_1");
        expect((await store.getPurchase("order_pi_1"))?.data).toMatchObject({
            success: true,
            capture: true,
            receiptUrl: "https://pay.stripe.com/receipts/test",
            capturedAmount: 1200,
        });
    });

    it("latest_chargeの取得に失敗しても購入の成功は保存する", async () => {
        const store = new MemoryPurchaseStore();
        await store.saveUser("user_1", { customer: "cus_test_1" });
        await store.savePurchase("order_pi_1", {
            purchaseId: "pi_test_1",
            user: "user_1",
            success: false,
        });
        const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
        const stripeStub = {
            webhooks: stripeForSigning.webhooks,
            charges: {
                retrieve: jest.fn(async () => {
                    throw new Error("No such charge");
                }),
            },
        };
        const app = buildApp(store, stripeStub);
        const payload = eventPayload("payment_intent.succeeded", {
            id: "pi_test_1",
            object: "payment_intent",
            customer: "cus_test_1",
            status: "succeeded",
            latest_charge: "ch_missing",
        });

        const res = await post(app, payload, sign(payload));
        warn.mockRestore();

        expect(res.status).toBe(200);
        const data = (await store.getPurchase("order_pi_1"))?.data;
        expect(data?.["success"]).toBe(true);
        expect(data?.["receiptUrl"]).toBeUndefined();
        expect(data?.["capturedAmount"]).toBeUndefined();
    });

    it("activeでないサブスクリプションは保存せず200を返す", async () => {
        const store = new MemoryPurchaseStore();
        const app = buildApp(store);
        const payload = subscriptionEvent("customer.subscription.updated", { status: "incomplete" });
        const res = await post(app, payload, sign(payload));

        expect(res.status).toBe(200);
        expect(await store.getPurchase("order_1")).toBeNull();
    });

    it("customer.subscription.deletedで購読レコードをexpiredにする", async () => {
        const store = new MemoryPurchaseStore();
        await store.savePurchase("order_1", {
            subscription: "sub_test_1",
            expired: false,
            user: "user_1",
        });
        const app = buildApp(store);
        const payload = subscriptionEvent("customer.subscription.deleted", {
            status: "canceled",
            ended_at: Math.floor(Date.now() / 1000),
            canceled_at: Math.floor(Date.now() / 1000),
        });
        const res = await post(app, payload, sign(payload));

        expect(res.status).toBe(200);
        expect((await store.getPurchase("order_1"))?.data["expired"]).toBe(true);
    });

    it("署名が不正なら403で何も保存しない", async () => {
        const store = new MemoryPurchaseStore();
        const app = buildApp(store);
        const payload = subscriptionEvent("customer.subscription.created");
        const res = await post(app, payload, sign(payload, "whsec_wrong_secret"));

        expect(res.status).toBe(403);
        expect(store.purchases.size).toBe(0);
    });

    it("署名ヘッダがなければ403を返す", async () => {
        const store = new MemoryPurchaseStore();
        const app = buildApp(store);

        const res = await post(app, subscriptionEvent("customer.subscription.created"), null);

        expect(res.status).toBe(403);
    });
});
