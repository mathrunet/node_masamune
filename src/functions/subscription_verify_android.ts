import * as functions from "firebase-functions/v2";
import * as verifier from "../lib/verify_android";
import * as subscriber from "../lib/update_subscription";
import { HttpFunctionsOptions } from "../lib/functions_base";

/**
 * Verify subscriptions and add data.
 * 
 * サブスクリプションの検証とデータの追加を行います。
 * 
 * @param process.env.PURCHASE_ANDROID_REFRESHTOKEN
 * Describe the refresh token that can be obtained by accessing [android_auth_code].
 * 
 * [android_auth_code]にアクセスすることで取得できるリフレッシュトークンを記述します。
 * 
 * @param process.env.PURCHASE_ANDROID_CLIENTID
 * Google's OAuth 2.0 client ID.
 * Create an OAuth consent screen from the URL below.
 * https://console.cloud.google.com/apis/credentials/consent
 * Then create an OAuth 2.0 client ID from the credentials.
 * https://console.cloud.google.com/apis/credentials
 * 
 * GoogleのOAuth2.0のクライアントID。
 * 下記のURLからOAuthの同意画面を作成します。
 * https://console.cloud.google.com/apis/credentials/consent
 * その後、認証情報からOAuth 2.0 クライアントIDを作成します。
 * https://console.cloud.google.com/apis/credentials
 * 
 * @param process.env.PURCHASE_ANDROID_CLIENTSECRET
 * Google's OAuth 2.0 client secret.
 * Create an OAuth consent screen from the URL below.
 * https://console.cloud.google.com/apis/credentials/consent
 * Then create an OAuth 2.0 client ID from the credentials.
 * https://console.cloud.google.com/apis/credentials
 * 
 * GoogleのOAuth2.0のクライアントシークレット。
 * 下記のURLからOAuthの同意画面を作成します。
 * https://console.cloud.google.com/apis/credentials/consent
 * その後、認証情報からOAuth 2.0 クライアントIDを作成します。
 * https://console.cloud.google.com/apis/credentials
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
    data: { [key: string]: string }
) => functions.https.onCall(
    {
        region: options.region ?? regions,
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
    },
    async (query) => {
        try {
            /* ==== Android検証ここから ==== */
            if (!query.data.userId) {
                throw new functions.https.HttpsError("invalid-argument", "User is empty.");
            }
            const res = await verifier.verifyAndroid({
                type: "subscriptions",
                clientId: process.env.PURCHASE_ANDROID_CLIENTID ?? "",
                clientSecret: process.env.PURCHASE_ANDROID_CLIENTSECRET ?? "",
                refreshToken: process.env.PURCHASE_ANDROID_REFRESHTOKEN ?? "",
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
            await subscriber.updateSubscription({
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
            });
            /* ==== ここまでFirestoreの更新 ==== */
            return res;
        } catch (err) {
            console.error(err);
            throw new functions.https.HttpsError("unknown", "Unknown error.");
        }
    }
);
