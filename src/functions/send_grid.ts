import * as functions from "firebase-functions/v2";
import * as sendgrid from "../lib/functions/send_grid";
import { HttpFunctionsOptions } from "../lib/src/functions_base";

/**
 * Send mail through SendGrid.
 *
 * SendGridでメールを送信します。
 *
 * @param {string} process.env.MAIL_SENDGRID_APIKEY
 * API key for SendGrid. Issue it according to the following procedure.
 * https://mathru.notion.site/SendGrid-bb87b2ffa8174dbda944812f43856d6c
 * SendGridのAPIキー。下記の手順で発行します。
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
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => functions.https.onCall(
    {
        region: options.region ?? regions,
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
        serviceAccount: options?.serviceAccount ?? undefined,
        enforceAppCheck: options.enforceAppCheck ?? undefined,
        consumeAppCheckToken: options.consumeAppCheckToken ?? undefined,
    },
    async (query) => {
        try {
            const from = query.data.from as string | null | undefined;
            const to = query.data.to as string | null | undefined;
            const title = query.data.title as string | null | undefined;
            const content = query.data.content as string | null | undefined;
            if (!from || !to || !title || !content) {
                throw new functions.https.HttpsError("invalid-argument", "Query parameter is invalid.");
            }
            await sendgrid.send({
                from: from,
                to: to,
                title: title,
                content: content,
            });
            return {
                success: true,
            };
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
