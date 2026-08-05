import { WorkersData, WorkersOptions } from "@mathrunet/masamune_cloudflare";
import { DeleteUserWorkersOptions } from "./lib/interface";

/**
 * Define a list of applicable Functions for Cloudflare Workers.
 * 
 * Cloudflare Workers用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
  /**
   * Delete the FirebaseAuthentication user.
   * 
   * FirebaseAuthenticationのユーザーを削除するようにします。
   */
  deleteUser: (options: DeleteUserWorkersOptions = {}) => new WorkersData({ path: "/delete_user", func: require("./functions/delete_user"), options: options as WorkersOptions }),
} as const;
