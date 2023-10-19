import * as functions from "firebase-functions";
import { Api } from "./api";

/**
 * Perform Android receipt verification.
 * 
 * Android の受信確認を実行します。
 * 
 * @param {String} type
 * Item type（products or subscriptions）
 * 
 * アイテムの種類（製品またはサブスクリプション）
 * 
 * @param {String} clientId
 * Google OAuth client ID.
 * 
 * Google OAuth クライアントID。
 * 
 * @param {String} clientSecret
 * Google OAuth client secret.
 * 
 * Google OAuth クライアントシークレット。
 * 
 * @param {String} refreshToken
 * Refresh token obtained by accessing [android_auth_code].
 * 
 * [android_auth_code]にアクセスして取得したリフレッシュトークン。
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
export async function verifyAndroid({
    type,
    clientId,
    clientSecret,
    refreshToken,
    packageName,
    productId,
    purchaseToken,
}: {
    type: string,
    clientId: string,
    clientSecret: string,
    refreshToken: string,
    packageName: string,
    productId: string,
    purchaseToken: string,
}) {
    let res = await Api.post("https://accounts.google.com/o/oauth2/token", {
        timeout: 30 * 1000,
        data: {
            "grant_type": "refresh_token",
            "client_id": clientId,
            "client_secret": clientSecret,
            "refresh_token": refreshToken,
        }
    });
    if (!res) {
        throw new functions.https.HttpsError("not-found", "Cannot get access token.");
    }
    let json = (await res.json()) as { [key: string]: any };
    console.log(json);
    const accessToken = json["access_token"];
    if (!accessToken) {
        throw new functions.https.HttpsError("not-found", "Cannot get access token.");
    }
    console.log(accessToken);
    res = await Api.get(
        `https://www.googleapis.com/androidpublisher/v3/applications/"${packageName}/purchases/${type}/${productId}/tokens/${purchaseToken}?access_token=${accessToken}`, {
        timeout: 30 * 1000,
        headers: {
            "Content-Type": "application/json",
        },
    });
    if (!res) {
        throw new functions.https.HttpsError("not-found", "The validation data is empty.");
    }
    json = (await res.json()) as { [key: string]: any };
    console.log(json);
    return json;
}
