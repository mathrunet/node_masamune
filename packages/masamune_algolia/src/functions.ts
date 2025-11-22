import * as data from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /** 
   * Synchronize data to Algolia.
   *
   * Algoliaにデータを同期します。
   */
  algolia: (options: data.PathFunctionsOptions = {}) => new data.FunctionsData({ id: "algolia", func: require("./functions/algolia"), options: options }),
} as const;
