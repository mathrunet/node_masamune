import Stripe from "stripe";
import {
    STRIPE_API_VERSION,
    createStripeClient,
    resolvePaymentIntentReceipt,
    resolveSubscriptionPurchaseFields,
} from "../../src/lib/stripe";

describe("Stripe lib", () => {
    it("pins the dahlia API version", () => {
        expect(STRIPE_API_VERSION).toBe("2026-08-26.dahlia");
        const client = createStripeClient("sk_test_dummy");
        expect(client.getApiField("version")).toBe(STRIPE_API_VERSION);
        expect(typeof client.webhooks.constructEvent).toBe("function");
    });

    it("maps period and price from subscription items", () => {
        expect(resolveSubscriptionPurchaseFields({
            items: {
                data: [{
                    current_period_start: 100,
                    current_period_end: 200,
                    quantity: 1,
                    price: {
                        id: "price_1",
                        active: true,
                        unit_amount: 500,
                        billing_scheme: "per_unit",
                        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
                    },
                }],
            },
        })).toEqual({
            current_period_start: 100,
            current_period_end: 200,
            price_id: "price_1",
            active: true,
            amount: 500,
            billing_scheme: "per_unit",
            interval: "month",
            interval_count: 1,
            usage_type: "licensed",
            quantity: 1,
        });
    });

    it("falls back to legacy top-level fields and returns null when missing", () => {
        expect(resolveSubscriptionPurchaseFields({
            current_period_end: 300,
            quantity: 2,
            plan: { id: "plan_1", amount: 800, interval: "year" },
        })).toMatchObject({
            current_period_start: null,
            current_period_end: 300,
            price_id: "plan_1",
            amount: 800,
            interval: "year",
            quantity: 2,
        });
    });

    it("retrieves latest_charge for the receipt", async () => {
        const retrieve = jest.fn(async () => ({
            receipt_url: "https://pay.stripe.com/receipts/1",
            amount_captured: 1000,
        }));
        const receipt = await resolvePaymentIntentReceipt({
            stripeClient: { charges: { retrieve } } as unknown as Stripe,
            paymentIntent: { latest_charge: "ch_1" },
        });
        expect(retrieve).toHaveBeenCalledWith("ch_1");
        expect(receipt).toEqual({
            receiptUrl: "https://pay.stripe.com/receipts/1",
            capturedAmount: 1000,
        });
    });
});
