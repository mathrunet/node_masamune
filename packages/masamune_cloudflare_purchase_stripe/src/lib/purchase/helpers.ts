import Stripe from "stripe";
import { Context } from "hono";
import { HttpError } from "@mathrunet/masamune_cloudflare";
import { StripePurchaseWorkersOptions } from "../options";
import { StripePurchaseStore, StripeUserDocument } from "./interface";

/**
 * Resolve the default payment method of a user, following the same fallback
 * chain as the Firebase implementation: stored `defaultPayment` -> customer's
 * `invoice_settings.default_payment_method` -> first stored payment method.
 * The resolved value is saved back to the user document.
 *
 * Firebase実装と同じフォールバック連鎖でユーザーのデフォルト支払い方法を
 * 解決します: 保存済み`defaultPayment` → カスタマーの
 * `invoice_settings.default_payment_method` → 保存済み支払い方法の先頭。
 * 解決した値はユーザードキュメントへ書き戻します。
 */
export async function resolveDefaultPayment(options: {
    stripeClient: Stripe,
    store: StripePurchaseStore,
    user: StripeUserDocument,
}): Promise<string> {
    const { stripeClient, store, user } = options;
    let defaultPayment = user.data["defaultPayment"] as string | undefined;
    if (defaultPayment) {
        return defaultPayment;
    }
    const customer = await stripeClient.customers.retrieve(
        user.data["customer"],
    ) as Stripe.Customer;
    defaultPayment = (customer.invoice_settings.default_payment_method ?? undefined) as string | undefined;
    if (!defaultPayment) {
        const payments = await store.listPayments(user.userId);
        if (payments.length <= 0) {
            throw new HttpError(404, "The payment method is not found.");
        }
        defaultPayment = payments[0]?.data["id"] as string | undefined;
        if (!defaultPayment) {
            throw new HttpError(404, "The payment method is not found.");
        }
    }
    await store.saveUser(user.userId, { defaultPayment });
    return defaultPayment;
}

/**
 * Resolve the email address of a user (parity with `admin.auth().getUser()` in
 * the Firebase implementation): `options.resolveUserEmail` -> `email` field of
 * the user document -> billing details of the default payment method.
 *
 * ユーザーのメールアドレスを解決します（Firebase実装の
 * `admin.auth().getUser()`相当）: `options.resolveUserEmail` → ユーザー
 * ドキュメントの`email`フィールド → デフォルト支払い方法のbilling details。
 */
export async function resolveUserEmail(options: {
    context: Context,
    workersOptions: StripePurchaseWorkersOptions,
    stripeClient: Stripe,
    user: StripeUserDocument,
    defaultPayment?: string | undefined,
}): Promise<string> {
    const { context, workersOptions, stripeClient, user, defaultPayment } = options;
    let email = workersOptions.resolveUserEmail
        ? await workersOptions.resolveUserEmail(context, user.userId)
        : undefined;
    if (!email && typeof user.data["email"] === "string") {
        email = user.data["email"];
    }
    if (!email && defaultPayment) {
        const paymentMethod = await stripeClient.paymentMethods.retrieve(defaultPayment);
        email = paymentMethod?.billing_details?.email ?? undefined;
    }
    if (!email) {
        throw new HttpError(404, "The user's email is not found.");
    }
    return email;
}
