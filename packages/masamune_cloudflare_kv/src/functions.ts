import { WorkersData, WorkersOptions } from "@mathrunet/masamune_cloudflare";
import { CloudflareKvWorkersOptions } from "./lib/types";

/**
 * Define a list of applicable Functions for Cloudflare Workers.
 *  
 * Cloudflare Workers用の適用可能なFunctionsの一覧を定義します。
 */
export const Functions = {
  /**
   * Endpoint for using Cloudflare KV as a document-oriented model adapter.
   *
   * Cloudflare KVをドキュメント指向のModelAdapterとして利用するためのエンドポイントです。
   */
  kv: (options: CloudflareKvWorkersOptions = {}) => new WorkersData({ path: "/kv", func: require("./functions/kv"), options: options as unknown as WorkersOptions }),
} as const;
