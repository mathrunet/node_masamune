import { Context, Hono } from "hono";
import { HttpError, utils } from "@mathrunet/masamune_cloudflare";
import { PurchaseWorkersOptions, resolveIOSBundleId, resolveIOSEnvironment, resolveIOSRootCertificates, resolveSubscriptionPath } from "../lib/options";
import { IOSTransactionInfo } from "../lib/interface";
import { verifyJwsWithX5c } from "../lib/jws";

/**
 * Webhook endpoint for IOS, which allows you to receive notifications by setting the endpoint in AppStoreConnect's [App]->[App Information]->[App Store Server Notification].
 *
 * IOS用のWebhookのエンドポイントです。AppStoreConnectの[App]->[App情報]->[App Storeサーバ通知]にエンドポイントを設定することで通知を受け取ることができるようになります。
 *
 * `signedPayload` and `signedTransactionInfo` are verified against the Apple certificate chain (Apple Root CA - G3) and the configured bundle ID before any data is touched.
 * Requests that fail verification get a non-2xx response; Apple retries those, forged senders are simply rejected.
 *
 * `signedPayload`と`signedTransactionInfo`は、データに触れる前にApple証明書チェーン（Apple Root CA - G3）と設定済みバンドルIDに対して検証されます。
 * 検証に失敗したリクエストには非2xxを返します。Appleは再送し、偽の送信者は単に拒否されます。
 *
 * @param {string} PURCHASE_SUBSCRIPTIONPATH
 * Describes the path to the collection of subscriptions.
 *
 * サブスクリプションのコレクションのパスを記述します。
 *
 * @param {string} PURCHASE_IOS_BUNDLEID
 * App bundle ID. Required; notifications for other apps are rejected.
 *
 * アプリのバンドルID。必須で、他アプリの通知は拒否されます。
 *
 * @param {string} PURCHASE_IOS_ENVIRONMENT
 * Accepted App Store environment (`Production` or `Sandbox`). Both are accepted when unset.
 *
 * 受け入れるApp Store環境（`Production`または`Sandbox`）。未設定の場合は両方を受け入れます。
 */
module.exports = (
    hono: Hono,
    options: PurchaseWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        let message: { [key: string]: any };
        try {
            message = await context.req.json() as { [key: string]: any };
        } catch (err) {
            console.error(err);
            return context.json({ status: 0 }, 400);
        }
        const signedPayload = message.signedPayload as string | undefined;
        if (typeof signedPayload !== "string" || signedPayload.length === 0) {
            return context.json({ status: 0 }, 400);
        }
        /* ==== 署名検証ここから ==== */
        let notificationType: string | undefined;
        let transactionInfo: IOSTransactionInfo | undefined;
        try {
            const bundleId = resolveIOSBundleId(context, options);
            if (!bundleId) {
                throw new HttpError(500, "PURCHASE_IOS_BUNDLEID is not set.");
            }
            const environment = resolveIOSEnvironment(context, options);
            const rootCertificates = resolveIOSRootCertificates(options);
            const { payload: messageBody } = await verifyJwsWithX5c(signedPayload, { rootCertificates });
            notificationType = messageBody?.notificationType as string | undefined;
            if (notificationType === "TEST") {
                return context.json({ status: 1 });
            }
            const notificationData = messageBody?.data as { [key: string]: any } | undefined;
            if (!notificationData) {
                throw new HttpError(400, "The notification data is missing.");
            }
            if (notificationData.bundleId !== bundleId) {
                throw new HttpError(403, "Bundle ID mismatch.");
            }
            if (environment && notificationData.environment !== environment) {
                throw new HttpError(403, "Environment mismatch.");
            }
            const signedTransactionInfo = notificationData.signedTransactionInfo as string | undefined;
            if (typeof signedTransactionInfo !== "string" || signedTransactionInfo.length === 0) {
                throw new HttpError(400, "The transaction info is missing.");
            }
            // `signedRenewalInfo` is not consumed by this endpoint, so it is intentionally not verified.
            // `signedRenewalInfo`はこのエンドポイントでは使用しないため、意図的に検証しません。
            transactionInfo = (await verifyJwsWithX5c(signedTransactionInfo, {
                rootCertificates,
                bundleId,
                environment,
            })).payload as IOSTransactionInfo;
        } catch (err) {
            console.error(err);
            const status = err instanceof HttpError ? err.status : 401;
            return context.json({ status: 0 }, status as 400 | 401 | 403 | 500);
        }
        /* ==== ここまで署名検証 ==== */
        try {
            const database = options.database;
            const targetPath = resolveSubscriptionPath(context, options);
            if (!database || !targetPath) {
                throw new Error("The data is invalid.");
            }
            const transactionId = transactionInfo.originalTransactionId;
            const doc = await database.getDocument(`${targetPath}/${transactionId}`);
            const docData = doc?.data;
            const path = doc?.path;
            if (!docData || !path) {
                throw new Error("The purchased data is not found.");
            }
            const user = docData["userId"];
            console.log(`notificationType: ${notificationType}`);
            switch (notificationType) {
                case "CONSUMPTION_REQUEST":
                case "DID_CHANGE_RENEWAL_STATUS":
                case "DID_FAIL_TO_RENEW":
                case "PRICE_INCREASE":
                case "REFUND_DECLINED": {
                    for (const key in transactionInfo) {
                        if (!docData[key]) {
                            continue;
                        }
                        docData[key] = utils.parse(transactionInfo[key]);
                    }
                    docData["expiredTime"] = parseInt(transactionInfo.expiresDate);
                    docData["productId"] = docData["product_id"] = transactionInfo.productId;
                    docData["orderId"] = transactionInfo.transactionId;
                    await database.saveDocument(path, docData, { merge: true });
                    console.log(`Updated subscription: ${docData["productId"]}:${user}`);
                    break;
                }
                case "SUBSCRIBED":
                case "DID_CHANGE_RENEWAL_PREF":
                case "DID_RENEW":
                case "OFFER_REDEEMED":
                case "RENEWAL_EXTENDED": {
                    for (const key in transactionInfo) {
                        if (!docData[key]) {
                            continue;
                        }
                        docData[key] = utils.parse(transactionInfo[key]);
                    }
                    docData["expired"] = false;
                    docData["paused"] = false;
                    docData["expiredTime"] = parseInt(transactionInfo.expiresDate);
                    docData["productId"] = docData["product_id"] = transactionInfo.productId;
                    docData["orderId"] = transactionInfo.transactionId;
                    await database.saveDocument(path, docData, { merge: true });
                    console.log(`Updated subscription: ${docData["productId"]}:${user}`);
                    break;
                }
                case "EXPIRED":
                case "REVOKE":
                case "GRACE_PERIOD_EXPIRED":
                case "REFUND": {
                    for (const key in transactionInfo) {
                        if (!docData[key]) {
                            continue;
                        }
                        docData[key] = utils.parse(transactionInfo[key]);
                    }
                    docData["expired"] = true;
                    docData["paused"] = false;
                    docData["productId"] = docData["product_id"] = transactionInfo.productId;
                    docData["orderId"] = transactionInfo.transactionId;
                    await database.saveDocument(path, docData, { merge: true });
                    console.log(`Expired subscription: ${docData["productId"]}:${user}`);
                    break;
                }
                default:
                    break;
            }
            return context.json({ status: 1 });
        } catch (err) {
            // Business errors (unknown document etc.) return 200 so that Apple does not retry forever.
            // 業務エラー（ドキュメント未発見など）は再送ループを防ぐため200を返します。
            console.error(err);
            return context.json({ status: 0 });
        }
    });
    return hono;
};
