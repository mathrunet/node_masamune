import Stripe from "stripe";
import { StripePurchaseStore } from "./interface";

/**
 * Synchronize the payment methods of a Stripe customer into the store
 * (parity with `syncStripePayment` in the Firebase implementation).
 *
 * Stripeカスタマーの支払い方法をストアへ同期します
 * （Firebase実装の`syncStripePayment`相当）。
 */
export async function syncStripePayment(options: {
    stripeClient: Stripe,
    store: StripePurchaseStore,
    userId: string,
    customerId: string,
}): Promise<void> {
    const { stripeClient, store, userId, customerId } = options;
    const customer = await stripeClient.customers.retrieve(
        customerId,
    ) as Stripe.Customer;
    let defaultSource = customer.invoice_settings.default_payment_method as string | null;
    const paymentMethods = await stripeClient.customers.listPaymentMethods(
        customerId,
        {
            type: "card",
        },
    );

    if (!defaultSource && paymentMethods.data.length > 0) {
        defaultSource = paymentMethods.data[0]?.id ?? null;
        if (defaultSource) {
            await stripeClient.customers.update(
                customerId,
                {
                    invoice_settings: {
                        default_payment_method: defaultSource,
                    },
                },
            );
        }
    }

    const payments = await store.listPayments(userId);

    for (const payment of payments) {
        const method = paymentMethods.data.find((m) => m.id == payment.data["id"]);
        if (!method) {
            await store.deletePayment(userId, payment.paymentId);
            continue;
        }
        const card = method.card;
        if (!card) {
            continue;
        }
        const isDefault = method.id == defaultSource;
        if (method.type === payment.data["type"] && card.exp_month === payment.data["expMonth"] && card.exp_year === payment.data["expYear"] && card.brand === payment.data["brand"] && card.last4 === payment.data["numberLast"] && isDefault === payment.data["default"]) {
            continue;
        }
        await store.savePayment(userId, payment.paymentId, {
            type: method.type,
            expMonth: card.exp_month,
            expYear: card.exp_year,
            brand: card.brand,
            numberLast: card.last4,
            default: isDefault,
        });
    }
    for (const method of paymentMethods.data) {
        const card = method.card;
        if (!card) {
            continue;
        }
        const existing = payments.find((item) => item.data["id"] == method.id);
        if (existing) {
            continue;
        }
        const uid = method.id;
        const isDefault = method.id == defaultSource;
        await store.savePayment(userId, uid, {
            "@uid": uid,
            "@time": new Date(),
            id: uid,
            type: method.type,
            expMonth: card.exp_month,
            expYear: card.exp_year,
            brand: card.brand,
            numberLast: card.last4,
            default: isDefault,
        });
    }

    await store.saveUser(userId, {
        defaultPayment: defaultSource ?? null,
    });
}
