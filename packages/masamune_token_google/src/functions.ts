import * as data from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {  /**
   * A function to get a Google Cloud Platform authentication token.
   * 
   * Google Cloud Platformの認証トークンを取得するためのFunction。
   */
  googleToken: (options: data.HttpFunctionsOptions = {}) => new data.FunctionsData({ id: "google_token", func: require("./functions/google_token"), options: options }),
} as const;
