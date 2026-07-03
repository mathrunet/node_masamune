import { Context, Hono } from "hono";
import { HttpError, jsonError, resolveConfig } from "@mathrunet/masamune_cloudflare";
import * as sendgrid from "../lib/send_grid";
import { SendGridRequest, SendGridResponse, SendGridWorkersOptions } from "../lib/interface";

/**
 * Send mail through SendGrid.
 *
 * SendGridでメールを送信します。
 *
 * @param {string} MAIL_SENDGRID_APIKEY
 * API key for SendGrid. Specify it in [options.apiKey] or the `MAIL_SENDGRID_APIKEY` Workers secret. Issue it according to the following procedure.
 * https://mathru.notion.site/SendGrid-bb87b2ffa8174dbda944812f43856d6c
 * SendGridのAPIキー。[options.apiKey]または`MAIL_SENDGRID_APIKEY`のWorkersシークレットで指定します。下記の手順で発行します。
 * https://mathru.notion.site/SendGrid-bb87b2ffa8174dbda944812f43856d6c
 *
 * @param {string} from
 * Sender's email address.
 * 送信元メールアドレス。
 *
 * @param {string} to
 * Email address to be sent to.
 * 送信先メールアドレス。
 *
 * @param {string} title
 * Email Title.
 * メールタイトル。
 *
 * @param {string} content
 * Email content.
 * メール本文。
 */
module.exports = (
    hono: Hono,
    options: SendGridWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        try {
            const body = await context.req.json() as { [key: string]: any };
            const from = body.from as string | null | undefined;
            const to = body.to as string | null | undefined;
            const title = body.title as string | null | undefined;
            const content = body.content as string | null | undefined;
            if (!from || !to || !title || !content) {
                throw new HttpError(400, "Query parameter is invalid.");
            }
            const apiKey = resolveConfig(context, options.apiKey, "MAIL_SENDGRID_APIKEY");
            if (!apiKey) {
                throw new HttpError(500, "MAIL_SENDGRID_APIKEY is not set.");
            }
            const request: SendGridRequest = {
                from: from,
                to: to,
                subject: title,
                text: content,
            };
            await sendgrid.send({ apiKey, content: request });
            const response: SendGridResponse = {
                success: true,
            };
            return context.json(response);
        } catch (err) {
            return jsonError(context, err);
        }
    });
    return hono;
};
