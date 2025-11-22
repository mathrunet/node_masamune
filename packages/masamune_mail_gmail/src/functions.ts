import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /**
   * Send email via Gmail.
   *
   * Gmailでメールを送信します。
   */
  gmail: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "gmail", func: require("./functions/gmail"), options: options }),
} as const;
