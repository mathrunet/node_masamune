import * as functions from "firebase-functions/v2";
import * as gmail from "../lib/gmail";
import { HttpFunctionsOptions } from "@mathrunet/masamune";

/**
 * Send email via Gmail.
 *
 * Gmailでメールを送信します。
 *
 * @param {string} process.env.MAIL_GMAIL_ID
 * Gmail user ID. Follow the steps below to obtain a Gmail user ID.
 * 1. Press your icon in the upper right corner of the Google top screen and open "Manage Google Account".
 * 2. open "Security" on the left side of the screen and open "App Password
 * GmailのユーザーID。下記の手順で取得します。
 * 1. Googleのトップ画面の画面右上の自分のアイコンを押下し、「Google アカウントを管理」を開く
 * 2. 画面左の「セキュリティ」を開き、「アプリ パスワード」を開く
 *
 * @param {string} process.env.MAIL_GMAIL_PASSWORD
 * Gmail user password. Enter the password obtained in the above procedure.
 * Gmailのユーザーパスワード。上記の手順で取得したパスワードを入力します。
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
            await gmail.send({
                from: from,
                to: to,
                title: title,
                content: content,
            });
            return {
                success: true,
            };
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
);
