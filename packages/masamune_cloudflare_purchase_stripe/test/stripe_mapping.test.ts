import Stripe from "stripe";
import {
    resolvePaymentIntentReceipt,
    resolveSubscriptionPeriod,
    resolveSubscriptionPurchaseFields,
} from "../src/lib/purchase/stripe_mapping";

function stripeStub(retrieve: (id: string) => Promise<unknown>): Stripe {
    return { charges: { retrieve } } as unknown as Stripe;
}

describe("resolveSubscriptionPeriod", () => {
    it("アイテム間で最も早い開始と最も遅い終了を返す", () => {
        const period = resolveSubscriptionPeriod({
            items: {
                data: [
                    { current_period_start: 200, current_period_end: 900 },
                    { current_period_start: 100, current_period_end: 1200 },
                ],
            },
        });
        expect(period).toEqual({ start: 100, end: 1200 });
    });

    it("アイテムに期間が無ければトップレベルの旧フィールドにフォールバックする", () => {
        const period = resolveSubscriptionPeriod({
            current_period_start: 10,
            current_period_end: 20,
            items: { data: [{ id: "si_1" }] },
        });
        expect(period).toEqual({ start: 10, end: 20 });
    });

    it("期間が取得できなければInvalid Dateではなくnullを返す", () => {
        expect(resolveSubscriptionPeriod({ items: { data: [] } })).toEqual({ start: null, end: null });
        expect(resolveSubscriptionPeriod({ current_period_end: "x" })).toEqual({ start: null, end: null });
    });
});

describe("resolveSubscriptionPurchaseFields", () => {
    it("items.data[0].priceから従来と同じフィールド名で値を構築する", () => {
        const fields = resolveSubscriptionPurchaseFields({
            items: {
                data: [
                    {
                        current_period_start: 100,
                        current_period_end: 200,
                        quantity: 3,
                        price: {
                            id: "price_1",
                            active: true,
                            unit_amount: 1500,
                            billing_scheme: "tiered",
                            recurring: {
                                interval: "week",
                                interval_count: 2,
                                usage_type: "metered",
                            },
                        },
                    },
                ],
            },
        });
        expect(fields).toEqual({
            current_period_start: 100,
            current_period_end: 200,
            price_id: "price_1",
            active: true,
            amount: 1500,
            billing_scheme: "tiered",
            interval: "week",
            interval_count: 2,
            usage_type: "metered",
            quantity: 3,
        });
    });

    it("priceが無ければitems.data[0].plan、次にsubscription.planへフォールバックする", () => {
        const fromItemPlan = resolveSubscriptionPurchaseFields({
            items: {
                data: [{
                    plan: {
                        id: "plan_item",
                        active: false,
                        amount: 300,
                        billing_scheme: "per_unit",
                        interval: "day",
                        interval_count: 7,
                        usage_type: "licensed",
                    },
                }],
            },
        });
        expect(fromItemPlan).toMatchObject({
            price_id: "plan_item",
            active: false,
            amount: 300,
            interval: "day",
            interval_count: 7,
        });

        const fromLegacy = resolveSubscriptionPurchaseFields({
            quantity: 4,
            plan: { id: "plan_legacy", amount: 700, interval: "month" },
        });
        expect(fromLegacy).toMatchObject({
            price_id: "plan_legacy",
            amount: 700,
            interval: "month",
            quantity: 4,
        });
    });

    it("何も無ければ全フィールドnullを返す", () => {
        expect(resolveSubscriptionPurchaseFields({})).toEqual({
            current_period_start: null,
            current_period_end: null,
            price_id: null,
            active: null,
            amount: null,
            billing_scheme: null,
            interval: null,
            interval_count: null,
            usage_type: null,
            quantity: null,
        });
    });
});

describe("resolvePaymentIntentReceipt", () => {
    it("latest_chargeがIDならチャージを取得する", async () => {
        const retrieve = jest.fn(async () => ({
            receipt_url: "https://pay.stripe.com/receipts/1",
            amount_captured: 1000,
        }));
        const receipt = await resolvePaymentIntentReceipt({
            stripeClient: stripeStub(retrieve),
            paymentIntent: { id: "pi_1", latest_charge: "ch_1" },
        });
        expect(retrieve).toHaveBeenCalledWith("ch_1");
        expect(receipt).toEqual({
            receiptUrl: "https://pay.stripe.com/receipts/1",
            capturedAmount: 1000,
        });
    });

    it("展開済みのlatest_chargeはAPIを呼ばずにそのまま使う", async () => {
        const retrieve = jest.fn();
        const receipt = await resolvePaymentIntentReceipt({
            stripeClient: stripeStub(retrieve),
            paymentIntent: {
                latest_charge: { id: "ch_2", receipt_url: "https://r/2", amount_captured: 50 },
            },
        });
        expect(retrieve).not.toHaveBeenCalled();
        expect(receipt).toEqual({ receiptUrl: "https://r/2", capturedAmount: 50 });
    });

    it("latest_chargeが無ければ旧charges.data[0]にフォールバックする", async () => {
        const retrieve = jest.fn();
        const receipt = await resolvePaymentIntentReceipt({
            stripeClient: stripeStub(retrieve),
            paymentIntent: {
                latest_charge: null,
                charges: { data: [{ receipt_url: "https://r/legacy", amount_captured: 70 }] },
            },
        });
        expect(retrieve).not.toHaveBeenCalled();
        expect(receipt).toEqual({ receiptUrl: "https://r/legacy", capturedAmount: 70 });
    });

    it("取得に失敗したらnullを返し例外を投げない", async () => {
        const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
        const receipt = await resolvePaymentIntentReceipt({
            stripeClient: stripeStub(async () => {
                throw new Error("boom");
            }),
            paymentIntent: { latest_charge: "ch_x" },
        });
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
        expect(receipt).toEqual({ receiptUrl: null, capturedAmount: null });
    });
});
