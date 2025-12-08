
/**
 * SendGrid request interface.
 * 
 * SendGridのリクエストインターフェース。
 */
export interface SendGridRequest {
    to: string;
    from: string;
    subject: string;
    text: string;
}

/**
 * SendGrid response interface.
 * 
 * SendGridのレスポンスインターフェース。
 */
export interface SendGridResponse {
    success: boolean;
}