import * as functions from "firebase-functions/v2";
import * as stripe from "stripe";
import * as admin from "firebase-admin";
import { HttpFunctionsOptions } from "../lib/src/functions_base";

/**
 * Receive and process webhooks for Stripe Connect.
 * If you do not use Stripe Connect, do not configure it as a Webhook.
 * Please register the URL when you deploy this in your Stripe webhook settings.
 * Firestore integration is a must; please make Firestore available as well.
 *
 * Stripe Connect用のWebhookを受信して処理します。
 * Stripe Connectを利用しない場合はWebhookとして設定しないでください。
 * こちらをデプロイした際のURLをStripeのWebhook設定に登録してください。
 * Firestoreとの連携が必須です。Firestoreも利用可能にしてください。
 *
 * @param {string} process.env.PURCHASE_STRIPE_SECRETKEY
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
 * @param {string} process.env.PURCHASE_STRIPE_USERPATH
 * Stripe user (customer) pass.
 * Stripeのユーザー（カスタマー）用パス。
 *
 * @param {string} process.env.PURCHASE_STRIPE_WEBHOOKCONNECTSECRET
 * Specify the **Signature Secret** after setting it up as a webhook.
 * Webhookとして設定したあとの**署名シークレット**を指定します。
 *
 */
module.exports = (
  regions: string[],
  options: HttpFunctionsOptions,
  data: { [key: string]: string }
) => functions.https.onRequest(
  {
    region: options.region ?? regions,
    timeoutSeconds: options.timeoutSeconds,
    memory: options.memory,
    minInstances: options.minInstances,
    concurrency: options.concurrency,
    maxInstances: options.maxInstances,
  },
  async (req, res) => {
    try {
      const apiKey = process.env.PURCHASE_STRIPE_SECRETKEY ?? "";
      const stripeUserPath = process.env.PURCHASE_STRIPE_USERPATH ?? "plugins/stripe/user";
      const stripeWebhookConnectSecret = process.env.PURCHASE_STRIPE_WEBHOOKCONNECTSECRET ?? "";
      const firestoreInstance = admin.firestore();
      const stripeClient = new stripe.Stripe(apiKey, {
        apiVersion: "2023-10-16",
      });
      const signature = req.headers["stripe-signature"];
      if (!signature) {
        res.status(403).send(JSON.stringify({
          "error": "Access denied.",
        }));
        return;
      }
      const event = stripeClient.webhooks.constructEvent(req.rawBody, signature, stripeWebhookConnectSecret);

      switch (event.type) {
        case "account.updated": {
          const account = event.data.object as {
            [key: string]: any
          };
          const id = account["id"];
          if (!id) {
            res.status(404).send(JSON.stringify({
              "error": "The account id is not found.",
            }));
            return;
          }
          const col = await firestoreInstance.collection(`${stripeUserPath}`).where("account", "==", id).get();
          if (col.empty) {
            res.status(404).send(JSON.stringify({
              "error": "The account data is not found.",
            }));
            return;
          }
          const update: { [key: string]: any } = {};
          if (account["capabilities"]) {
            const capability: { [key: string]: any } = {};
            if (account["capabilities"]["card_payments"]) {
              capability["card_payments"] = true;
            }
            if (account["capabilities"]["transfers"]) {
              capability["transfers"] = true;
            }
            update["capability"] = capability;
          }
          await col.docs[0].ref.set(update, {
            merge: true,
          });

          res.status(200).send(JSON.stringify({
            "success": true,
          }));
          return;
        }
        default: {
          res.status(404).send(JSON.stringify({
            "error": `Event ${event.type} is not found.`,
          }));
          return;
        }
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
);
