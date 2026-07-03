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