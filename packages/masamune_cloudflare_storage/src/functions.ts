import * as masamune from "@mathrunet/masamune_cloudflare";
import { StorageWorkerData } from "./functions/storage_cloudflare";

/**
 * Define a list of applicable Functions for Cloudflare Workers.
 * 
 * Cloudflare Workers用の適用可能なFunctionsの一覧を定義します。
 */
export const Functions = {
  storageCloudflare: (options: StorageWorkerData = {}) => new masamune.WorkersData({ path: "/storage_cloudflare", func: require("./functions/storage_cloudflare"), options: options }),
} as const;
