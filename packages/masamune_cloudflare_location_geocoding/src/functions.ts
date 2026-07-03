import { WorkersData, WorkersOptions } from "@mathrunet/masamune_cloudflare";
import { GeocodingWorkersOptions } from "./lib/interface";

/**
 * Define a list of applicable Functions for CloudflareWorkers.
 *
 * CloudflareWorkers用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /**
   * Get latitude and longitude with GeocodingAPI.
   *
   * GeocodingAPIで緯度経度を取得します。
   */
  geocoding: (options: GeocodingWorkersOptions = {}) => new WorkersData({ path: "/geocoding", func: require("./functions/geocoding"), options: options as WorkersOptions }),
} as const;
