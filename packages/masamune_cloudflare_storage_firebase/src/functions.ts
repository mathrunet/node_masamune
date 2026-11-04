import * as masamune from "@mathrunet/masamune_cloudflare";
import { StorageFirebaseWorkerData } from "./functions/storage_firebase";

/**
 * Define a list of applicable Functions for Cloudflare Workers.
 *
 * Cloudflare Workers用の適用可能なFunctionsの一覧を定義します。
 */
export const Functions = {
  // [options] is also passed as [data] so that storage-specific settings
  // (bucket, publicBaseUrl, ...) reach the worker.
  storageFirebase: (options: StorageFirebaseWorkerData = {}) => new masamune.WorkersData({ path: "/storage_firebase", func: require("./functions/storage_firebase"), options: options, data: options }),
} as const;

export { StorageFirebaseWorkerData } from "./functions/storage_firebase";
