import { Context, Hono } from "hono";
import { HttpError, jsonError, resolveConfig } from "@mathrunet/masamune_cloudflare";
import { AndroidTokenRequest, AndroidTokenResponse, AndroidTokenWorkersOptions } from "../lib/interface";

/**
 * After being redirected from [android_auth_code], you will get a refresh token to connect to Google's API.
 * Please execute [android_auth_code] after registering the required information.
 *
 * [android_auth_code]からリダイレクトされた後、GoogleのAPIに接続するためのリフレッシュトークンを取得します。
 * 必要情報を登録した後[android_auth_code]を実行してください。
 *
 * @param {string} PURCHASE_ANDROID_REDIRECTURI
 * Describe the absolute URL where [android_token] exists.
 * You will be redirected to this URL to obtain a refresh token.
 *
 * [android_token]が存在する絶対URLを記述します。
 * このURLにリダイレクトされリフレッシュトークンを取得できます。
 *
 * @param {string} PURCHASE_ANDROID_CLIENTID
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
 * @param {string} PURCHASE_ANDROID_CLIENTSECRET
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
    hono: Hono,
    options: AndroidTokenWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.get("/", async (context: Context) => {
        try {
            const redirectUri = resolveConfig(context, options.redirectUri, "PURCHASE_ANDROID_REDIRECTURI");
            const clientId = resolveConfig(context, options.clientId, "PURCHASE_ANDROID_CLIENTID");
            const clientSecret = resolveConfig(context, options.clientSecret, "PURCHASE_ANDROID_CLIENTSECRET");
            const code = context.req.query("code");
            if (!code || !clientId || !clientSecret || !redirectUri) {
                throw new HttpError(400, "Query parameter is invalid.");
            }
            const request: AndroidTokenRequest = {
                grant_type: "authorization_code",
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                access_type: "offline",
                code: code,
            };
            const resp = await fetch("https://accounts.google.com/o/oauth2/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams(request as unknown as Record<string, string>),
            });
            if (!resp.ok) {
                throw new HttpError(500, "Cannot get access token.");
            }
            const json = (await resp.json()) as AndroidTokenResponse | null;
            if (json === null || !json.refresh_token) {
                throw new HttpError(500, "Cannot get access token.");
            }
            console.log(json);
            return context.text(`RefreshToken:${json.refresh_token}`);
        } catch (err) {
            return jsonError(context, err);
        }
    });
    return hono;
};
