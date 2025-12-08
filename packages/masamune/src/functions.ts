import { HttpFunctionsOptions } from "./lib/src/functions_base";
import { FunctionsData } from "./lib/src/functions_data";

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
  test: (options: HttpFunctionsOptions = {}) => new FunctionsData({ id: "test", func: require("./functions/test"), options: options }),
} as const;
