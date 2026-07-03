import { WorkersData, WorkersOptions } from "@mathrunet/masamune_cloudflare";
import { AndroidTokenWorkersOptions } from "./lib/interface";

/**
 * Define a list of applicable Functions for CloudflareWorkers.
 *
 * CloudflareWorkers用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /**
   * Redirects to Google's OAuth consent screen to obtain an authorization code for connecting to Google's API.
   * Execute [android_auth_code] after registering the required information.
   *
   * GoogleのAPIに接続するための認可コードを取得するため、GoogleのOAuth同意画面にリダイレクトします。
   * 必要情報を登録した後[android_auth_code]を実行してください。
   */
  androidAuthCode: (options: AndroidTokenWorkersOptions = {}) => new WorkersData({ path: "/android_auth_code", func: require("./functions/android_auth_code"), options: { auth: null, ...options } as WorkersOptions }),
  /**
   * After being redirected from [android_auth_code], you will get a refresh token to connect to Google's API.
   * Execute [android_auth_code] after registering the required information.
   *
   * [android_auth_code]からリダイレクトされた後、GoogleのAPIに接続するためのリフレッシュトークンを取得します。
   * 必要情報を登録した後[android_auth_code]を実行してください。
   */
  androidToken: (options: AndroidTokenWorkersOptions = {}) => new WorkersData({ path: "/android_token", func: require("./functions/android_token"), options: { auth: null, ...options } as WorkersOptions }),
} as const;
