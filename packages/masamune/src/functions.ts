import * as katana from "@mathrunet/katana";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {  /**
   * Endpoints for testing.
   * 
   * テストを行うためのエンドポイントです。
   */
  test: (options: katana.HttpFunctionsOptions = {}) => new katana.FunctionsData({ id: "test", func: require("./functions/test"), options: options }),
} as const;
