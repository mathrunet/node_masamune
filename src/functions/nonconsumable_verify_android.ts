import * as functions from "firebase-functions";
import * as verifier from "../lib/verify_android";
import * as updater from "../lib/update_unlock";

/**
 * Performs non-consumable in-app purchases. Unlock by setting the value of the field in the document specified in [path] to `true`.
 * 
 * 非消費型のアプリ内課金を行います。[path]に指定したドキュメント内のフィールドの値を`true`にすることでアンロックを行います。
 * 
 * @param purchase.android.refresh_token
 * Describe the refresh token that can be obtained by accessing [android_auth_code].
 * 
 * [android_auth_code]にアクセスすることで取得できるリフレッシュトークンを記述します。
 * 
 * @param purchase.android.client_id
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
 * @param purchase.android.client_secret
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
 * @param path
 * The path, including the key, of the field in the document where the unlock information is to be stored.
 * 
 * アンロック情報を保存するドキュメント内のフィールドのキーを含めたパス。
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
 */
module.exports = (regions: string[], data: { [key: string]: string }) => functions.region(...regions).https.onCall(
    async (query) => {
        try {
            const config = functions.config().purchase;
            /* ==== Android検証ここから ==== */
            const res = await verifier.verifyAndroid({
                type: "products",
                clientId: config.android.client_id,
                clientSecret: config.android.client_secret,
                refreshToken: config.android.refresh_token,
                packageName: query.packageName,
                productId: query.productId,
                purchaseToken: query.purchaseToken
            });
            if (res["purchaseState"] !== 0) {
                throw new functions.https.HttpsError("unauthenticated", "Illegal receipt.");
            }
            /* ==== ここまでAndroid検証 ==== */
            if (!query.path) {
                return res;
            }
            /* ==== Firestoreの更新ここから ==== */
            await updater.updateUnlock({
                targetDocumentFieldPath: query.path,
            });
            /* ==== ここまでFirestoreの更新 ==== */
            return res;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
