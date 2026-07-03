import { Context, Hono } from "hono";
import { utils } from "@mathrunet/masamune";
import * as verifier from "../lib/verify_android";
import { PurchaseWorkersOptions, resolveAndroidServiceAccount, resolveSubscriptionPath } from "../lib/options";

/**
 * This is a webhook endpoint for Android. You can create a `purchasing` topic in GCP's pub/sub, set the principal to "google-play-developer-notifications@system.gserviceaccount.com", and create a push subscription with this endpoint URL to receive notifications.
 *
 * Android用のWebhookのエンドポイントです。GCPのpub/subに`purchasing`のトピックを作成しプリンシパルに「google-play-developer-notifications@system.gserviceaccount.com」を設定した上で、このエンドポイントURLを指定したpushサブスクリプションを作成することで通知を受け取ることができるようになります。
 *
 * @param {string} PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL
 * The email address of your Google service account.
 * Create an OAuth consent screen from the URL below.
 * https://console.cloud.google.com/apis/credentials/consent
 * It is then created from the service account.
 * https://console.cloud.google.com/iam-admin/serviceaccounts
 *
 * Googleのサービスアカウントのメールアドレス。
 * 下記のURLからOAuthの同意画面を作成します。
 * https://console.cloud.google.com/apis/credentials/consent
 * その後、サービスアカウントから作成します。
 * https://console.cloud.google.com/iam-admin/serviceaccounts
 *
 * @param {string} PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY
 * A private key for your Google service account.
 * After creating a service account, create a key in Json format from the Key tab.
 * The private key is described there.
 *
 * Googleのサービスアカウントのプライベートキー。
 * サービスアカウント作成後、キーのタブからJson形式でキーを作成します。
 * プライベートキーはそこに記述されています。
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
        // Pub/Subのpushサブスクリプションは2xx以外を再送し続けるため、業務エラーはログに残して200を返します。
        try {
            const envelope = await context.req.json() as { [key: string]: any };
            const encoded = envelope?.message?.data as string | undefined;
            const messageBody = encoded
                ? JSON.parse(new TextDecoder().decode(base64Decode(encoded)))
                : null;
            if (messageBody) {
                const database = options.database;
                const targetPath = resolveSubscriptionPath(context, options);
                const serviceAccount = resolveAndroidServiceAccount(context, options);
                if (!database || !serviceAccount.email || !serviceAccount.privateKey || !targetPath) {
                    throw new Error("The data is invalid.");
                }
                const {
                    subscriptionNotification,
                    packageName,
                } = messageBody;
                if (subscriptionNotification) {
                    const {
                        notificationType,
                        purchaseToken,
                        subscriptionId,
                    } = subscriptionNotification;
                    if (!purchaseToken || !packageName || !subscriptionId) {
                        throw new Error("The data is invalid.");
                    }
                    const res = await verifier.verifyAndroid({
                        type: "subscriptions",
                        serviceAccountEmail: serviceAccount.email,
                        serviceAccountPrivateKey: serviceAccount.privateKey,
                        packageName: packageName,
                        productId: subscriptionId,
                        purchaseToken: purchaseToken,
                    });
                    const search = await database.query(targetPath, {
                        wheres: [{ type: "equalTo", key: "token", value: purchaseToken }],
                        limit: 1,
                    });
                    const doc = search.docs[0];
                    if (!doc) {
                        console.error("The purchased data is not found.");
                        return context.json({ status: 1 });
                    }
                    const docData = doc.data;
                    const path = doc.path;
                    const user = docData["userId"];
                    console.log(`notificationType: ${notificationType}`);
                    switch (notificationType) {
                        case SubscriptionNotificationTypes.SUBSCRIPTION_RECOVERED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_RESTARTED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_RENEWED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_IN_GRACE_PERIOD: {
                            for (const key in res) {
                                if (!docData[key]) {
                                    continue;
                                }
                                docData[key] = utils.parse(res[key]);
                            }
                            docData["expired"] = false;
                            docData["paused"] = false;
                            docData["expiredTime"] = parseInt(res.expiryTimeMillis ?? "0");
                            docData["orderId"] = res.orderId ?? "";
                            docData["@time"] = new Date();
                            await database.saveDocument(path, docData, { merge: true });
                            console.log(`Updated subscription: ${docData["productId"]}:${user}`);
                            break;
                        }
                        case SubscriptionNotificationTypes.SUBSCRIPTION_DEFERRED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_PRICE_CHANGE_CONFIRMED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED: {
                            for (const key in res) {
                                if (!docData[key]) {
                                    continue;
                                }
                                docData[key] = utils.parse(res[key]);
                            }
                            docData["expiredTime"] = parseInt(res.expiryTimeMillis ?? "0");
                            docData["orderId"] = res.orderId ?? "";
                            docData["@time"] = new Date();
                            await database.saveDocument(path, docData, { merge: true });
                            console.log(`Updated subscription: ${docData["productId"]}:${user}`);
                            break;
                        }
                        case SubscriptionNotificationTypes.SUBSCRIPTION_CANCELED: {
                            for (const key in res) {
                                if (!docData[key]) {
                                    continue;
                                }
                                docData[key] = utils.parse(res[key]);
                            }
                            const time = new Date().getTime();
                            const expiryTimeMillis = docData["expiredTime"] = parseInt(res.expiryTimeMillis ?? "0");
                            docData["orderId"] = res.orderId ?? "";
                            docData["@time"] = new Date();
                            if (expiryTimeMillis <= time) {
                                docData["expired"] = true;
                                docData["paused"] = false;
                                await database.saveDocument(path, docData, { merge: true });
                                console.log(`Expired subscription: ${docData["productId"]}:${user}`);
                            } else {
                                docData["expired"] = false;
                                docData["paused"] = false;
                                await database.saveDocument(path, docData, { merge: true });
                                console.log(`Updated subscription: ${docData["productId"]}:${user}`);
                            }
                            break;
                        }
                        case SubscriptionNotificationTypes.SUBSCRIPTION_REVOKED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_EXPIRED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_PAUSED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_ON_HOLD: {
                            for (const key in res) {
                                if (!docData[key]) {
                                    continue;
                                }
                                docData[key] = utils.parse(res[key]);
                            }
                            docData["expired"] = true;
                            if (notificationType === SubscriptionNotificationTypes.SUBSCRIPTION_PAUSED || notificationType === SubscriptionNotificationTypes.SUBSCRIPTION_ON_HOLD) {
                                docData["paused"] = true;
                                await database.saveDocument(path, docData, { merge: true });
                                console.log(`Paused subscription: ${docData["productId"]}:${user}`);
                            } else {
                                docData["paused"] = false;
                                await database.saveDocument(path, docData, { merge: true });
                                console.log(`Expired subscription: ${docData["productId"]}:${user}`);
                            }
                            break;
                        }
                        default:
                            break;
                    }
                    if (res.linkedPurchaseToken) {
                        const linkedPurchaseToken = res.linkedPurchaseToken;
                        const linkedSearch = await database.query(targetPath, {
                            wheres: [{ type: "equalTo", key: "token", value: linkedPurchaseToken }],
                            limit: 1,
                        });
                        const linkedDoc = linkedSearch.docs[0];
                        if (linkedDoc) {
                            const linkedData = linkedDoc.data;
                            const linkedUser = linkedData["userId"];
                            linkedData["expired"] = true;
                            linkedData["paused"] = false;
                            linkedData["@time"] = new Date();
                            await database.saveDocument(linkedDoc.path, linkedData, { merge: true });
                            console.log(`Expired subscription: ${linkedData["productId"]}:${linkedUser}`);
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

function base64Decode(data: string): Uint8Array {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Notification Type.
 *
 * 通知タイプ。
 */
