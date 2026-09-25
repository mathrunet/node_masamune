import { WorkersOptions } from "@mathrunet/masamune_cloudflare";

/**
 * An email address with an optional display name.
 */
export interface SendMailAddress {
    /**
     * Email address (e.g. `user@example.com`).
     */
    email: string;

    /**
     * Optional display name (e.g. `Jane Doe`).
     */
    name?: string;
}

/**
 * A recipient value accepted by [SendMailMessage].
 *
 * A plain email string, an address object, or an array of either.
 */
export type SendMailRecipients = string | SendMailAddress | Array<string | SendMailAddress>;

/**
 * An email message to send through Cloudflare Email Service.
 *
 * At least one of [text] or [html] is required.
 */
export interface SendMailMessage {
    /**
     * Recipient(s).
     *
     * The combined number of addresses in `to`, `cc` and `bcc` must not exceed 50.
     */
    to: SendMailRecipients;

    /**
     * Carbon copy recipient(s).
     */
    cc?: SendMailRecipients;

    /**
     * Blind carbon copy recipient(s).
     */
    bcc?: SendMailRecipients;

    /**
     * Sender address. Its domain must be onboarded to Email Sending.
     */
    from: string | SendMailAddress;

    /**
     * Subject line.
     */
    subject: string;

    /**
     * Plain text body.
     */
    text?: string;

    /**
     * HTML body.
     */
    html?: string;

    /**
     * Reply-To address.
     */
    replyTo?: string | SendMailAddress;

    /**
     * Custom headers. Only headers on the Cloudflare allowlist are accepted.
     *
     * https://developers.cloudflare.com/email-service/reference/headers/
     */
    headers?: Record<string, string>;
}

/**
 * The result of [sendMail].
 */
export interface SendMailResult {
    /**
     * Message ID of the sent email, when returned by Cloudflare.
     */
    messageId?: string;

    /**
     * Addresses to which the message was delivered immediately.
     *
     * Only reported by the `api` transport. Always empty for the `binding` transport.
     */
    delivered: string[];

    /**
     * Addresses for which delivery was queued for later.
     *
     * Only reported by the `api` transport. Always empty for the `binding` transport.
     */
    queued: string[];

    /**
     * Addresses that permanently bounced.
     *
     * Only reported by the `api` transport. Always empty for the `binding` transport.
     */
    permanentBounces: string[];

    /**
     * Addresses dropped because they are on the suppression list.
     *
     * Only reported by the `api` transport when suppressed-recipient dropping is enabled.
     */
    suppressedRecipients?: string[];
}

/**
 * Email address object accepted by the Workers `send_email` binding.
 *
 * Addresses without a display name are sent as plain strings, so `name` is always set here.
 */
export interface SendEmailBindingAddress {
    email: string;
    name: string;
}

/**
 * Structured message accepted by the Workers `send_email` binding (`env.EMAIL.send()`).
 *
 * https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
 */
export interface SendEmailBindingMessage {
    to: string | SendEmailBindingAddress | Array<string | SendEmailBindingAddress>;
    cc?: string | SendEmailBindingAddress | Array<string | SendEmailBindingAddress>;
    bcc?: string | SendEmailBindingAddress | Array<string | SendEmailBindingAddress>;
    from: string | SendEmailBindingAddress;
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string | SendEmailBindingAddress;
    headers?: Record<string, string>;
}

/**
 * Minimal structural type of the Workers `send_email` binding.
 *
 * Compatible with `SendEmail` from `@cloudflare/workers-types`.
 */
export interface SendEmailBinding {
    send(message: SendEmailBindingMessage): Promise<{ messageId: string }>;
}

/**
 * Transport used by [sendMail].
 *
 * - `binding`: The Workers `send_email` binding (e.g. `env.EMAIL`). Use it when the sender domain belongs to the same Cloudflare account as the Worker.
 * - `api`: The Email Sending REST API with an API token that has the `Email Sending: Edit` permission. Use it to send from a domain onboarded on another account.
 */
export type SendMailTransport =
    | {
        type: "binding";
        /**
         * The `send_email` binding (e.g. `env.EMAIL`).
         */
        binding: SendEmailBinding;
    }
    | {
        type: "api";
        /**
         * Cloudflare account ID that owns the sender domain.
         */
        accountId: string;
        /**
         * Cloudflare API token with the `Email Sending: Edit` permission.
         */
        apiToken: string;
        /**
         * Custom fetch implementation. Defaults to the global `fetch`.
         */
        fetch?: typeof fetch;
    };

/**
 * Options for the Cloudflare Email Service worker.
 */
export interface CloudflareSendMailWorkersOptions extends WorkersOptions {
    /**
     * Transport to use. When specified, all other transport options are ignored.
     */
    transport?: SendMailTransport | undefined;

    /**
     * Transport type.
     *
     * If not specified, `binding` is used when the binding named [bindingName] exists in the Workers env, otherwise `api`.
     */
    type?: "binding" | "api" | undefined;

    /**
     * Name of the `send_email` binding in the Workers env.
     *
     * If not specified, it is resolved from the `MAIL_CLOUDFLARE_BINDING` environment variable, and defaults to `EMAIL`.
     */
    bindingName?: string | undefined;

    /**
     * Cloudflare account ID for the `api` transport.
     *
     * If not specified, it is resolved from the `MAIL_CLOUDFLARE_ACCOUNT_ID` environment variable.
     */
    accountId?: string | undefined;

    /**
     * Cloudflare API token for the `api` transport.
     *
     * If not specified, it is resolved from the `MAIL_CLOUDFLARE_API_TOKEN` environment variable (Workers secret).
     */
    apiToken?: string | undefined;
}

/**
 * Request body of the send mail function.
 */
export interface CloudflareSendMailRequest {
    from: string | SendMailAddress;
    to: SendMailRecipients;
    subject: string;
    text?: string;
    html?: string;
}

/**
 * Response body of the send mail function.
 */
export interface CloudflareSendMailResponse extends SendMailResult {
    success: boolean;
}
