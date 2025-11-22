import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {  /**
   * Convert videos uploaded to storage to HLS format.
   * 
   * ストレージにアップロードされた動画をHLS形式に変換します。
   */
  hls: (options: masamune.StorageFunctionsOptions = {}) => new masamune.FunctionsData({ id: "hls", func: require("./functions/hls"), options: options }),
} as const;
