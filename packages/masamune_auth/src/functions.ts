import * as katana from "@mathrunet/katana";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 * 
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /**
   * Delete the FirebaseAuthentication user.
   * 
   * FirebaseAuthenticationのユーザーを削除するようにします。
   */
  deleteUser: (options: katana.HttpFunctionsOptions = {}) => new katana.FunctionsData({ id: "delete_user", func: require("./functions/delete_user"), options: options }),
} as const;
