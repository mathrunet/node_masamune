import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {  /**
   * Performs a consumption-type in-app purchase. The value of the field in the document specified in [path] is added to [value].
   *
   * 消費型のアプリ内課金を行います。[path]に指定したドキュメント内のフィールドの値を[value]に加算します。
   */
  consumableVerifyAndroid: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "consumable_verify_android", func: require("./functions/consumable_verify_android"), options: options }),
  /**
   * Performs a consumption-type in-app purchase. The value of the field in the document specified in [path] is added to [value].
   *
   * 消費型のアプリ内課金を行います。[path]に指定したドキュメント内のフィールドの値を[value]に加算します。
   */
  consumableVerifyIOS: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "consumable_verify_ios", func: require("./functions/consumable_verify_ios"), options: options }),
  /**
   * Performs non-consumable in-app purchases. Unlock by setting the value of the field in the document specified in [path] to `true`.
   *
   * 非消費型のアプリ内課金を行います。[path]に指定したドキュメント内のフィールドの値を`true`にすることでアンロックを行います。
   */
  nonconsumableVerifyAndroid: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "nonconsumable_verify_android", func: require("./functions/nonconsumable_verify_android"), options: options }),
  /**
   * Performs non-consumable in-app purchases. Unlock by setting the value of the field in the document specified in [path] to `true`.
   *
   * 非消費型のアプリ内課金を行います。[path]に指定したドキュメント内のフィールドの値を`true`にすることでアンロックを行います。
   */
  nonconsumableVerifyIOS: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "nonconsumable_verify_ios", func: require("./functions/nonconsumable_verify_ios"), options: options }),
  /**
   * This is a webhook endpoint for Android. you can create a `purchasing` topic in GCP's pub/sub and set the principal to "google-play-developer-notifications@system.gserviceaccount.com" to receive notifications.
   *
   * Android用のWebhookのエンドポイントです。GCPのpub/subに`purchasing`のトピックを作成しプリンシパルに「google-play-developer-notifications@system.gserviceaccount.com」を設定することで通知を受け取ることができるようになります。
   */
  purchaseWebhookAndroid: (options: masamune.PubsubFunctionsOptions = {}) => new masamune.FunctionsData({ id: "purchase_webhook_android", func: require("./functions/purchase_webhook_android"), options: options }),
  /**
   * Webhook endpoint for IOS, which allows you to receive notifications by setting the endpoint in AppStoreConnect's [App]->[App Information]->[App Store Server Notification].
   *
   * IOS用のWebhookのエンドポイントです。AppStoreConnectの[App]->[App情報]->[App Storeサーバ通知]にエンドポイントを設定することで通知を受け取ることができるようになります。
   */
  purchaseWebhookIOS: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "purchase_webhook_ios", func: require("./functions/purchase_webhook_ios"), options: options }),
  /**
   * Verify subscriptions and add data.
   *
   * サブスクリプションの検証とデータの追加を行います。
   */
  subscriptionVerifyAndroid: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "subscription_verify_android", func: require("./functions/subscription_verify_android"), options: options }),
  /**
   * Verify subscriptions and add data.
   *
   * サブスクリプションの検証とデータの追加を行います。
   */
  subscriptionVerifyIOS: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "subscription_verify_ios", func: require("./functions/subscription_verify_ios"), options: options }),
} as const;
