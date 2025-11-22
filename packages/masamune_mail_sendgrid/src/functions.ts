import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {  /**
   * Send mail through SendGrid.
   *
   * SendGridでメールを送信します。
   */
  sendGrid: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "send_grid", func: require("./functions/send_grid"), options: options }),
} as const;