enum SubscriptionNotificationTypes {
    // 定期購入がアカウントの一時停止から復帰した。
    SUBSCRIPTION_RECOVERED = 1,
    // アクティブな定期購入が更新された。
    SUBSCRIPTION_RENEWED = 2,
    // 定期購入が自発的または非自発的にキャンセルされた。
    // 自発的なキャンセルの場合、ユーザーがキャンセルしたときに送信されます。
    SUBSCRIPTION_CANCELED = 3,
    // 新しい定期購入が購入された。
    SUBSCRIPTION_PURCHASED = 4,
    // 定期購入でアカウントが一時停止された（有効な場合）。
    SUBSCRIPTION_ON_HOLD = 5,
    // 定期購入が猶予期間に入った（有効な場合）。
    SUBSCRIPTION_IN_GRACE_PERIOD = 6,
    // ユーザーが [Play] > [アカウント] > [定期購入] から
    // 定期購入を再有効化した（定期購入の再開にはオプトインが必要）。
    SUBSCRIPTION_RESTARTED = 7,
    // 定期購入の料金変更がユーザーによって確認された。
    SUBSCRIPTION_PRICE_CHANGE_CONFIRMED = 8,
    // 定期購入の契約期間が延長された。
    SUBSCRIPTION_DEFERRED = 9,
    // 定期購入が一時停止された。
    SUBSCRIPTION_PAUSED = 10,
    // 定期購入の一時停止スケジュールが変更された。
    SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED = 11,
    // 有効期限前にユーザーが定期購入を取り消した。
    SUBSCRIPTION_REVOKED = 12,
    // 定期購入が期限切れになった。
    SUBSCRIPTION_EXPIRED = 13,
}
