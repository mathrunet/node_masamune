import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {  /** 
   * Function for periodic processing.
   * 
   * 定期的に処理するためのFunction。
   */
  scheduler: (options: masamune.SchedulerFunctionsOptions = {}) => new masamune.FunctionsData({ id: "scheduler", func: require("./functions/scheduler"), options: options }),
} as const;
