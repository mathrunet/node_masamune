import Stripe from "stripe";
import { Hono } from "hono";
import { HttpError, jsonError } from "@mathrunet/masamune_cloudflare/dist/lib/src/http_error";
import "@mathrunet/masamune";
import {
    resolveStripeClient,
    resolveStripeEmailSender,
    resolveStripePurchaseStore,
    resolveStripeSecretKey,
    StripePurchaseWorkersOptions,
} from "../lib/options";
import { resolveDefaultPayment, resolveUserEmail } from "../lib/purchase/helpers";

/**
 * Performs various Stripe processes (parity with the `stripe` function of
 * `@mathrunet/masamune_firebase_purchase_stripe`).
 *
 * POST a JSON body with a `mode` and the parameters of that mode. Purchase and
 * user data are stored through [StripePurchaseStore] (D1 by default).
 *
 * Stripeの各種処理を実行します（`@mathrunet/masamune_firebase_purchase_stripe`の
 * `stripe`ファンクションと同等）。
 *
 * `mode`とそのモードのパラメーターを持つJSONボディをPOSTします。購入・ユーザー
 * データは[StripePurchaseStore]（デフォルトはD1）を通して保存されます。
 *
 * @param {string} PURCHASE_STRIPE_SECRETKEY
 * API key (secret key) to connect to Stripe.
 * Stripeへ接続するためのAPIキー（シークレットキー）。
 *
 * @param {string} PURCHASE_STRIPE_EMAILPROVIDER
 * Mail provider when sending mail. (sendgrid)
 * メールを送信する際のメールプロバイダー。（sendgrid）
 *
 * @param {string} mode
 * [required]
 * Specifies the mode in which Stripe will run.
 * Stripeの実行するモードを指定します。
 *
 * - create_account / delete_account / get_account / dashboard_account
 * - create_customer_and_payment / set_customer_default_payment / delete_payment / delete_customer
 * - authorization / confirm_authorization
 * - create_purchase / confirm_purchase / capture_purchase / refresh_purchase / cancel_purchase / refund_purchase
 * - create_subscription / delete_subscription
 */
