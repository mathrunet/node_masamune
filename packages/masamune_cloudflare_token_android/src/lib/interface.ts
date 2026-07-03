import { WorkersOptions } from "@mathrunet/masamune_cloudflare";

/**
 * Options for the Android token workers.
 *
 * Androidトークンワーカーのオプション。
 */
export interface AndroidTokenWorkersOptions extends WorkersOptions {
    /**
     * The absolute URL where [android_token] exists.
     *
     * If not specified, it is resolved from the `PURCHASE_ANDROID_REDIRECTURI` environment variable (Workers secret).
     *
     * [android_token]が存在する絶対URL。
     *
     * 指定されていない場合は`PURCHASE_ANDROID_REDIRECTURI`環境変数（Workersシークレット）から解決されます。
     */
    redirectUri?: string | undefined;

    /**
     * Google's OAuth 2.0 client ID.
     *
     * If not specified, it is resolved from the `PURCHASE_ANDROID_CLIENTID` environment variable (Workers secret).
     *
     * GoogleのOAuth2.0のクライアントID。
     *
     * 指定されていない場合は`PURCHASE_ANDROID_CLIENTID`環境変数（Workersシークレット）から解決されます。
     */
    clientId?: string | undefined;

    /**
     * Google's OAuth 2.0 client secret.
     *
     * If not specified, it is resolved from the `PURCHASE_ANDROID_CLIENTSECRET` environment variable (Workers secret).
     *
     * GoogleのOAuth2.0のクライアントシークレット。
     *
     * 指定されていない場合は`PURCHASE_ANDROID_CLIENTSECRET`環境変数（Workersシークレット）から解決されます。
     */
    clientSecret?: string | undefined;
}

/**
 * Android token request interface.
 *
 * Androidトークンリクエストインターフェース。
 */
export interface AndroidTokenRequest {
    grant_type: string;
    client_id: string;
    client_secret: string;
    redirect_uri: string;
    access_type: string;
    code: string;
}

/**
 * Android token response interface.
 *
 * Androidトークンレスポンスインターフェース。
 */
export interface AndroidTokenResponse {
    refresh_token: string;
    [key: string]: any;
}
