import { Context, Hono } from "hono";
import { base64UrlDecode, utils } from "@mathrunet/masamune_cloudflare";
import { PurchaseWorkersOptions, resolveSubscriptionPath } from "../lib/options";
import { IOSTransactionInfo } from "../lib/interface";

/**
 * Webhook endpoint for IOS, which allows you to receive notifications by setting the endpoint in AppStoreConnect's [App]->[App Information]->[App Store Server Notification].
 *
 * IOS用のWebhookのエンドポイントです。AppStoreConnectの[App]->[App情報]->[App Storeサーバ通知]にエンドポイントを設定することで通知を受け取ることができるようになります。
 *
 * @param {string} PURCHASE_SUBSCRIPTIONPATH
 * Describes the path to the collection of subscriptions.
 *
 * サブスクリプションのコレクションのパスを記述します。
 */
module.exports = (
    hono: Hono,
    options: PurchaseWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        try {
            const message = await context.req.json() as { [key: string]: any };
            const signedPayload = message.signedPayload as string | undefined;
            if (signedPayload) {
                const signedPayloadBody = signedPayload.split(".")[1];
                const messageBody = JSON.parse(new TextDecoder().decode(base64UrlDecode(signedPayloadBody)));
                if (messageBody) {
                    const {
                        notificationType,
                        data: notificationData,
                    } = messageBody;
                    const {
                        signedTransactionInfo,
                    } = notificationData;

                    const signedTransactionInfoBody = signedTransactionInfo.split(".")[1];
                    const transactionInfo = JSON.parse(new TextDecoder().decode(base64UrlDecode(signedTransactionInfoBody))) as IOSTransactionInfo;

                    const database = options.database;
                    const targetPath = resolveSubscriptionPath(context, options);
                    if (!database || !targetPath) {
                        throw new Error("The data is invalid.");
                    }
                    if (transactionInfo) {
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
                    }
                }
            }
            return context.json({ status: 1 });
        } catch (err) {
            console.error(err);
            return context.json({ status: 0 });
        }
    });
    return hono;
};
