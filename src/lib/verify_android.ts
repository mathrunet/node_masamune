import * as functions from "firebase-functions";
import fetch from "node-fetch";
import FormData from "form-data";

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
    const formData = new FormData();
    formData.append("grant_type", "refresh_token");
    formData.append("client_id", clientId);
    formData.append("client_secret", clientSecret);
    formData.append("refresh_token", refreshToken);
    let res = await fetch("https://accounts.google.com/o/oauth2/token", {
        method: "POST",
        timeout: 30 * 1000,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData
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
    res = await fetch(
        `https://www.googleapis.com/androidpublisher/v3/applications/"${packageName}/purchases/${type}/${productId}/tokens/${purchaseToken}?access_token=${accessToken}`, {
        method: "GET",
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
