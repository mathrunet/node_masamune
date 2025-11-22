import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /**
   * A function to enable the use of external Firebase Storage.
   * 
   * 外部のFirebase Storageを利用できるようにするためのFunction。
   */
  storageFirebase: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "storage_firebase", func: require("./functions/storage_firebase"), options: options }),
} as const;
