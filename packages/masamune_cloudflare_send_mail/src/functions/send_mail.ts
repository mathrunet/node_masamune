import { Context, Hono } from "hono";
import { HttpError, jsonError, resolveConfig } from "@mathrunet/masamune_cloudflare";
import { INVALID_MESSAGE_ERROR_CODE, SendMailError, sendMail } from "../lib/send_mail";
import {
    CloudflareSendMailResponse,
    CloudflareSendMailWorkersOptions,
    SendEmailBinding,
    SendMailMessage,
    SendMailTransport,
} from "../lib/interface";

/**
 * Default name of the `send_email` binding.
 */
const DEFAULT_BINDING_NAME = "EMAIL";

/**
 * Send mail through Cloudflare Email Service (Email Sending).
 *
 * The transport is resolved in the following order.
 *
 * 1. [options.transport] if specified.
 * 2. The `send_email` binding named [options.bindingName], `MAIL_CLOUDFLARE_BINDING` or `EMAIL` in the Workers env (unless [options.type] is `api`).
 * 3. The REST API with [options.accountId] / `MAIL_CLOUDFLARE_ACCOUNT_ID` and [options.apiToken] / `MAIL_CLOUDFLARE_API_TOKEN` (unless [options.type] is `binding`).
 *
 * @param {string | { email: string, name?: string }} from
 * Sender's email address.
 *
 * @param {string | { email: string, name?: string } | Array<string | { email: string, name?: string }>} to
 * Email address(es) to be sent to.
 *
 * @param {string} subject
 * Email subject.
 *
 * @param {string} text
 * Plain text body. At least one of `text` or `html` is required.
 *
 * @param {string} html
 * HTML body. At least one of `text` or `html` is required.
 */
module.exports = (
    hono: Hono,
    options: CloudflareSendMailWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        try {
            let body: { [key: string]: any };
            try {
                body = await context.req.json() as { [key: string]: any };
            } catch {
                throw new HttpError(400, "Query parameter is invalid.");
            }
            if (!body || typeof body !== "object" || !body.from || !body.to || !body.subject || (!body.text && !body.html)) {
                throw new HttpError(400, "Query parameter is invalid.");
            }
            const transport = resolveTransport(context, options);
            const message: SendMailMessage = {
                from: body.from,
                to: body.to,
                subject: body.subject,
                text: typeof body.text === "string" ? body.text : undefined,
                html: typeof body.html === "string" ? body.html : undefined,
            };
            const result = await sendMail({ transport, message });
            const response: CloudflareSendMailResponse = {
                success: true,
                ...result,
            };
            return context.json(response);
        } catch (err) {
            return jsonError(context, toHttpError(err));
        }
    });
    return hono;
};

function resolveTransport(
    context: Context,
    options: CloudflareSendMailWorkersOptions,
): SendMailTransport {
    if (options.transport) {
        return options.transport;
    }
    const type = options.type;
    if (type !== "api") {
        const bindingName = resolveConfig(context, options.bindingName, "MAIL_CLOUDFLARE_BINDING") ?? DEFAULT_BINDING_NAME;
        const env = (context.env ?? {}) as Record<string, unknown>;
        const binding = env[bindingName] as SendEmailBinding | undefined;
        if (binding && typeof binding.send === "function") {
            return { type: "binding", binding };
        }
        if (type === "binding") {
            throw new HttpError(500, `The send_email binding "${bindingName}" is not set.`);
        }
    }
    const accountId = resolveConfig(context, options.accountId, "MAIL_CLOUDFLARE_ACCOUNT_ID");
    const apiToken = resolveConfig(context, options.apiToken, "MAIL_CLOUDFLARE_API_TOKEN");
    if (!accountId) {
        throw new HttpError(500, "MAIL_CLOUDFLARE_ACCOUNT_ID is not set.");
    }
    if (!apiToken) {
        throw new HttpError(500, "MAIL_CLOUDFLARE_API_TOKEN is not set.");
    }
    return { type: "api", accountId, apiToken };
}

function toHttpError(err: unknown): unknown {
    if (!(err instanceof SendMailError)) {
        return err;
    }
    if (err.code === INVALID_MESSAGE_ERROR_CODE) {
        return new HttpError(400, err.message);
    }
    if (err.status === 429 || err.code === "E_RATE_LIMIT_EXCEEDED") {
        return new HttpError(429, err.message);
    }
    return new HttpError(500, err.message);
}
