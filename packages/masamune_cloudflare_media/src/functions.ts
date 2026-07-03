import { WorkersData, WorkersOptions } from "@mathrunet/masamune_cloudflare";
import { MediaWorkersOptions } from "./lib/options";

/**
 * Define a list of applicable Functions for CloudflareWorkers.
 *
 * CloudflareWorkers用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /**
   * Convert videos to HLS format using Cloudflare Stream.
   *
   * Cloudflare Streamを使用して動画をHLS形式に変換します。
   */
  hls: (options: MediaWorkersOptions = {}) => new WorkersData({ path: "/hls", func: require("./functions/hls"), options: options as WorkersOptions }),
} as const;
