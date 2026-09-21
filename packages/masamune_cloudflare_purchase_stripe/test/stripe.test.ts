import Stripe from "stripe";
import { Hono } from "hono";
import { StripePurchaseWorkersOptions } from "../src/lib/options";
import { MemoryPurchaseStore } from "./helpers/mem_store";

const buildStripe = require("../src/workers/stripe") as (
    hono: Hono,
    options: StripePurchaseWorkersOptions,
    data: { [key: string]: any },
) => Hono;

function buildApp(store: MemoryPurchaseStore, stripeStub: unknown): Hono {
    return buildStripe(new Hono(), {
        secretKey: "sk_test_dummy_secret_key_0123456789abcdef0123456789abcdef",
        store: () => store,
        stripeClient: () => stripeStub as Stripe,
    }, {});
}

async function post(app: Hono, body: { [key: string]: any }): Promise<Response> {
    return app.request("/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("stripe (mode actions)", () => {
    it("create_subscriptionがCheckout SessionのURLを返す", async () => {
        const created: any[] = [];
        const stripeStub = {
            checkout: {
                sessions: {
                    create: async (params: any) => {
                        created.push(params);
                        return { url: "https://checkout.stripe.com/test" };
                    },
                },
            },
        };
        const app = buildApp(new MemoryPurchaseStore(), stripeStub);

        const res = await post(app, {
            mode: "create_subscription",
            userId: "user_1",
            orderId: "order_1",
            productId: "price_test_1",
            successUrl: "https://example.com/ok",
            cancelUrl: "https://example.com/ng",
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ endpoint: "https://checkout.stripe.com/test" });
        expect(created[0]).toMatchObject({
            mode: "subscription",
            subscription_data: {
                metadata: { userId: "user_1", orderId: "order_1" },
            },
            line_items: [{ price: "price_test_1", quantity: 1 }],
        });
    });

    it("create_subscriptionは必須パラメータ欠如で400を返す", async () => {
        const app = buildApp(new MemoryPurchaseStore(), {});

        const res = await post(app, {
            mode: "create_subscription",
            userId: "user_1",
            orderId: "order_1",
        });

        expect(res.status).toBe(400);
    });

    it("delete_subscriptionがcancel_at_period_endを設定する", async () => {
        const updated: any[] = [];
        const stripeStub = {
            subscriptions: {
                update: async (id: string, params: any) => {
                    updated.push([id, params]);
                    return { cancel_at_period_end: true };
                },
            },
        };
        const store = new MemoryPurchaseStore();
        await store.savePurchase("order_1", { subscription: "sub_test_1", user: "user_1" });
        const app = buildApp(store, stripeStub);

        const res = await post(app, {
            mode: "delete_subscription",
            orderId: "order_1",
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });
        expect(updated[0]).toEqual(["sub_test_1", { cancel_at_period_end: true }]);
    });

    it("delete_subscriptionは購読が見つからなければ404を返す", async () => {
        const app = buildApp(new MemoryPurchaseStore(), {});

        const res = await post(app, {
            mode: "delete_subscription",
            orderId: "missing_order",
        });

        expect(res.status).toBe(404);
    });

    it("create_customer_and_paymentが新規カスタマーとsetupセッションを作る", async () => {
        const stripeStub = {
            customers: {
                create: async (params: any) => ({ id: "cus_new_1", ...params }),
            },
            checkout: {
                sessions: {
                    create: async (_params: any) => ({ url: "https://checkout.stripe.com/setup" }),
                },
            },
        };
        const store = new MemoryPurchaseStore();
        const app = buildApp(store, stripeStub);

        const res = await post(app, {
            mode: "create_customer_and_payment",
            userId: "user_1",
            successUrl: "https://example.com/ok",
            cancelUrl: "https://example.com/ng",
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            endpoint: "https://checkout.stripe.com/setup",
            customerId: "cus_new_1",
        });
        expect((await store.getUser("user_1"))?.data["customer"]).toBe("cus_new_1");
    });

    it("未知のmodeは404を返す", async () => {
        const app = buildApp(new MemoryPurchaseStore(), {});

        const res = await post(app, { mode: "unknown_mode" });

        expect(res.status).toBe(404);
    });
});
