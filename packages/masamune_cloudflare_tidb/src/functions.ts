import { WorkersData, WorkersOptions } from "@mathrunet/masamune_cloudflare";
import { TidbWorkersOptions } from "./lib/types";

/**
 * Define a list of applicable Functions for Cloudflare Workers.
 * 
 * Cloudflare Workers用の適用可能なFunctionsの一覧を定義します。
 */
export const Functions = {
  /**
   * Endpoints for TiDB database CRUD.
   *
   * TiDBデータベースCRUD用のエンドポイントです。
   */
  tidb: (options: TidbWorkersOptions = {}) => new WorkersData({ path: "/tidb", func: require("./functions/tidb"), options: options as unknown as WorkersOptions }),

  /**
   * Endpoint for issuing scoped short-lived TiDB JWT tokens.
   *
   * スコープされた短命TiDB JWTトークン発行用のエンドポイントです。
   */
  tidbToken: (options: TidbWorkersOptions = {}) => new WorkersData({ path: "/tidb/token", func: require("./functions/tidb_token"), options: options as unknown as WorkersOptions }),
} as const;
