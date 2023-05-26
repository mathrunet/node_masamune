import * as functions from "firebase-functions";
import * as sendgrid from "../lib/send_grid";

/**
 * Send mail through SendGrid.
 *
 * SendGridでメールを送信します。
 *
 * @param {string} purchase.mail.sendgrid.api_key
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
module.exports = (regions: string[]) => functions.region(...regions).https.onCall(
    async (query) => {
        try {
            const from = query.from;
            const to = query.to;
            const title = query.title;
            const content = query.content;
            if (!from || !to || !title || !content) {
                throw new functions.https.HttpsError("invalid-argument", "Query parameter is invalid.");
            }
            await sendgrid.send(from, to, title, content);
            return {
                success: true,
            };
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
