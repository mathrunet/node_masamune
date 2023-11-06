import * as functions from "firebase-functions";
import * as stripe from "stripe";
import * as admin from "firebase-admin";
import "../exntension/string.extension"

/**
 * Webhook for proper redirection when 3D Secure authentication is required.
 * Please set here for [returnUrl].
 *
 * 3Dセキュア認証が必要な場合、適切なリダイレクトを行うためのWebhookです。
 * [returnUrl]にこちらを設定してください。
 *
 * @param {string} purchase.stripe.secret_key
 * API key (secret key) to connect to Stripe.
 * Log in to the following URL and create a project.
 * After the project is created, the secret key can be copied.
 *
 * Stripeへ接続するためのAPIキー（シークレットキー）。
 * 下記URLにログインし、プロジェクトを作成します。
 * プロジェクト作成後、シークレットキーをコピーすることができます。
 *
 * Production environment
 * https://dashboard.stripe.com/apikeys
 * Development enveironment
 * https://dashboard.stripe.com/test/apikeys
 *
 * @param {string} purchase.stripe.user_path
 * Stripe user (customer) pass.
 * Stripeのユーザー（カスタマー）用パス。
 *
 * @param {string} purchase.stripe.purchase_path
 * Path for purchase information to be placed under [purchase.stripe.user_path].
 * [purchase.stripe.user_path]の下に配置する購入情報用パス。
 *
 * @param {string} userId
 * [required]
 * Specify the purchaser's user ID.
 * 購入者のユーザーIDを指定します。
 *
 * @param {string} orderId
 * [required]
 * Specify the order ID. This will be the database key.
 * 注文IDを指定します。これがデータベースのキーとなります。
 *
 * @param {string} successUrl
 * [required]
 * Specify the URL to redirect to upon success due to browser settings, etc.
 * ブラウザの設定等による成功時のリダイレクト先URLを指定します。
 *
 * @param {string} failureUrl
 * [required]
 * Specify the URL to redirect to upon failure due to browser settings, etc.
 * ブラウザの設定等による失敗時のリダイレクト先URLを指定します。
 *
 */
module.exports = (regions: string[], timeoutSeconds: number, data: { [key: string]: string }) => functions.runWith({timeoutSeconds: timeoutSeconds}).region(...regions).https.onRequest(
  async (req, res) => {
    try {
      const config = functions.config().purchase;
      const stripeConfig = config.stripe;
      const apiKey = stripeConfig.secret_key;
      const stripeUserPath = stripeConfig.user_path;
      const stripePurchasePath = stripeConfig.purchase_path;
      const firestoreInstance = admin.firestore();
      const stripeClient = new stripe.Stripe(apiKey, {
        apiVersion: "2022-11-15",
      });
      const token = req.query.token;
      if (!token || typeof token !== "string") {
        res.status(403).send(JSON.stringify({
          "error": "Invalid parameters",
        }));
        return;
      }
      const param = JSON.parse(token.decrypt({
        key: apiKey.slice(0, 32),
        ivKey: apiKey.slice(-16),
      }));
      if (!param["userId"] || !param["orderId"] || !param["successUrl"] || !param["failureUrl"]) {
        res.status(403).send(JSON.stringify({
          "error": "Invalid parameters",
        }));
        return;
      }

      const userId = param["userId"];
      const orderId = param["orderId"];
      const successUrl = param["successUrl"];
      const failureUrl = param["failureUrl"];

      const doc = await firestoreInstance.doc(`${stripeUserPath}/${userId}/${stripePurchasePath}/${orderId}`).get();
      const data = doc.data();
      if (!data || !data["paymentId"]) {
        res.status(404).send(JSON.stringify({
          "error": "The purchase data is not found.",
        }));
        return;
      }
      const purchase = await stripeClient.paymentIntents.retrieve(
        data["paymentId"],
      );
      if (!purchase) {
        res.status(404).send(JSON.stringify({
          "error": "The purchase data is not found.",
        }));
        return;
      }
      const status = purchase.status;
      if (status === "requires_capture" || status === "succeeded" || status === "processing") {
        res.redirect(successUrl);
      } else {
        res.redirect(failureUrl);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
);
