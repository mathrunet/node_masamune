import { Context, Hono } from "hono";
import { HttpError, jsonError, resolveConfig } from "@mathrunet/masamune_cloudflare";
import { AndroidTokenWorkersOptions } from "../lib/interface";

/**
 * Redirects to Google's OAuth consent screen to obtain an authorization code for connecting to Google's API.
 * Please execute [android_auth_code] after registering the required information.
 *
 * GoogleのAPIに接続するための認可コードを取得するため、GoogleのOAuth同意画面にリダイレクトします。
 * 必要情報を登録した後[android_auth_code]を実行してください。
 *
 * @param {string} PURCHASE_ANDROID_REDIRECTURI
 * Describe the absolute URL where [android_token] exists.
 * You will be redirected to this URL to obtain a refresh token.
 *
 * [android_token]が存在する絶対URLを記述します。
 * このURLにリダイレクトされリフレッシュトークンを取得できます。
 *
 * @param {string} id
 * Google's OAuth 2.0 client ID (query parameter).
 * Create an OAuth consent screen from the URL below.
 * https://console.cloud.google.com/apis/credentials/consent
 * Then create an OAuth 2.0 client ID from the credentials.
 * https://console.cloud.google.com/apis/credentials
 *
 * GoogleのOAuth2.0のクライアントID（クエリパラメータ）。
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
            const id = context.req.query("id");
            const redirectUri = resolveConfig(context, options.redirectUri, "PURCHASE_ANDROID_REDIRECTURI");
            if (!id || !redirectUri) {
                throw new HttpError(400, "Query parameter is invalid.");
            }
            return context.redirect(
                `https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=${id}&redirect_uri=${redirectUri}&scope=https://www.googleapis.com/auth/androidpublisher&access_type=offline&approval_prompt=force`,
            );
        } catch (err) {
            return jsonError(context, err);
        }
    });
    return hono;
};
