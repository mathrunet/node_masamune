import { WorkersData, WorkersOptions } from "@mathrunet/masamune_cloudflare";
import { GoogleTokenWorkersOptions } from "./lib/interface";

/**
 * Define a list of applicable Functions for CloudflareWorkers.
 *
 * CloudflareWorkers用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /**
   * A function to get a Google Cloud Platform authentication token.
   *
   * Google Cloud Platformの認証トークンを取得するためのFunction。
   */
  googleToken: (options: GoogleTokenWorkersOptions = {}) => new WorkersData({ path: "/google_token", func: require("./functions/google_token"), options: options as WorkersOptions }),
} as const;
