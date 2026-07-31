import { Context } from "hono";
import { TidbWorkersOptions } from "./types";

/**
 * Default header name that marks the request as a server request.
 *
 * リクエストをサーバーリクエストとして扱うためのデフォルトヘッダー名。
 */
export const defaultTidbServerAccessHeader = "x-masamune-server-token";

/**
 * Returns true when the request presents the configured server access token.
 *
 * CRUD endpoints are called directly from clients, so rules must be evaluated
 * as a client request unless the request explicitly proves that it comes from
 * a trusted backend. When no `serverAccessToken` is configured, every request
 * is treated as a client request.
 *
 * 設定されたサーバーアクセストークンを提示している場合にtrueを返します。
 *
 * CRUDエンドポイントはクライアントから直接呼び出されるため、信頼できる
 * バックエンドからのリクエストであることを明示的に証明できない限り、rulesは
 * クライアントリクエストとして評価しなければなりません。`serverAccessToken`が
 * 設定されていない場合、すべてのリクエストをクライアントリクエストとして扱います。
 */
export function isTidbServerRequest(
  context: Context,
  options: TidbWorkersOptions,
): boolean {
  const token = options.serverAccessToken;
  if (typeof token !== "string" || token.length === 0) {
    return false;
  }
  const header = options.serverAccessHeader && options.serverAccessHeader.length > 0
    ? options.serverAccessHeader
    : defaultTidbServerAccessHeader;
  const presented = context.req.header(header);
  if (typeof presented !== "string" || presented.length === 0) {
    return false;
  }
  return timingSafeEqual(presented, token);
}

/**
 * Compares two strings without leaking the matched length by timing.
 *
 * 一致した文字数をタイミングから漏らさずに2つの文字列を比較します。
 */
function timingSafeEqual(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    mismatch |= (left.charCodeAt(i) | 0) ^ (right.charCodeAt(i) | 0);
  }
  return mismatch === 0;
}
