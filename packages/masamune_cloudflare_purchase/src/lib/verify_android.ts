import * as functions from "firebase-functions/v2";
import { google } from "googleapis";
import { VerifyAndroidRequest, VerifyAndroidResponse } from "./interface";

/**
 * Perform Android receipt verification.
 * 
 * Android の受信確認を実行します。
 * 
 * @param {"products" | "subscriptions"} type
 * Item type（products or subscriptions）
 * 
 * アイテムの種類（製品またはサブスクリプション）
 * 
 * @param {String} serviceAccountEmail
 * The email address of your Google Services account.
 * 
 * Googleサービスアカウントのメールアドレス。
 * 
 * @param {String} serviceAccountPrivateKey
 * A private key for your Google Services account.
 * 
 * Googleサービスアカウントのプライベートキー。
 * 
 * @param {String} packageName
 * Application package name.
 * 
 * アプリケーションのパッケージ名。
 * 
 * @param {String} productId
 * Item ID issued by Google Play.
 * 
 * GooglePlayで発行されたアイテムID。
 * 
 * @param {String} purchaseToken
 * The purchase token issued at the time of purchase.
 * 
 * 購入したときに発行された購入トークン。
 * 
 * @return {Promise<{ [key: string]: any; }}
 * Receipt information for the item.
 * 
 * アイテムの受領情報。
 */
export async function verifyAndroid(request: VerifyAndroidRequest): Promise<VerifyAndroidResponse> {
    try {
        const authClient = new google.auth.JWT({
            email: request.serviceAccountEmail,
            key: request.serviceAccountPrivateKey.replace(/\\n/g, "\n"),
            scopes: ["https://www.googleapis.com/auth/androidpublisher"]
        });
        const playDeveloperApiClient = google.androidpublisher({
            version: "v3",
            auth: authClient,
        });
        await authClient.authorize();
        if (request.type === "products") {
            const res = await playDeveloperApiClient.purchases.products.get({
                packageName: request.packageName,
                productId: request.productId,
                token: request.purchaseToken,
            });
            if (res.status !== 200) {
                throw new functions.https.HttpsError("not-found", "The validation data is empty.");
            }
            const response: VerifyAndroidResponse = {
                orderId: res.data.orderId,
                purchaseState: res.data.purchaseState,
            };
            return response;
        } else if (request.type === "subscriptions") {
            const res = await playDeveloperApiClient.purchases.subscriptions.get({
                packageName: request.packageName,
                subscriptionId: request.productId,
                token: request.purchaseToken,
            });
            if (res.status !== 200) {
                throw new functions.https.HttpsError("not-found", "The validation data is empty.");
            }
            const response: VerifyAndroidResponse = {
                orderId: res.data.orderId,
                startTimeMillis: res.data.startTimeMillis ?? undefined,
                expiryTimeMillis: res.data.expiryTimeMillis ?? undefined,
            };
            return response;
        }
    } catch (error) {
        console.log(error);
    }
    throw new functions.https.HttpsError("not-found", "The validation data is empty.");
}
