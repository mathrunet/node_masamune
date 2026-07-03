import { WorkersOptions } from "@mathrunet/masamune_cloudflare";

/**
 * Options for the SendGrid worker.
 *
 * SendGridワーカーのオプション。
 */
export interface SendGridWorkersOptions extends WorkersOptions {
    /**
     * API key for SendGrid.
     *
     * If not specified, it is resolved from the `MAIL_SENDGRID_APIKEY` environment variable (Workers secret).
     *
     * SendGridのAPIキー。
     *
     * 指定されていない場合は`MAIL_SENDGRID_APIKEY`環境変数（Workersシークレット）から解決されます。
     */
    apiKey?: string | undefined;
}

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
