import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {  /**
   * Conduct detailed asset research.
   * 
   * アセットの詳細なリサーチを行います。
   */
  conductDetailedResearch: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "conductDetailedResearch", func: require("./functions/conduct_detailed_research"), options: options }),
} as const;