module.exports = (
    hono: Hono,
    options: StripePurchaseWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (c) => {
        try {
            const apiKey = resolveStripeSecretKey(c, options);
            if (!apiKey) {
                throw new HttpError(500, "The Stripe secret key is not configured.");
            }
            const store = resolveStripePurchaseStore(c, options);
            const sendEmail = resolveStripeEmailSender(c, options);
            const stripeClient = resolveStripeClient(c, options, apiKey);
            const query = await c.req.json().catch(() => ({})) as { [key: string]: any };
            switch (query.mode) {
                case "create_account": {
                    const userId = query.userId;
                    const locale = query.locale;
                    const refreshUrl = query.refreshUrl;
                    const returnUrl = query.returnUrl;
                    if (!locale) {
                        throw new HttpError(400, "The locale is empty.");
                    }
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const country = locale.split("_")[1];
                    const user = await store.getUser(userId);
                    if (!user || !user.data["account"]) {
                        const account = await stripeClient.accounts.create({
                            type: "express",
                            country: country ?? "JP",
                        });
                        await store.saveUser(userId, {
                            "@uid": userId,
                            "@time": new Date(),
                            user: userId,
                            account: account.id,
                        });
                        const endpoint = await stripeClient.accountLinks.create({
                            type: "account_onboarding",
                            account: account.id,
                            refresh_url: refreshUrl,
                            return_url: returnUrl,
                        });
                        return c.json({
                            next: "registration",
                            endpoint: endpoint.url,
                            accountId: account.id,
                        });
                    } else {
                        if (user.data["capability"] && user.data["capability"]["transfers"]) {
                            return c.json({
                                next: "none",
                            });
                        }
                        const res = await stripeClient.accounts.retrieve(user.data["account"]);
                        if (res.capabilities && res.capabilities.transfers === "active") {
                            await store.saveUser(userId, {
                                capability: {
                                    transfers: true,
                                },
                            });
                            return c.json({
                                next: "none",
                            });
                        } else {
                            const endpoint = await stripeClient.accountLinks.create({
                                type: "account_onboarding",
                                account: user.data["account"],
                                refresh_url: refreshUrl,
                                return_url: returnUrl,
                            });
                            return c.json({
                                next: "registration",
                                endpoint: endpoint.url,
                                accountId: user.data["account"],
                            });
                        }
                    }
                }
                case "delete_account": {
                    const userId = query.userId;
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const user = await store.getUser(userId);
                    if (!user || !user.data["account"]) {
                        throw new HttpError(404, "Account id is not found.");
                    }
                    await stripeClient.accounts.del(user.data["account"]);
                    await store.saveUser(userId, {
                        account: null,
                        capability: null,
                    });
                    return c.json({
                        success: true,
                    });
                }
                case "get_account": {
                    const userId = query.userId;
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const user = await store.getUser(userId);
                    if (!user || !user.data["account"]) {
                        throw new HttpError(404, "Account id is not found.");
                    }
                    const res = await stripeClient.accounts.retrieve(user.data["account"]);
                    return c.json(res);
                }
                case "dashboard_account": {
                    const userId = query.userId;
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const user = await store.getUser(userId);
                    if (!user || !user.data["account"]) {
                        throw new HttpError(404, "Account id is not found.");
                    }
                    const res = await stripeClient.accounts.createLoginLink(user.data["account"]);
                    return c.json({
                        endpoint: res.url,
                    });
                }
                case "create_customer_and_payment": {
                    const userId = query.userId;
                    const successUrl = query.successUrl;
                    const cancelUrl = query.cancelUrl;
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const user = await store.getUser(userId);
                    if (!user || !user.data["customer"]) {
                        let email: string | null | undefined = options.resolveUserEmail
                            ? await options.resolveUserEmail(c, userId)
                            : undefined;
                        if (!email && user && typeof user.data["email"] === "string") {
                            email = user.data["email"];
                        }
                        const customer = await stripeClient.customers.create({
                            metadata: {
                                "user_id": userId,
                            },
                            email: email ?? undefined,
                        });
                        await store.saveUser(userId, {
                            "@uid": userId,
                            "@time": new Date(),
                            user: userId,
                            customer: customer.id,
                        });
                        const session = await stripeClient.checkout.sessions.create({
                            payment_method_types: ["card"],
                            mode: "setup",
                            customer: customer.id,
                            success_url: successUrl,
                            cancel_url: cancelUrl,
                            metadata: {
                                "user_id": userId,
                            },
                        });
                        return c.json({
                            endpoint: session.url,
                            customerId: customer.id,
                        });
                    } else {
                        const session = await stripeClient.checkout.sessions.create({
                            payment_method_types: ["card"],
                            mode: "setup",
                            customer: user.data["customer"],
                            success_url: successUrl,
                            cancel_url: cancelUrl,
                        });
                        return c.json({
                            endpoint: session.url,
                            customerId: user.data["customer"],
                        });
                    }
                }
                case "set_customer_default_payment": {
                    const userId = query.userId;
                    const paymentId = query.paymentId;
                    if (!paymentId) {
                        throw new HttpError(400, "The payment id is empty.");
                    }
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const user = await store.getUser(userId);
                    if (!user || !user.data["customer"]) {
                        throw new HttpError(404, "The customer is empty.");
                    }
                    const payments = await store.listPayments(userId);
                    const payment = payments.find((item) => item.paymentId === paymentId);
                    if (!payment || !payment.data["id"]) {
                        throw new HttpError(404, "The payment method is empty.");
                    }
                    await stripeClient.customers.update(
                        user.data["customer"],
                        {
                            invoice_settings: {
                                default_payment_method: payment.data["id"],
                            },
                        },
                    );
                    if (user.data["defaultPayment"] !== payment.data["id"]) {
                        await store.saveUser(userId, {
                            defaultPayment: payment.data["id"],
                        });
                    }
                    return c.json({
                        success: true,
                    });
                }
                case "delete_payment": {
                    const userId = query.userId;
                    const paymentId = query.paymentId;
                    if (!paymentId) {
                        throw new HttpError(400, "The payment id is empty.");
                    }
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const user = await store.getUser(userId);
                    if (!user || !user.data["customer"]) {
                        throw new HttpError(404, "The customer is empty.");
                    }
                    const payments = await store.listPayments(userId);
                    const payment = payments.find((item) => item.paymentId === paymentId);
                    if (!payment || !payment.data["id"]) {
                        throw new HttpError(404, "The payment method is empty.");
                    }
                    await stripeClient.paymentMethods.detach(
                        payment.data["id"],
                    );
                    if (user.data["defaultPayment"] === payment.data["id"]) {
                        await store.saveUser(userId, {
                            defaultPayment: null,
                        });
                    }
                    return c.json({
                        success: true,
                    });
                }
                case "delete_customer": {
                    const userId = query.userId;
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const user = await store.getUser(userId);
                    if (!user || !user.data["customer"]) {
                        throw new HttpError(404, "Customer id is not found.");
                    }
                    await stripeClient.customers.del(user.data["customer"]);
                    await store.saveUser(userId, {
                        customer: null,
                    });
                    return c.json({
                        success: true,
                    });
                }
                case "authorization": {
                    const amount = parseFloat(query.amount);
                    const currency = query.currency ?? "jpy";
                    const returnUrl = query.returnUrl;
                    const online = query.online == "true" || query.online === true;
                    const emailFrom = query.from;
                    const emailTitle = query.title;
                    const emailContent = query.content;
                    const userId = query.userId;
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const user = await store.getUser(userId);
                    if (!user || !user.data["customer"]) {
                        throw new HttpError(404, "The customer id is not found.");
                    }
                    const defaultPayment = await resolveDefaultPayment({ stripeClient, store, user });
                    const email = await resolveUserEmail({
                        context: c,
                        workersOptions: options,
                        stripeClient,
                        user,
                        defaultPayment,
                    });
                    const paymentIntent = await stripeClient.paymentIntents.create({
                        payment_method_types: ["card"],
                        amount: amount,
                        confirm: false,
                        capture_method: "manual",
                        payment_method: defaultPayment,
                        description: "",
                        customer: user.data["customer"],
                        receipt_email: email,
                        currency: currency ?? "usd",
                        setup_future_usage: "off_session",
                    });
                    if (!paymentIntent) {
                        throw new HttpError(500, "The payment is failed.");
                    }
                    const confirmedPaymentIntent = await stripeClient.paymentIntents.confirm(
                        paymentIntent.id,
                        {
                            return_url: returnUrl,
                        },
                    );
                    const nextActionUrl = confirmedPaymentIntent.next_action?.redirect_to_url?.url ?? "";
                    if (nextActionUrl && !online) {
                        if (emailFrom && email && emailTitle && emailContent && sendEmail) {
                            await sendEmail({
                                from: emailFrom,
                                to: email,
                                subject: emailTitle,
                                text: emailContent.replace("{url}", nextActionUrl),
                            });
                        } else {
                            throw new HttpError(503, "3D Secure authentication is required, but the user is offline and no email settings have been configured.");
                        }
                    }
                    return c.json({
                        url: online ? nextActionUrl : "",
                        returnUrl: online ? confirmedPaymentIntent.next_action?.redirect_to_url?.return_url ?? "" : "",
                        authorizedId: paymentIntent.id,
                    });
                }
                case "confirm_authorization": {
                    const authorizedId = query.authorizedId;
                    if (!authorizedId) {
                        throw new HttpError(400, "The authorized id is empty.");
                    }
                    await stripeClient.paymentIntents.cancel(
                        authorizedId,
                    );
                    return c.json({
                        success: true,
                    });
                }
                case "create_purchase": {
                    const amount = parseFloat(query.amount);
                    const revenue = parseFloat(query.revenueRatio ?? 0);
                    const currency = query.currency ?? "jpy";
                    const userId = query.userId;
                    const targetUserId = query.targetUserId;
                    const orderId = query.orderId;
                    const description = query.description;
                    const emailFrom = query.emailFrom;
                    const emailTitle = query.emailTitle;
                    const emailContent = query.emailContent;
                    const locale = query.locale;
                    if (!orderId) {
                        throw new HttpError(400, "The order id is empty.");
                    }
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const user = await store.getUser(userId);
                    if (!user || !user.data["customer"]) {
                        throw new HttpError(404, "The customer id is not found.");
                    }
                    const defaultPayment = await resolveDefaultPayment({ stripeClient, store, user });
                    const email = await resolveUserEmail({
                        context: c,
                        workersOptions: options,
                        stripeClient,
                        user,
                        defaultPayment,
                    });
                    let paymentIntent: Stripe.PaymentIntent;
                    let targetAccount: string | undefined;
                    if (targetUserId) {
                        const target = await store.getUser(targetUserId);
                        if (!target || !target.data["account"]) {
                            throw new HttpError(404, "The target data is not found.");
                        }
                        targetAccount = target.data["account"];
                        paymentIntent = await stripeClient.paymentIntents.create({
                            payment_method_types: ["card"],
                            amount: amount,
                            confirm: false,
                            capture_method: "manual",
                            payment_method: defaultPayment,
                            description: description,
                            customer: user.data["customer"],
                            metadata: {
                                "order_id": orderId,
                            },
                            receipt_email: email,
                            currency: currency,
                            setup_future_usage: "off_session",
                            application_fee_amount: amount * revenue,
                            transfer_data: {
                                destination: target.data["account"],
                            },
                        });
                    } else {
                        paymentIntent = await stripeClient.paymentIntents.create({
                            payment_method_types: ["card"],
                            amount: amount,
                            confirm: false,
                            capture_method: "manual",
                            payment_method: defaultPayment,
                            description: description,
                            customer: user.data["customer"],
                            metadata: {
                                "order_id": orderId,
                            },
                            receipt_email: email,
                            currency: currency,
                            setup_future_usage: "off_session",
                        });
                    }
                    if (!paymentIntent) {
                        throw new HttpError(500, "The payment is failed.");
                    }
                    await store.savePurchase(orderId, {
                        "@uid": orderId,
                        "@time": new Date(),
                        orderId: orderId,
                        purchaseId: paymentIntent.id,
                        paymentMethodId: defaultPayment,
                        confirm: false,
                        verify: false,
                        capture: false,
                        success: false,
                        user: userId,
                        target: targetUserId ?? undefined,
                        nextAction: {
                            url: paymentIntent.next_action?.redirect_to_url?.url ?? "",
                            returnUrl: paymentIntent.next_action?.redirect_to_url?.return_url ?? "",
                        },
                        targetAccount: targetAccount ?? undefined,
                        customer: user.data["customer"],
                        amount: paymentIntent.amount,
                        application: paymentIntent.application,
                        applicationFeeAmount: paymentIntent.application_fee_amount,
                        transferAmount: paymentIntent.transfer_data?.amount ?? 0,
                        transferDistination: paymentIntent.transfer_data?.destination ?? "",
                        currency: paymentIntent.currency,
                        clientSecret: paymentIntent.client_secret,
                        createdTime: new Date(paymentIntent.created * 1000),
                        updatedTime: new Date(),
                        emailFrom: emailFrom,
                        emailTo: email,
                        emailTitle: emailTitle,
                        emailContent: emailContent,
                        locale: locale,
                    }, { userId });
                    return c.json({
                        purchaseId: paymentIntent.id,
                    });
                }
                case "confirm_purchase": {
                    const userId = query.userId;
                    const orderId = query.orderId;
                    const successUrl = query.successUrl;
                    const failureUrl = query.failureUrl;
                    let returnUrl = query.returnUrl;
                    const online = query.online == "true" || query.online === true;
                    if (!orderId) {
                        throw new HttpError(400, "The order id is empty.");
                    }
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    if (!online) {
                        returnUrl = returnUrl + "?token=" + await JSON.stringify({
                            userId: userId,
                            orderId: orderId,
                            successUrl: successUrl,
                            failureUrl: failureUrl,
                        }).encrypt({
                            key: apiKey.slice(0, 32),
                            ivKey: apiKey.slice(-16),
                        });
                    }
                    const purchase = await store.getPurchase(orderId, userId);
                    if (!purchase || !purchase.data["purchaseId"]) {
                        throw new HttpError(404, "The purchase data is invalid.");
                    }
                    const purchaseData = purchase.data;
                    if (purchaseData["error"]) {
                        throw new HttpError(409, "The purchase data has some errors");
                    }
                    if (purchaseData["cancel"]) {
                        throw new HttpError(409, "The purchase data is already canceled.");
                    }
                    if (purchaseData["confirm"]) {
                        if (purchaseData["verify"]) {
                            return c.json({
                                url: "",
                                returnUrl: "",
                                purchaseId: purchaseData["purchaseId"],
                            });
                        }
                        try {
                            const paymentIntent = await stripeClient.paymentIntents.retrieve(
                                purchaseData["purchaseId"],
                            );
                            const nextActionUrl = paymentIntent.next_action?.redirect_to_url?.url ?? "";
                            const update: { [key: string]: any } = {};
                            if (nextActionUrl) {
                                if (!online) {
                                    if (purchaseData["emailFrom"] && purchaseData["emailTo"] && purchaseData["emailTitle"] && purchaseData["emailContent"] && sendEmail) {
                                        await sendEmail({
                                            from: purchaseData["emailFrom"],
                                            to: purchaseData["emailTo"],
                                            subject: purchaseData["emailTitle"],
                                            text: purchaseData["emailContent"].replace("{url}", nextActionUrl),
                                        });
                                    } else {
                                        update["error"] = true;
                                        update["errorMessage"] = "3D Secure authentication is required, but the user is offline and no email settings have been configured.";
                                    }
                                }
                                update["nextAction"] = {
                                    url: nextActionUrl,
                                    returnUrl: paymentIntent.next_action?.redirect_to_url?.return_url ?? "",
                                };
                                await store.savePurchase(orderId, update, { userId });
                                return c.json({
                                    url: online ? nextActionUrl : "",
                                    returnUrl: online ? paymentIntent.next_action?.redirect_to_url?.return_url ?? "" : "",
                                    purchaseId: purchaseData["purchaseId"],
                                });
                            } else {
                                update["verify"] = true;
                                update["nextAction"] = null;
                                await store.savePurchase(orderId, update, { userId });
                                return c.json({
                                    url: "",
                                    returnUrl: "",
                                    purchaseId: purchaseData["purchaseId"],
                                });
                            }
                        } catch (err) {
                            if (err instanceof HttpError) {
                                throw err;
                            }
                            await store.savePurchase(orderId, {
                                error: true,
                                errorMessage: "The Purchase confirmation failed. Please replace the billing information and Refresh.",
                            }, { userId });
                            throw err;
                        }
                    } else {
                        try {
                            const paymentIntent = await stripeClient.paymentIntents.confirm(
                                purchaseData["purchaseId"],
                                {
                                    return_url: returnUrl,
                                },
                            );
                            const nextActionUrl = paymentIntent.next_action?.redirect_to_url?.url ?? "";
                            const update: { [key: string]: any } = {};
                            if (nextActionUrl && !online) {
                                if (purchaseData["emailFrom"] && purchaseData["emailTo"] && purchaseData["emailTitle"] && purchaseData["emailContent"] && sendEmail) {
                                    await sendEmail({
                                        from: purchaseData["emailFrom"],
                                        to: purchaseData["emailTo"],
                                        subject: purchaseData["emailTitle"],
                                        text: purchaseData["emailContent"].replace("{url}", nextActionUrl),
                                    });
                                } else {
                                    update["error"] = true;
                                    update["errorMessage"] = "3D Secure authentication is required, but the user is offline and no email settings have been configured.";
                                }
                            }
                            update["nextAction"] = {
                                url: nextActionUrl,
                                returnUrl: paymentIntent.next_action?.redirect_to_url?.return_url ?? "",
                            };
                            await store.savePurchase(orderId, update, { userId });
                            return c.json({
                                url: online ? nextActionUrl : "",
                                returnUrl: online ? paymentIntent.next_action?.redirect_to_url?.return_url ?? "" : "",
                                purchaseId: purchaseData["purchaseId"],
                            });
                        } catch (err) {
                            if (err instanceof HttpError) {
                                throw err;
                            }
                            await store.savePurchase(orderId, {
                                error: true,
                                errorMessage: "The Purchase confirmation failed. Please replace the billing information and Refresh.",
                            }, { userId });
                            throw err;
                        }
                    }
                }
                case "capture_purchase": {
                    const userId = query.userId;
                    const orderId = query.orderId;
                    const amount = parseFloat(query.amount ?? 0.0);
                    if (!orderId) {
                        throw new HttpError(400, "The order id is empty.");
                    }
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const purchase = await store.getPurchase(orderId, userId);
                    if (!purchase || !purchase.data["purchaseId"]) {
                        throw new HttpError(404, "The purchase data is invalid.");
                    }
                    const purchaseData = purchase.data;
                    if (purchaseData["error"]) {
                        throw new HttpError(409, "The purchase data has some errors");
                    }
                    if (purchaseData["cancel"]) {
                        throw new HttpError(409, "This purchase data has already been cancelled.");
                    }
                    if (!purchaseData["confirm"] || !purchaseData["verify"]) {
                        throw new HttpError(412, "The purchase data is not confirmed.");
                    }
                    if (purchaseData["capture"]) {
                        return c.json({
                            purchaseId: purchaseData["purchaseId"],
                        });
                    }
                    if (purchaseData["amount"] < amount) {
                        throw new HttpError(400, "You cannot capture an amount higher than the billing amount already saved.");
                    }
                    try {
                        const paymentIntent = await (amount > 0 ? stripeClient.paymentIntents.capture(
                            purchaseData["purchaseId"],
                            {
                                amount_to_capture: amount,
                            },
                        ) : stripeClient.paymentIntents.capture(
                            purchaseData["purchaseId"],
                        ));
                        if (paymentIntent.status !== "succeeded") {
                            throw new HttpError(409, "The Payment capture failed.");
                        }
                        return c.json({
                            purchaseId: purchaseData["purchaseId"],
                        });
                    } catch (err) {
                        await store.savePurchase(orderId, {
                            error: true,
                            errorMessage: "The Purchase capture failed. Please replace the billing information and Refresh.",
                        }, { userId });
                        throw err;
                    }
                }
                case "refresh_purchase": {
                    const orderId = query.orderId;
                    const userId = query.userId;
                    if (!orderId) {
                        throw new HttpError(400, "The order id is empty.");
                    }
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const purchase = await store.getPurchase(orderId, userId);
                    if (!purchase || !purchase.data["purchaseId"]) {
                        throw new HttpError(404, "The purchase data is invalid.");
                    }
                    const purchaseData = purchase.data;
                    if (purchaseData["success"]) {
                        throw new HttpError(409, "The payment has already been succeed.");
                    }
                    if (!purchaseData["error"]) {
                        return c.json({
                            success: true,
                        });
                    }
                    const user = await store.getUser(userId);
                    if (!user || !user.data["customer"]) {
                        throw new HttpError(404, "The customer id is not found.");
                    }
                    const defaultPayment = await resolveDefaultPayment({ stripeClient, store, user });
                    if (defaultPayment === purchaseData["payment_method"]) {
                        throw new HttpError(412, "There was no change in the Payment method.");
                    }
                    await stripeClient.paymentIntents.update(
                        purchaseData["purchaseId"],
                        {
                            payment_method: defaultPayment,
                        },
                    );
                    await store.savePurchase(orderId, {
                        paymentMethodId: defaultPayment,
                        error: null,
                        errorMessage: null,
                    }, { userId });
                    return c.json({
                        success: true,
                    });
                }
                case "cancel_purchase": {
                    const orderId = query.orderId;
                    const userId = query.userId;
                    if (!orderId) {
                        throw new HttpError(400, "The order id is empty.");
                    }
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const purchase = await store.getPurchase(orderId, userId);
                    if (!purchase || !purchase.data["purchaseId"]) {
                        throw new HttpError(404, "The purchase data is invalid.");
                    }
                    const purchaseData = purchase.data;
                    if (purchaseData["cancel"]) {
                        return c.json({
                            success: true,
                        });
                    }
                    if (purchaseData["capture"] || purchaseData["success"]) {
                        throw new HttpError(412, "The payment has already been completed.");
                    }
                    await stripeClient.paymentIntents.cancel(
                        purchaseData["purchaseId"],
                    );
                    await store.savePurchase(orderId, {
                        cancel: true,
                        error: null,
                        errorMessage: null,
                    }, { userId });
                    return c.json({
                        success: true,
                    });
                }
                case "refund_purchase": {
                    const orderId = query.orderId;
                    const userId = query.userId;
                    const amount = parseFloat(query.amount ?? 0.0);
                    if (!orderId) {
                        throw new HttpError(400, "The order id is empty.");
                    }
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    const purchase = await store.getPurchase(orderId, userId);
                    if (!purchase || !purchase.data["purchaseId"]) {
                        throw new HttpError(404, "The purchase data is invalid.");
                    }
                    const purchaseData = purchase.data;
                    if (!purchaseData["capture"] || !purchaseData["success"]) {
                        throw new HttpError(412, "The payment is not yet in your jurisdiction.");
                    }
                    if (purchaseData["amount"] < amount) {
                        throw new HttpError(400, "The amount to be refunded exceeds the original amount.");
                    }
                    try {
                        if (amount > 0) {
                            await stripeClient.refunds.create({
                                payment_intent: purchaseData["purchaseId"],
                                amount: amount,
                            });
                        } else {
                            await stripeClient.refunds.create({
                                payment_intent: purchaseData["purchaseId"],
                            });
                        }
                        await store.savePurchase(orderId, {
                            refund: true,
                            cancel: true,
                        }, { userId });
                        return c.json({
                            success: true,
                        });
                    } catch (err) {
                        await store.savePurchase(orderId, {
                            error: true,
                            errorMessage: "The Purchase confirmation failed. Please replace the billing information and Refresh.",
                        }, { userId });
                        throw err;
                    }
                }
                case "create_subscription": {
                    const productId = query.productId;
                    const orderId = query.orderId;
                    const userId = query.userId;
                    const count = query.count ?? 1;
                    const successUrl = query.successUrl;
                    const cancelUrl = query.cancelUrl;
                    if (!orderId) {
                        throw new HttpError(400, "The order id is empty.");
                    }
                    if (!userId) {
                        throw new HttpError(400, "The user id is empty.");
                    }
                    if (!productId) {
                        throw new HttpError(400, "The product id is empty.");
                    }
                    const res = await stripeClient.checkout.sessions.create({
                        billing_address_collection: "auto",
                        subscription_data: {
                            metadata: {
                                "userId": userId,
                                "orderId": orderId,
                            },
                        },
                        line_items: [
                            {
                                price: productId,
                                quantity: count,
                            },
                        ],
                        mode: "subscription",
                        success_url: successUrl,
                        cancel_url: cancelUrl,
                    });
                    return c.json({
                        endpoint: res.url,
                    });
                }
                case "delete_subscription": {
                    const orderId = query.orderId;
                    if (!orderId) {
                        throw new HttpError(400, "The order id is empty.");
                    }
                    const purchase = await store.getPurchase(orderId);
                    if (!purchase || !purchase.data["subscription"]) {
                        throw new HttpError(404, "The orderId data is not found");
                    }
                    const res = await stripeClient.subscriptions.update(purchase.data["subscription"], {
                        cancel_at_period_end: true,
                    });
                    return c.json({
                        success: res.cancel_at_period_end,
                    });
                }
                default: {
                    throw new HttpError(404, "There is no mode:" + query.mode);
                }
            }
        } catch (err) {
            return jsonError(c, err);
        }
    });
    return hono;
};
