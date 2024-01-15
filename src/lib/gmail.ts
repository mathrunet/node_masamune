import {createTransport} from "nodemailer";
import * as functions from "firebase-functions/v2";

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
  const mailTransport = createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_GMAIL_ID,
      pass: process.env.MAIL_GMAIL_PASSWORD,
    },
  });
  await mailTransport.sendMail({
    from: from,
    to: to,
    subject: title,
    text: content,
  });
}
