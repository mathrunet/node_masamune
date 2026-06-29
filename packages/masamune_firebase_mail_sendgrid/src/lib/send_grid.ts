import sendgrid from "@sendgrid/mail";
import { SendGridRequest } from "./interface";

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
export async function send(content: SendGridRequest) {
  sendgrid.setApiKey(process.env.MAIL_SENDGRID_APIKEY ?? "");
  const result = await sendgrid.send(content);
  return result;
}
