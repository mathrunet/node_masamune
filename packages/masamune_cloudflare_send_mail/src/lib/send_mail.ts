import {
    SendEmailBindingAddress,
    SendEmailBindingMessage,
    SendMailAddress,
    SendMailMessage,
    SendMailRecipients,
    SendMailResult,
    SendMailTransport,
} from "./interface";

/**
 * Base URL of the Cloudflare API.
 */
export const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";

/**
 * Maximum combined number of addresses in `to`, `cc` and `bcc`.
 *
 * https://developers.cloudflare.com/email-service/platform/limits/
 */
export const MAX_RECIPIENTS = 50;

/**
 * Error code used for invalid messages detected before sending.
 */
export const INVALID_MESSAGE_ERROR_CODE = "INVALID_MESSAGE";

/**
 * Error code used for invalid transport configuration.
 */
export const INVALID_TRANSPORT_ERROR_CODE = "INVALID_TRANSPORT";

/**
 * Error code used when the REST API could not be reached.
 */
export const NETWORK_ERROR_CODE = "NETWORK_ERROR";

/**
 * Error code used when the REST API returned an unexpected response.
 */
export const INVALID_RESPONSE_ERROR_CODE = "INVALID_RESPONSE";

/**
 * Error codes of the Workers binding that can be retried.
 *
 * https://developers.cloudflare.com/email-service/api/send-emails/workers-api/#error-codes
 */
const RETRYABLE_BINDING_ERROR_CODES = new Set([
    "E_RATE_LIMIT_EXCEEDED",
    "E_INTERNAL_SERVER_ERROR",
]);

/**
 * Error thrown by [sendMail].
 */
export class SendMailError extends Error {
    /**
     * HTTP status code returned by the REST API. Undefined for validation errors and binding errors.
     */
    readonly status?: number;

    /**
     * Error code.
     *
     * - Validation: `INVALID_MESSAGE` / `INVALID_TRANSPORT`.
     * - `binding` transport: the string code thrown by the binding (e.g. `E_SENDER_NOT_VERIFIED`).
     * - `api` transport: the numeric Cloudflare error code as a string (e.g. `10001`), `NETWORK_ERROR` or `INVALID_RESPONSE`.
     */
    readonly code?: string;

    /**
     * Whether retrying the same request later may succeed.
     */
    readonly retryable: boolean;

    constructor(
        message: string,
        options: { status?: number; code?: string; retryable?: boolean; cause?: unknown } = {},
    ) {
        super(message);
        this.name = "SendMailError";
        this.status = options.status;
        this.code = options.code;
        this.retryable = options.retryable ?? false;
        if (options.cause !== undefined) {
            (this as { cause?: unknown }).cause = options.cause;
        }
    }
}

/**
 * Send an email through Cloudflare Email Service (Email Sending).
 *
 * https://developers.cloudflare.com/email-service/api/send-emails/
 *
 * @param {SendMailTransport} options.transport
 * `binding` uses the Workers `send_email` binding. `api` uses the REST API `POST /accounts/{account_id}/email/sending/send`.
 *
 * @param {SendMailMessage} options.message
 * Message to send. At least one of `text` or `html` is required.
 *
 * @throws {SendMailError}
 * Thrown when the message is invalid or Cloudflare rejects the request.
 */
export async function sendMail({
    transport,
    message,
}: {
    transport: SendMailTransport;
    message: SendMailMessage;
}): Promise<SendMailResult> {
    validateMessage(message);
    if (!transport || typeof transport !== "object") {
        throw invalidTransport("transport is required.");
    }
    switch (transport.type) {
        case "binding":
            return sendWithBinding(transport, message);
        case "api":
            return sendWithApi(transport, message);
        default:
            throw invalidTransport(`Unsupported transport type: ${String((transport as { type?: unknown }).type)}.`);
    }
}

