import { WorkersData, WorkersOptions } from "@mathrunet/masamune_cloudflare";
import { ShortLinkWorkersOptions } from "./lib/interface";

/**
 * Define a list of applicable Functions for CloudflareWorkers.
 */
export const Functions = {
  /**
   * Public redirect endpoint (`GET /s/<code>`). Authentication and rules are disabled by default.
   *
   * 公開リダイレクトエンドポイント（`GET /s/<code>`）。認証とルールはデフォルトで無効です。
   */
  shortLink: (options: ShortLinkWorkersOptions & { path?: string } = {}) => new WorkersData({
    path: normalizePath(options.path ?? "s"),
    func: require("./functions/short_link"),
    options: { auth: null, rules: null, ...options } as WorkersOptions,
  }),
  /**
   * Admin API (`/short_link`) protected by `SHORT_LINK_ADMIN_TOKEN`. Firebase authentication and rules are disabled by default.
   *
   * `SHORT_LINK_ADMIN_TOKEN`で保護された管理API（`/short_link`）。Firebase認証とルールはデフォルトで無効です。
   */
  shortLinkAdmin: (options: ShortLinkWorkersOptions & { path?: string } = {}) => new WorkersData({
    path: normalizePath(options.path ?? "short_link"),
    func: require("./functions/short_link_admin"),
    options: { auth: null, rules: null, ...options } as WorkersOptions,
  }),
} as const;

function normalizePath(path: string): string {
  return `/${path.replace(/^\/+|\/+$/g, "")}`;
}
