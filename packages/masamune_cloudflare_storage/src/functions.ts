import * as masamune from "@mathrunet/masamune_cloudflare";
import { StorageWorkerData } from "./functions/storage_cloudflare";
import {
  StorageCloudflareBackupWorker,
  StorageCloudflareBackupWorkerData,
} from "./functions/storage_cloudflare_backup";

/**
 * Define a list of applicable Functions for Cloudflare Workers.
 * 
 * Cloudflare Workers用の適用可能なFunctionsの一覧を定義します。
 */
export const Functions = {
  storageCloudflare: (options: StorageWorkerData = {}) => new masamune.WorkersData({ path: "/storage_cloudflare", func: require("./functions/storage_cloudflare"), options: options }),
  storageCloudflareBackup: (
    options: StorageCloudflareBackupWorkerData = {},
  ) => new StorageCloudflareBackupWorker(options),
} as const;

export {
  R2EventNotification,
  StorageCloudflareBackupWorker,
  StorageCloudflareBackupWorkerData,
} from "./functions/storage_cloudflare_backup";
