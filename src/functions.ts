import * as data from "./lib/functions_data";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /** 
   * Function for sending PUSH notifications.
   * 
   * PUSH通知を送信するためのFunction。
   */
  sendNotification: new data.FunctionsData("send_notification", require("./functions/send_notification")),
} as const;
