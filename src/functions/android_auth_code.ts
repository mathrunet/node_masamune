import * as functions from "firebase-functions";

/**
 * After being redirected from [android_auth_code], you will get a refresh token to connect to Google's API.
 * Please execute [android_auth_code] after registering the required information.
 * 
 * [android_auth_code]からリダイレクトされた後、GoogleのAPIに接続するためのリフレッシュトークンを取得します。
 * 必要情報を登録した後[android_auth_code]を実行してください。
 * 
 * @param purchase.android.redirect_uri
 * Describe the absolute URL where [android_token] exists.
 * You will be redirected to this URL to obtain a refresh token.
 * 
 * [android_token]が存在する絶対URLを記述します。
 * このURLにリダイレクトされリフレッシュトークンを取得できます。
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
 */
module.exports = (regions: string[], topics: { [key: string]: string }) => functions.region(...regions).https.onRequest(
    async (req, res) => {
        try {
            const config = functions.config().purchase;
            if (!req.query.id || !config.android.redirect_uri) {
                throw new functions.https.HttpsError("invalid-argument", "Query parameter is invalid.");
            }
            res.redirect(
                `https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=${req.query.id}&redirect_uri=${config.android.redirect_uri}&scope=https://www.googleapis.com/auth/androidpublisher&access_type=offline&approval_prompt=force`,
            );
        } catch (err) {
            console.error(err);
            res.end();
        }
    }
);
