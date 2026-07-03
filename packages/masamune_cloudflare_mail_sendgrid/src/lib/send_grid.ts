import { HttpError } from "@mathrunet/masamune_cloudflare";
import { SendGridRequest } from "./interface";

/**
 * Send mail through the SendGrid REST API (v3).
 *
 * SendGridのREST API（v3）でメールを送信します。
 *
 * @param {string} apiKey
 * API key for SendGrid. Issue it according to the following procedure.
 * https://mathru.notion.site/SendGrid-bb87b2ffa8174dbda944812f43856d6c
 * SendGridのAPIキー。下記の手順で発行します。
 * https://mathru.notion.site/SendGrid-bb87b2ffa8174dbda944812f43856d6c
 *
 * @param {string} content.from
 * Sender's email address.
 * 送信元メールアドレス。
 *
 * @param {string} content.to
 * Email address to be sent to.
 * 送信先メールアドレス。
 *
 * @param {string} content.subject
 * Email Title.
 * メールタイトル。
 *
 * @param {string} content.text
 * Email content.
 * メール本文。
 */
export async function send({
  apiKey,
  content,
}: {
  apiKey: string,
  content: SendGridRequest,
}): Promise<void> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: content.to }],
        },
      ],
      from: { email: content.from },
      subject: content.subject,
      content: [
        {
          type: "text/plain",
          value: content.text,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new HttpError(500, `Failed to send mail through SendGrid: ${res.status} ${body}`);
  }
}