async function sendWithBinding(
    transport: Extract<SendMailTransport, { type: "binding" }>,
    message: SendMailMessage,
): Promise<SendMailResult> {
    const binding = transport.binding;
    if (!binding || typeof binding.send !== "function") {
        throw invalidTransport("transport.binding must be a send_email binding.");
    }
    const payload: SendEmailBindingMessage = {
        to: toBindingRecipients(message.to)!,
        from: toBindingAddress(message.from),
        subject: message.subject,
    };
    const cc = toBindingRecipients(message.cc);
    const bcc = toBindingRecipients(message.bcc);
    if (cc !== undefined) payload.cc = cc;
    if (bcc !== undefined) payload.bcc = bcc;
    if (hasText(message.text)) payload.text = message.text;
    if (hasText(message.html)) payload.html = message.html;
    if (message.replyTo !== undefined) payload.replyTo = toBindingAddress(message.replyTo);
    if (message.headers !== undefined) payload.headers = { ...message.headers };
    let result: { messageId?: unknown } | undefined;
    try {
        result = await binding.send(payload);
    } catch (err) {
        const code = typeof (err as { code?: unknown })?.code === "string"
            ? (err as { code: string }).code
            : undefined;
        const reason = err instanceof Error ? err.message : String(err);
        throw new SendMailError(
            `Failed to send mail through the Cloudflare send_email binding${code ? ` (${code})` : ""}: ${reason}`,
            {
                code,
                retryable: code !== undefined && RETRYABLE_BINDING_ERROR_CODES.has(code),
                cause: err,
            },
        );
    }
    return {
        messageId: typeof result?.messageId === "string" ? result.messageId : undefined,
        delivered: [],
        queued: [],
        permanentBounces: [],
    };
}

async function sendWithApi(
    transport: Extract<SendMailTransport, { type: "api" }>,
    message: SendMailMessage,
): Promise<SendMailResult> {
    if (!isNonEmptyString(transport.accountId)) {
        throw invalidTransport("transport.accountId is required.");
    }
    if (!isNonEmptyString(transport.apiToken)) {
        throw invalidTransport("transport.apiToken is required.");
    }
    const apiToken = transport.apiToken;
    const url = `${CLOUDFLARE_API_BASE_URL}/accounts/${encodeURIComponent(transport.accountId)}/email/sending/send`;
    const body: Record<string, unknown> = {
        to: toApiRecipients(message.to),
        from: toApiAddress(message.from),
        subject: message.subject,
    };
    const cc = toApiRecipients(message.cc);
    const bcc = toApiRecipients(message.bcc);
    if (cc !== undefined) body.cc = cc;
    if (bcc !== undefined) body.bcc = bcc;
    if (hasText(message.text)) body.text = message.text;
    if (hasText(message.html)) body.html = message.html;
    if (message.replyTo !== undefined) body.reply_to = toApiAddress(message.replyTo);
    if (message.headers !== undefined) body.headers = { ...message.headers };

    // Call through a local variable so that the Workers runtime does not
    // invoke `fetch` with the transport object as `this` (Illegal invocation).
    const doFetch: typeof fetch = transport.fetch ?? globalThis.fetch;
    let response: Response;
    try {
        response = await doFetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new SendMailError(
            redact(`Failed to reach the Cloudflare Email Sending API: ${reason}`, apiToken),
            { code: NETWORK_ERROR_CODE, retryable: true },
        );
    }

    const status = response.status;
    const json = await readJson(response);
    const errors = Array.isArray(json?.errors) ? json!.errors as Array<{ code?: unknown; message?: unknown }> : [];
    const detail = errors
        .map((e) => [e?.code, e?.message].filter((v) => v !== undefined && v !== null && v !== "").join(" "))
        .filter((v) => v.length > 0)
        .join(", ");
    const firstCode = errors.length > 0 && errors[0]?.code !== undefined && errors[0]?.code !== null
        ? String(errors[0].code)
        : undefined;

    if (!response.ok) {
        throw new SendMailError(
            redact(`Failed to send mail through the Cloudflare Email Sending API: ${status}${detail ? ` ${detail}` : ""}`, apiToken),
            {
                status,
                code: firstCode,
                retryable: status === 429 || status >= 500,
            },
        );
    }
    if (!json || json.success !== true) {
        throw new SendMailError(
            redact(`Cloudflare Email Sending API reported a failure: ${status}${detail ? ` ${detail}` : ""}`, apiToken),
            {
                status,
                code: firstCode ?? INVALID_RESPONSE_ERROR_CODE,
                retryable: false,
            },
        );
    }
    const result = (json.result ?? {}) as Record<string, unknown>;
    const output: SendMailResult = {
        messageId: typeof result.message_id === "string" ? result.message_id : undefined,
        delivered: toStringArray(result.delivered),
        queued: toStringArray(result.queued),
        permanentBounces: toStringArray(result.permanent_bounces),
    };
    if (Array.isArray(result.suppressed_recipients)) {
        output.suppressedRecipients = toStringArray(result.suppressed_recipients);
    }
    return output;
}

/**
 * Validate a message before sending.
 *
 * @throws {SendMailError}
 * Thrown with code `INVALID_MESSAGE` when the message is invalid.
 */
