import { Context, Hono } from "hono";
import {
    HttpError,
    issueGoogleAccessToken,
    jsonError,
    parseGoogleServiceAccount,
    resolveConfig,
} from "@mathrunet/masamune_cloudflare";
import { GoogleTokenResponse, GoogleTokenWorkersOptions } from "../lib/interface";

/**
 * A function to get a Google Cloud Platform authentication token.
 *
 * Google Cloud Platformの認証トークンを取得するためのFunction。
 *
 * @param {string} GOOGLE_SERVICE_ACCOUNT
 * Service account JSON. Specify it in [options.serviceAccount] or the `GOOGLE_SERVICE_ACCOUNT` Workers secret.
 *
 * サービスアカウントJSON。[options.serviceAccount]または`GOOGLE_SERVICE_ACCOUNT`のWorkersシークレットで指定します。
 */
module.exports = (
    hono: Hono,
    options: GoogleTokenWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        try {
            // 認証ミドルウェアによる認証チェック
            const authentication = context.get("authentication");
            if (!authentication) {
                throw new HttpError(401, "Unauthenticated");
            }
            const body = await context.req.json().catch(() => ({})) as { [key: string]: any };
            const duration = body.duration as number | null | undefined ?? 3600;
            const serviceAccountJson = resolveConfig(context, options.serviceAccount, "GOOGLE_SERVICE_ACCOUNT");
            if (!serviceAccountJson) {
                throw new HttpError(500, "Service account is required");
            }
            const serviceAccount = parseGoogleServiceAccount(serviceAccountJson);
            const token = await issueGoogleAccessToken({
                serviceAccount,
                scopes: options.scopes ?? ["https://www.googleapis.com/auth/cloud-platform"],
                lifetimeSeconds: duration,
            });
            const response: GoogleTokenResponse = {
                accessToken: token.accessToken,
                expiresAt: token.expiresAt,
            };
            return context.json(response);
        } catch (err) {
            return jsonError(context, err);
        }
    });
    return hono;
};
