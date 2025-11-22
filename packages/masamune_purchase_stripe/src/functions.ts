import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {  /**
   * Performs various Stripe processes.
   * 
   * Firestore integration is a must; please make Firestore available as well.
   *
   * Stripeの各種処理を実行します。
   * 
   * Firestoreとの連携が必須です。Firestoreも利用可能にしてください。
   */
  stripe: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "stripe", func: require("./functions/stripe"), options: options }),
  /**
   * Receives and processes webhooks from Stripe.
   * 
   * Please register the URL when you deploy this in your Stripe webhook settings.
   * 
   * Firestore integration is a must; please make Firestore available as well.
   *
   * StripeからのWebhookを受け取り処理を行います。
   * 
   * こちらをデプロイした際のURLをStripeのWebhook設定に登録してください。
   * 
   * Firestoreとの連携が必須です。Firestoreも利用可能にしてください。
   */
  stripeWebhook: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "stripe_webhook", func: require("./functions/stripe_webhook"), options: options }),
  /**
   * Receive and process webhooks for Stripe Connect.
   * 
   * If you do not use Stripe Connect, do not configure it as a Webhook.
   * 
   * Please register the URL when you deploy this in your Stripe webhook settings.
   * 
   * Firestore integration is a must; please make Firestore available as well.
   *
   * Stripe Connect用のWebhookを受信して処理します。
   * 
   * Stripe Connectを利用しない場合はWebhookとして設定しないでください。
   * 
   * こちらをデプロイした際のURLをStripeのWebhook設定に登録してください。
   * 
   * Firestoreとの連携が必須です。Firestoreも利用可能にしてください。
   */
  stripeWebhookConnect: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "stripe_webhook_connect", func: require("./functions/stripe_webhook_connect"), options: options }),
  /**
   * Webhook for proper redirection when 3D Secure authentication is required.
   * 
   * It is used by accessing the URL directly.
   * 
   * Please set here for [returnUrl].
   *
   * 3Dセキュア認証が必要な場合、適切なリダイレクトを行うためのWebhookです。
   * 
   * 直接URLにアクセスすることで利用します。
   * 
   * [returnUrl]にこちらを設定してください。
   */
  stripeWebhookSecure: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "stripe_webhook_secure", func: require("./functions/stripe_webhook_secure"), options: options }),
} as const;
