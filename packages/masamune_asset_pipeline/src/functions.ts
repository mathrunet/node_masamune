import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /**
   * Start the asset creation process.
   * 
   * アセット作成プロセスを開始します。
   */
  startAssetCreation: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "start_asset_creation", func: require("./functions/start_asset_creation"), options: options }),
  /**
   * Periodically check and start asset creation.
   * 
   * 定期的にアセット作成をチェックし開始します。
   */
  scheduleAssetCreation: (options: masamune.SchedulerFunctionsOptions = {}) => new masamune.FunctionsData({ id: "schedule_asset_creation", func: require("./functions/schedule_asset_creation"), options: options }),
  /**
   * Conduct extensive research on assets.
   * 
   * アセットの広範囲のリサーチを行います。
   */
  conductBroadResearch: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "conductBroadResearch", func: require("./functions/conduct_broad_research"), options: options }),
  /**
   * Conduct detailed asset research.
   * 
   * アセットの詳細なリサーチを行います。
   */
  conductDetailedResearch: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "conductDetailedResearch", func: require("./functions/conduct_detailed_research"), options: options }),
} as const;
