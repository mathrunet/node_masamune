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