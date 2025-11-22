import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {  /** 
   * Get latitude and longitude with GeocodingAPI.
   *
   * GeocodingAPIで緯度経度を取得します。
   */
  geocoding: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "geocoding", func: require("./functions/geocoding"), options: options }),
} as const;
