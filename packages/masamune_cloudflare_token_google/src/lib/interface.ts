import { WorkersOptions } from "@mathrunet/masamune_cloudflare";

/**
 * Options for the Google token worker.
 *
 * Googleトークンワーカーのオプション。
 */
export interface GoogleTokenWorkersOptions extends WorkersOptions {
    /**
     * Service account JSON string.
     *
     * If not specified, it is resolved from the `GOOGLE_SERVICE_ACCOUNT` environment variable (Workers secret).
     *
     * サービスアカウントのJSON文字列。
     *
     * 指定されていない場合は`GOOGLE_SERVICE_ACCOUNT`環境変数（Workersシークレット）から解決されます。
     */
    serviceAccount?: string | undefined;

    /**
     * OAuth2 scopes (default: `https://www.googleapis.com/auth/cloud-platform`).
     *
     * OAuth2スコープ（デフォルト: `https://www.googleapis.com/auth/cloud-platform`）。
     */
    scopes?: string[] | undefined;
}

/**
 * Google token response interface.
 *
 * Googleトークンレスポンスインターフェース。
 */
export interface GoogleTokenResponse {
    accessToken?: string | null | undefined;
    expiresAt: number;
    [key: string]: any;
}
