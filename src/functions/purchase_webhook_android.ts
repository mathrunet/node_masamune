import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import * as verifier from "../lib/verify_android";
import * as utils from "../lib/utils";
import { PubsubFunctionsOptions } from "../lib/functions_base";

/**
 * This is a webhook endpoint for Android. you can create a `purchasing` topic in GCP's pub/sub and set the principal to "google-play-developer-notifications@system.gserviceaccount.com" to receive notifications.
 * 
 * Android用のWebhookのエンドポイントです。GCPのpub/subに`purchasing`のトピックを作成しプリンシパルに「google-play-developer-notifications@system.gserviceaccount.com」を設定することで通知を受け取ることができるようになります。
 * 
 * @param process.env.PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL
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
 * @param process.env.PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY
 * A private key for your Google service account.
 * Create an OAuth consent screen from the URL below.
 * https://console.cloud.google.com/apis/credentials/consent
 * It is then created from the service account.
 * https://console.cloud.google.com/iam-admin/serviceaccounts
 * After creating a service account, create a key in Json format from the Key tab.
 * The private key is described there.
 * 
 * Googleのサービスアカウントのプライベートキー。
 * 下記のURLからOAuthの同意画面を作成します。
 * https://console.cloud.google.com/apis/credentials/consent
 * その後、サービスアカウントから作成します。
 * https://console.cloud.google.com/iam-admin/serviceaccounts
 * サービスアカウント作成後、キーのタブからJson形式でキーを作成します。
 * プライベートキーはそこに記述されています。
 * 
 * @param process.env.PURCHASE_SUBSCRIPTIONPATH
 * Describes the path to the collection of subscriptions.
 * 
 * サブスクリプションのコレクションのパスを記述します。
 */
module.exports = (
    regions: string[],
    options: PubsubFunctionsOptions,
    data: { [key: string]: string }
) => functions.pubsub.onMessagePublished(
    {
        topic: options.topic ?? "purchasing",
        region: options.region ?? regions[0],
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
    },
    async (message) => {
        try {
            const messageBody = message.data.message.data ?
                JSON.parse(Buffer.from(message.data.message.data, "base64").toString()) :
                null;
            if (messageBody) {
                const firestoreInstance = admin.firestore();
                const targetPath = process.env.PURCHASE_SUBSCRIPTIONPATH;
                const androidServiceAccountEmail = process.env.PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL;
                const androidServiceAccountPrivateKey = process.env.PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY;
                if (!androidServiceAccountEmail || !androidServiceAccountPrivateKey || !targetPath) {
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
                        serviceAccountEmail: androidServiceAccountEmail,
                        serviceAccountPrivateKey: androidServiceAccountPrivateKey,
                        packageName: packageName,
                        productId: subscriptionId,
                        purchaseToken: purchaseToken,
                    });
                    const search = await firestoreInstance.collection(targetPath).where("token", "==", purchaseToken).get();
                    if (search.empty) {
                        throw new Error("The purchased data is not found.");
                    }
                    const doc = search.docs[0];
                    const data = doc?.data();
                    const path = doc?.ref.path;
                    if (!data) {
                        throw new Error("The purchased data is not found.");
                    }
                    const user = data["userId"];
                    console.log(`notificationType: ${notificationType}`);
                    switch (notificationType) {
                        case SubscriptionNotificationTypes.SUBSCRIPTION_RECOVERED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_RESTARTED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_RENEWED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_IN_GRACE_PERIOD: {
                            for (const key in res) {
                                if (!data[key]) {
                                    continue;
                                }
                                data[key] = utils.parse(res[key]);
                            }
                            data["expired"] = false;
                            data["paused"] = false;
                            data["expiredTime"] = parseInt(res["expiryTimeMillis"]);
                            data["orderId"] = res["orderId"];
                            data["@time"] = new Date();
                            await firestoreInstance.doc(path).set(data);
                            console.log(`Updated subscription: ${data["productId"]}:${user}`);
                            break;
                        }
                        case SubscriptionNotificationTypes.SUBSCRIPTION_DEFERRED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_PRICE_CHANGE_CONFIRMED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED: {
                            for (const key in res) {
                                if (!data[key]) {
                                    continue;
                                }
                                data[key] = utils.parse(res[key]);
                            }
                            data["expiredTime"] = parseInt(res["expiryTimeMillis"]);
                            data["orderId"] = res["orderId"];
                            data["@time"] = new Date();
                            await firestoreInstance.doc(path).set(data);
                            console.log(`Updated subscription: ${data["productId"]}:${user}`);
                            break;
                        }
                        case SubscriptionNotificationTypes.SUBSCRIPTION_CANCELED: {
                            for (const key in res) {
                                if (!data[key]) {
                                    continue;
                                }
                                data[key] = utils.parse(res[key]);
                            }
                            const time = new Date().getTime();
                            const expiryTimeMillis = data["expiredTime"] = parseInt(res["expiryTimeMillis"]);
                            data["orderId"] = res["orderId"];
                            data["@time"] = new Date();
                            if (expiryTimeMillis <= time) {
                                data["expired"] = true;
                                data["paused"] = false;
                                await firestoreInstance.doc(path).set(data);
                                console.log(`Expired subscription: ${data["productId"]}:${user}`);
                            } else {
                                data["expired"] = false;
                                data["paused"] = false;
                                await firestoreInstance.doc(path).set(data);
                                console.log(`Updated subscription: ${data["productId"]}:${user}`);
                            }
                            break;
                        }
                        case SubscriptionNotificationTypes.SUBSCRIPTION_REVOKED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_EXPIRED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_PAUSED:
                        case SubscriptionNotificationTypes.SUBSCRIPTION_ON_HOLD: {
                            for (const key in res) {
                                if (!data[key]) {
                                    continue;
                                }
                                data[key] = utils.parse(res[key]);
                            }
                            data["expired"] = true;
                            if (SubscriptionNotificationTypes.SUBSCRIPTION_PAUSED || SubscriptionNotificationTypes.SUBSCRIPTION_ON_HOLD) {
                                data["paused"] = true;
                                await firestoreInstance.doc(path).set(data);
                                console.log(`Paused subscription: ${data["productId"]}:${user}`);
                            } else {
                                data["paused"] = false;
                                await firestoreInstance.doc(path).set(data);
                                console.log(`Expired subscription: ${data["productId"]}:${user}`);
                            }
                            break;                                
                        }
                        default:
                            break;
                    }
                    if (res["linkedPurchaseToken"]) {
                        const linkedPurchaseToken = res["linkedPurchaseToken"];
                        const search = await firestoreInstance.collection(targetPath).where("token", "==", linkedPurchaseToken).get();
                        if (search.empty) {
                            return;
                        }
                        const doc = search.docs[0];
                        const data = doc?.data();
                        const path = doc?.ref.path;
                        if (!data) {
                            throw new Error("The purchased data is not found.");
                        }
                        const user = data["userId"];
                        data["expired"] = true;
                        data["paused"] = false;
                        data["@time"] = new Date();
                        await firestoreInstance.doc(path).set(data);
                        console.log(`Expired subscription: ${data["productId"]}:${user}`);
                    }
                }
            }
        } catch (err) {
            console.error(err);
            throw new functions.https.HttpsError("unknown", "Unknown error.");
        }
    }
);

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