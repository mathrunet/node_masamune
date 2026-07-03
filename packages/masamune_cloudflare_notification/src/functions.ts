import * as masamune from "@mathrunet/masamune_cloudflare";

/**
 * Define a list of applicable Functions for CloudflareWorkers.
 * 
 * CloudflareWorkers用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {  /** 
   * Function for sending PUSH notifications.
   * 
   * PUSH通知を送信するためのFunction。
   */
  sendNotification: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "send_notification", func: require("./functions/send_notification"), options: options }),
} as const;