export function validateMessage(message: SendMailMessage): void {
    if (!message || typeof message !== "object") {
        throw invalidMessage("message is required.");
    }
    const to = normalizeRecipients(message.to, "to");
    if (to.length === 0) {
        throw invalidMessage("to is required.");
    }
    const cc = normalizeRecipients(message.cc, "cc");
    const bcc = normalizeRecipients(message.bcc, "bcc");
    if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
        throw invalidMessage(`The combined number of recipients in to, cc and bcc must not exceed ${MAX_RECIPIENTS}.`);
    }
    if (message.from === undefined || message.from === null) {
        throw invalidMessage("from is required.");
    }
    validateAddress(message.from, "from");
    if (message.replyTo !== undefined) {
        validateAddress(message.replyTo, "replyTo");
    }
    if (!isNonEmptyString(message.subject)) {
        throw invalidMessage("subject is required.");
    }
    if (/[\r\n]/.test(message.subject)) {
        throw invalidMessage("subject must not contain line breaks.");
    }
    if (message.text !== undefined && typeof message.text !== "string") {
        throw invalidMessage("text must be a string.");
    }
    if (message.html !== undefined && typeof message.html !== "string") {
        throw invalidMessage("html must be a string.");
    }
    if (!hasText(message.text) && !hasText(message.html)) {
        throw invalidMessage("At least one of text or html is required.");
    }
    if (message.headers !== undefined) {
        if (!message.headers || typeof message.headers !== "object" || Array.isArray(message.headers)) {
            throw invalidMessage("headers must be an object of strings.");
        }
        for (const [key, value] of Object.entries(message.headers)) {
            if (typeof value !== "string" || !isNonEmptyString(key)) {
                throw invalidMessage("headers must be an object of strings.");
            }
        }
    }
}

function normalizeRecipients(
    value: SendMailRecipients | undefined,
    field: string,
): Array<string | SendMailAddress> {
    if (value === undefined || value === null) {
        return [];
    }
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
        validateAddress(item, field);
    }
    return list;
}

function validateAddress(value: unknown, field: string): void {
    const email = typeof value === "string"
        ? value
        : value && typeof value === "object"
            ? (value as { email?: unknown }).email
            : undefined;
    if (!isNonEmptyString(email)) {
        throw invalidMessage(`${field} must be a non-empty email address.`);
    }
    if (/[\s<>,]/.test(email.trim()) || !email.includes("@")) {
        throw invalidMessage(`${field} contains an invalid email address.`);
    }
    if (value && typeof value === "object") {
        const name = (value as { name?: unknown }).name;
        if (name !== undefined && name !== null && typeof name !== "string") {
            throw invalidMessage(`${field} name must be a string.`);
        }
        if (typeof name === "string" && /[\r\n]/.test(name)) {
            throw invalidMessage(`${field} name must not contain line breaks.`);
        }
    }
}

function toBindingAddress(value: string | SendMailAddress): string | SendEmailBindingAddress {
    if (typeof value === "string") {
        return value.trim();
    }
    return isNonEmptyString(value.name)
        ? { email: value.email.trim(), name: value.name }
        : value.email.trim();
}

function toBindingRecipients(
    value: SendMailRecipients | undefined,
): string | SendEmailBindingAddress | Array<string | SendEmailBindingAddress> | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    return Array.isArray(value) ? value.map(toBindingAddress) : toBindingAddress(value);
}

function toApiAddress(value: string | SendMailAddress): string | { address: string; name: string } {
    if (typeof value === "string") {
        return value.trim();
    }
    return isNonEmptyString(value.name)
        ? { address: value.email.trim(), name: value.name }
        : value.email.trim();
}

function toApiRecipients(
    value: SendMailRecipients | undefined,
): string | { address: string; name: string } | Array<string | { address: string; name: string }> | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    return Array.isArray(value) ? value.map(toApiAddress) : toApiAddress(value);
}

async function readJson(response: Response): Promise<Record<string, any> | undefined> {
    try {
        const text = await response.text();
        if (!text) {
            return undefined;
        }
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? parsed as Record<string, any> : undefined;
    } catch {
        return undefined;
    }
}

function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function hasText(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function redact(message: string, secret: string): string {
    return secret ? message.split(secret).join("[REDACTED]") : message;
}

function invalidMessage(message: string): SendMailError {
    return new SendMailError(message, { code: INVALID_MESSAGE_ERROR_CODE, retryable: false });
}

function invalidTransport(message: string): SendMailError {
    return new SendMailError(message, { code: INVALID_TRANSPORT_ERROR_CODE, retryable: false });
}
