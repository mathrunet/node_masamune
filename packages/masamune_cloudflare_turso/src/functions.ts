import { WorkersData } from "@mathrunet/masamune_cloudflare";
import { TursoWorkersOptions } from "./lib/types";

/**
 * Define a list of applicable Functions for Cloudflare Workers.
 * 
 * Cloudflare Workers用の適用可能なFunctionsの一覧を定義します。
 */
export const Functions = {
  /**
   * Endpoints for Turso database CRUD.
   *
   * TursoデータベースCRUD用のエンドポイントです。
   */
  turso: (options: TursoWorkersOptions = {}) => new WorkersData({ path: "/turso", func: require("./functions/turso"), options: options }),

  /**
   * Endpoint for issuing scoped short-lived Turso tokens.
   *
   * スコープされた短命Tursoトークン発行用のエンドポイントです。
   */
  tursoToken: (options: TursoWorkersOptions = {}) => new WorkersData({ path: "/turso/token", func: require("./functions/turso_token"), options: options }),
} as const;
