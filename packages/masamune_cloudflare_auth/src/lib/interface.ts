import { WorkersOptions } from "@mathrunet/masamune_cloudflare";

/**
 * Options for the Firebase Authentication user deletion worker.
 *
 * Firebase Authenticationユーザー削除Workerのオプション。
 */
export interface DeleteUserWorkersOptions extends WorkersOptions {
    /**
     * Service account JSON string.
     *
     * If not specified, it is resolved from the `GOOGLE_SERVICE_ACCOUNT` environment variable (Workers secret).
     *
     * サービスアカウントのJSON文字列。
     *
     * 指定されていない場合は`GOOGLE_SERVICE_ACCOUNT`環境変数（Workersシークレット）から解決されます。
     */
    serviceAccount?: string | undefined;

    /**
     * Firebase project ID.
     *
     * If not specified, `project_id` in the service account JSON is used.
     *
     * FirebaseプロジェクトID。
     *
     * 指定されていない場合は、サービスアカウントJSONの`project_id`を使用します。
     */
    projectId?: string | undefined;

    /**
     * OAuth2 scopes used to delete the Firebase Authentication user.
     *
     * Firebase Authenticationユーザーの削除に使用するOAuth2スコープ。
     */
    scopes?: string[] | undefined;
}

/**
 * Delete user response interface.
 * 
 * ユーザー削除レスポンスインターフェース。
 */
export interface DeleteUserResponse {
    success: boolean;
}
