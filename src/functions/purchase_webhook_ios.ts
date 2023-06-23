import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as utils from "../lib/utils";

/**
 * Webhook endpoint for IOS, which allows you to receive notifications by setting the endpoint in AppStoreConnect's [App]->[App Information]->[App Store Server Notification].
 * 
 * IOS用のWebhookのエンドポイントです。AppStoreConnectの[App]->[App情報]->[App Storeサーバ通知]にエンドポイントを設定することで通知を受け取ることができるようになります。
 * 
 * @param purchase.subscription_path
 * Describes the path to the collection of subscriptions.
 * 
 * サブスクリプションのコレクションのパスを記述します。
 */
module.exports = (regions: string[], topics: { [key: string]: string }) => functions.region(...regions).https.onRequest(
    async (req, res) => {
        try {
            const message = req.body;
            const signedPayload = message.signedPayload;
            if (signedPayload) {
                const signedPayloadBody = signedPayload.replace(/-/g, "+").replace(/_/g, "/").split(".")[1];
                const messageBody = JSON.parse(Buffer.from(signedPayloadBody, "base64").toString());
                if (messageBody) {
                    const {
                        notificationType,
                        data,
                    } = messageBody;
                    const {
                        signedTransactionInfo,
                    } = data;

                    const signedTransactionInfoBody = signedTransactionInfo.replace(/-/g, "+").replace(/_/g, "/").split(".")[1];
                    const transactionInfo = JSON.parse(Buffer.from(signedTransactionInfoBody, "base64").toString());

                    const firestoreInstance = admin.firestore();
                    const config = functions.config().purchase;
                    const targetPath = config.subscription_path;
                    if (transactionInfo) {
                        const transactionId = transactionInfo.originalTransactionId;
                        const doc = await firestoreInstance.doc(`${targetPath}/${transactionId}`).get();
                        const data = doc?.data();
                        const path = doc?.ref.path;
                        if (!data) {
                            throw new Error("The purchased data is not found.");
                        }
                        const user = data["userId"];
                        console.log(`notificationType: ${notificationType}`);
                        switch (notificationType) {
                            case "CONSUMPTION_REQUEST":
                            case "DID_CHANGE_RENEWAL_STATUS":
                            case "DID_FAIL_TO_RENEW":
                            case "PRICE_INCREASE":
                            case "REFUND_DECLINED": {
                                for (const key in transactionInfo) {
                                    if (!data[key]) {
                                        continue;
                                    }
                                    data[key] = utils.parse(transactionInfo[key]);
                                }
                                data["expiredTime"] = parseInt(transactionInfo["expiresDate"]);
                                data["orderId"] = transactionInfo["transactionId"];
                                await firestoreInstance.doc(path).set(data);
                                console.log(`Updated subscription: ${data["productId"]}:${user}`);
                                break;
                            }
                            case "DID_CHANGE_RENEWAL_PREF":
                            case "DID_RENEW":
                            case "OFFER_REDEEMED":
                            case "RENEWAL_EXTENDED": {
                                for (const key in transactionInfo) {
                                    if (!data[key]) {
                                        continue;
                                    }
                                    data[key] = utils.parse(transactionInfo[key]);
                                }
                                data["expired"] = false;
                                data["expiredTime"] = parseInt(transactionInfo["expiresDate"]);
                                data["orderId"] = transactionInfo["transactionId"];
                                await firestoreInstance.doc(path).set(data);
                                console.log(`Updated subscription: ${data["productId"]}:${user}`);
                                break;
                            }
                            case "EXPIRED":
                            case "REVOKE":
                            case "GRACE_PERIOD_EXPIRED":
                            case "REFUND": {
                                for (const key in transactionInfo) {
                                    if (!data[key]) {
                                        continue;
                                    }
                                    data[key] = utils.parse(transactionInfo[key]);
                                }
                                data["expired"] = true;
                                await firestoreInstance.doc(path).set(data);
                                console.log(`Expired subscription: ${data["productId"]}:${user}`);
                                break;
                            }
                            default:
                                break;
                        }
                    }
                }
            }
        } catch (err) {
            console.error(err);
            throw new functions.https.HttpsError("unknown", "Unknown error.");
        }
    }
);