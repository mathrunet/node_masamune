import * as functions from "firebase-functions/v2";
import { Api } from "../lib/api";
import { HttpFunctionsOptions } from "../lib/src/functions_base";


/**
 * After being redirected from [android_auth_code], you will get a refresh token to connect to Google's API.
 * Please execute [android_auth_code] after registering the required information.
 * 
 * [android_auth_code]からリダイレクトされた後、GoogleのAPIに接続するためのリフレッシュトークンを取得します。
 * 必要情報を登録した後[android_auth_code]を実行してください。
 * 
 * @param process.env.PURCHASE_ANDROID_REDIRECTURI
 * Describe the absolute URL where [android_token] exists.
 * You will be redirected to this URL to obtain a refresh token.
 * 
 * [android_token]が存在する絶対URLを記述します。
 * このURLにリダイレクトされリフレッシュトークンを取得できます。
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
 */
module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: string }
) => functions.https.onRequest(
    {
        region: options.region ?? regions,
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
    },
    async (req, res) => {
        try {
            const redirectUri = process.env.PURCHASE_ANDROID_REDIRECTURI;
            const clientId = process.env.PURCHASE_ANDROID_CLIENTID;
            const clientSecret = process.env.PURCHASE_ANDROID_CLIENTSECRET;
            if (!req.query.code || !clientId || !clientSecret || !redirectUri) {
                throw new functions.https.HttpsError("invalid-argument", "Query parameter is invalid.");
            }
            const resp = await Api.post("https://accounts.google.com/o/oauth2/token", {
                timeout: 30 * 1000,
                data: {
                    "grant_type": "authorization_code",
                    "client_id": clientId,
                    "client_secret": clientSecret,
                    "redirect_uri": redirectUri,
                    "access_type": "offline",
                    "code": req.query.code,
                },
            });
            if (!resp) {
                throw new functions.https.HttpsError("data-loss", "Cannot get access token.");
            }
            const json = (await resp.json()) as { [key: string]: any };
            if (json === null) {
                throw new functions.https.HttpsError("data-loss", "Cannot get access token.");
            }
            console.log(json);
            res.send(`RefreshToken:${json["refresh_token"]}`);
        } catch (err) {
            console.error(err);
            res.end();
        }
    }
);
