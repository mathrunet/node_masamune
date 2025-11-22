import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {  /**
   * After being redirected from [android_auth_code], you will get a refresh token to connect to Google's API. Applications Library System Users Volumes bin cores dev etc home opt private sbin tmp usr var Execute [android_auth_code] after registering the required information.
   *
   * [android_auth_code]からリダイレクトされた後、GoogleのAPIに接続するためのリフレッシュトークンを取得します。
   * 必要情報を登録した後[android_auth_code]を実行してください。
   */
  androidAuthCode: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "android_auth_code", func: require("./functions/android_auth_code"), options: options }),
  /**
   * After being redirected from [android_auth_code], you will get a refresh token to connect to Google's API. Applications Library System Users Volumes bin cores dev etc home opt private sbin tmp usr var Execute [android_auth_code] after registering the required information.
   *
   * [android_auth_code]からリダイレクトされた後、GoogleのAPIに接続するためのリフレッシュトークンを取得します。
   * 必要情報を登録した後[android_auth_code]を実行してください。
   */
  androidToken: (options: masamune.HttpFunctionsOptions = {}) => new masamune.FunctionsData({ id: "android_token", func: require("./functions/android_token"), options: options }),
} as const;
