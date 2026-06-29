import { WorkersOptions } from "./lib/src/workers_base";
import { WorkersData } from "./lib/src/workers_data";

/**
 * Define a list of applicable Functions for Cloudflare Workers.
 * 
 * Cloudflare Workers用の適用可能なFunctionsの一覧を定義します。
 */
export const Functions = {
  /**
   * Endpoints for testing.
   * 
   * テストを行うためのエンドポイントです。
   */
  test: (options: WorkersOptions = {}) => new WorkersData({ path: "/test", func: require("./workers/test"), options: options }),
} as const;
