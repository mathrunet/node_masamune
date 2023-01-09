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
  notification: new data.FunctionsData("notification", require("./functions/notification")),
} as const;
