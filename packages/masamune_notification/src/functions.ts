import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {  /** 
   * Function for sending PUSH notifications.
   * 
   * PUSH通知を送信するためのFunction。
   */
  sendNotification: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "send_notification", func: require("./functions/send_notification"), options: options }),
} as const;
