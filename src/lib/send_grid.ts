import * as functions from "firebase-functions";
import * as sendgrid from "@sendgrid/mail";

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
export async function send({
  from,
  to,
  title,
  content,
}: {
  from: string,
  to: string,
  title: string,
  content: string,
}) {
  const config = functions.config().mail;
  sendgrid.setApiKey(config.sendgrid.api_key);
  const msg = {
    to: to,
    from: from,
    subject: title,
    text: content,
  };
  await sendgrid.send(msg);
}
