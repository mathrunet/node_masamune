import * as functions from "firebase-functions/v2";
import * as verifier from "../lib/verify_android";
import * as subscription from "../lib/update_subscription";
import { HttpFunctionsOptions, firestoreLoader } from "@mathrunet/masamune";

/**
 * Verify subscriptions and add data.
 * 
 * サブスクリプションの検証とデータの追加を行います。
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
 * 
 * @param purchaseId
 * Subscription purchase ID.
 * 
 * サブスクリプションの購入ID。
 * 
 * @param packageName
 * Application package name.
 * 
 * アプリケーションのパッケージ名。
 * 
 * @param productId
 * Item ID issued by Google Play.
 * 
 * GooglePlayで発行されたアイテムID。
 * 
 * @param purchaseToken
 * The purchase token issued at the time of purchase.
 * 
 * 購入したときに発行された購入トークン。
 * 
 * @param data
 * Document data to be updated.
 * 
 * 更新するドキュメントデータ。
 * 
 * @param userId
 * ID of the user who purchased the subscription.
 * 
 * サブスクリプションを購入したユーザーのID。
 */
module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => functions.https.onCall(
    {
        region: options.region ?? regions,
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
        serviceAccount: options?.serviceAccount ?? undefined,
        enforceAppCheck: options.enforceAppCheck ?? undefined,
        consumeAppCheckToken: options.consumeAppCheckToken ?? undefined,
    },
    async (query) => {
        try {
            /* ==== Android検証ここから ==== */
            if (!query.data.userId) {
                throw new functions.https.HttpsError("invalid-argument", "User is empty.");
            }
            const res = await verifier.verifyAndroid({
                type: "subscriptions",
                serviceAccountEmail: process.env.PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL ?? "",
                serviceAccountPrivateKey: process.env.PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY ?? "",
                packageName: query.data.packageName,
                productId: query.data.productId,
                purchaseToken: query.data.purchaseToken,
            });
            const time = new Date().getTime();
            const startTimeMillis = parseInt(res["startTimeMillis"]);
            const expiryTimeMillis = parseInt(res["expiryTimeMillis"]);
            if (res === null || isNaN(startTimeMillis) || isNaN(expiryTimeMillis) || startTimeMillis <= 0) {
                throw new functions.https.HttpsError("not-found", "Illegal receipt.");
            }
            if (expiryTimeMillis <= time) {
                res["expired"] = true;
            }
            /* ==== ここまでAndroid検証 ==== */
            /* ==== Firestoreの更新ここから ==== */
            let error: any | null = null;
            const firestoreDatabaseIds = options.firestoreDatabaseIds ?? [""];
            for (const databaseId of firestoreDatabaseIds) {
                try {
                    const firestoreInstance = firestoreLoader(databaseId);
                    await subscription.updateSubscription({
                        targetCollectionPath: query.data.path ?? process.env.PURCHASE_SUBSCRIPTIONPATH,
                        targetDocumentId: query.data.purchaseToken,
                        data: res,
                        additionalData: query.data,
                        userId: query.data.userId,
                        platform: "Android",
                        orderId: res["orderId"],
                        productId: query.data.productId,
                        purchaseId: query.data.purchaseId,
                        packageName: query.data.packageName,
                        token: query.data.purchaseToken,
                        expiryDate: expiryTimeMillis,
                        firestoreInstance: firestoreInstance,
                    });
                } catch (err) {
                    error = err;
                }
            }
            if (error) {
                console.error(error);
                throw new functions.https.HttpsError("unknown", "Unknown error.");
            }
            /* ==== ここまでFirestoreの更新 ==== */
            return res;
        } catch (err) {
            console.error(err);
            throw new functions.https.HttpsError("unknown", "Unknown error.");
        }
    }
);
