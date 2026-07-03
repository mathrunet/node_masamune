import { HttpError, issueGoogleAccessToken } from "@mathrunet/masamune_cloudflare";
import { VerifyAndroidRequest, VerifyAndroidResponse } from "./interface";

/**
 * Perform Android receipt verification through the Android Publisher REST API.
 *
 * Android Publisher REST APIを通じてAndroidの受信確認を実行します。
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
        const token = await issueGoogleAccessToken({
            serviceAccount: {
                client_email: request.serviceAccountEmail,
                private_key: request.serviceAccountPrivateKey,
            },
            scopes: ["https://www.googleapis.com/auth/androidpublisher"],
        });
        const endpoint = request.type === "products"
            ? `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(request.packageName)}/purchases/products/${encodeURIComponent(request.productId)}/tokens/${encodeURIComponent(request.purchaseToken)}`
            : `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(request.packageName)}/purchases/subscriptions/${encodeURIComponent(request.productId)}/tokens/${encodeURIComponent(request.purchaseToken)}`;
        const res = await fetch(endpoint, {
            headers: {
                "Authorization": `Bearer ${token.accessToken}`,
                "Accept": "application/json",
            },
        });
        if (res.status !== 200) {
            throw new HttpError(404, "The validation data is empty.");
        }
        const json = await res.json() as { [key: string]: any };
        return json as VerifyAndroidResponse;
    } catch (error) {
        console.log(error);
    }
    throw new HttpError(404, "The validation data is empty.");
}
