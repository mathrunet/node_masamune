import Stripe from "stripe";
import { Hono } from "hono";
import { StripePurchaseWorkersOptions } from "../src/lib/options";
import { MemoryPurchaseStore } from "./helpers/mem_store";

const buildWebhook = require("../src/workers/stripe_webhook") as (
    hono: Hono,
    options: StripePurchaseWorkersOptions,
    data: { [key: string]: any },
) => Hono;

const WEBHOOK_SECRET = "whsec_test_secret";
const stripeForSigning = new Stripe("sk_test_dummy", {
    apiVersion: "2025-02-24.acacia",
});

function subscriptionEvent(type: string, overrides: { [key: string]: any } = {}): string {
    return JSON.stringify({
        id: "evt_test_1",
        object: "event",
        api_version: "2025-02-24.acacia",
        type,
        data: {
            object: {
                id: "sub_test_1",
                object: "subscription",
                status: "active",
                customer: "cus_test_1",
                current_period_start: Math.floor(Date.now() / 1000) - 60,
                current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
                cancel_at: null,
                cancel_at_period_end: false,
                canceled_at: null,
                collection_method: "charge_automatically",
                currency: "jpy",
                default_payment_method: "pm_test_1",
                ended_at: null,
                latest_invoice: "in_test_1",
                quantity: 1,
                start_date: Math.floor(Date.now() / 1000) - 60,
                application: null,
                application_fee_percent: null,
                metadata: {
                    userId: "user_1",
                    orderId: "order_1",
                },
                plan: {
                    id: "price_test_1",
                    active: true,
                    amount: 500,
                    billing_scheme: "per_unit",
                    interval: "month",
                    interval_count: 1,
                    usage_type: "licensed",
                },
                ...overrides,
            },
        },
    });
}

function buildApp(store: MemoryPurchaseStore): Hono {
    return buildWebhook(new Hono(), {
        secretKey: "sk_test_dummy",
        webhookSecret: WEBHOOK_SECRET,
        store: () => store,
        stripeClient: () => stripeForSigning,
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
        const signature = stripeForSigning.webhooks.generateTestHeaderString({
            payload,
            secret: WEBHOOK_SECRET,
        });

        const res = await post(app, payload, signature);

        expect(res.status).toBe(200);
        const purchase = await store.getPurchase("order_1");
        expect(purchase).not.toBeNull();
        expect(purchase?.userId).toBe("user_1");
        expect(purchase?.data).toMatchObject({
            subscription: "sub_test_1",
            price_id: "price_test_1",
            amount: 500,
            interval: "month",
            expired: false,
            customer: "cus_test_1",
        });
        expect((await store.findPurchaseBySubscriptionId("sub_test_1"))?.orderId).toBe("order_1");
    });

    it("activeでないサブスクリプションは保存せず200を返す", async () => {
        const store = new MemoryPurchaseStore();
        const app = buildApp(store);
        const payload = subscriptionEvent("customer.subscription.updated", { status: "incomplete" });
        const signature = stripeForSigning.webhooks.generateTestHeaderString({
            payload,
            secret: WEBHOOK_SECRET,
        });

        const res = await post(app, payload, signature);

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
        const signature = stripeForSigning.webhooks.generateTestHeaderString({
            payload,
            secret: WEBHOOK_SECRET,
        });

        const res = await post(app, payload, signature);

        expect(res.status).toBe(200);
        expect((await store.getPurchase("order_1"))?.data["expired"]).toBe(true);
    });

    it("署名が不正なら403で何も保存しない", async () => {
        const store = new MemoryPurchaseStore();
        const app = buildApp(store);
        const payload = subscriptionEvent("customer.subscription.created");
        const signature = stripeForSigning.webhooks.generateTestHeaderString({
            payload,
            secret: "whsec_wrong_secret",
        });

        const res = await post(app, payload, signature);

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
