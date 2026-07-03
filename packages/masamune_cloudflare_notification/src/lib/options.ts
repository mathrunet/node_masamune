import { Context } from "hono";
import { DatabaseAdapterBase, resolveConfig, WorkersOptions } from "@mathrunet/masamune_cloudflare";

/**
 * Options for the notification worker.
 *
 * 通知ワーカーのオプション。
 */
export interface NotificationWorkersOptions extends WorkersOptions {
    /**
     * Service account JSON string used to obtain FCM access tokens.
     *
     * If not specified, it is resolved from the `GOOGLE_SERVICE_ACCOUNT` environment variable (Workers secret).
     *
     * FCMのアクセストークンを取得するためのサービスアカウントJSON文字列。
     *
     * 指定されていない場合は`GOOGLE_SERVICE_ACCOUNT`環境変数（Workersシークレット）から解決されます。
     */
    serviceAccount?: string | undefined;

    /**
     * Firebase project ID for FCM. If not specified, the `project_id` in the service account JSON is used.
     *
     * FCM用のFirebaseプロジェクトID。指定されていない場合はサービスアカウントJSON内の`project_id`が使用されます。
     */
    projectId?: string | undefined;

    /**
     * Database adapter used to resolve tokens from collections and documents (e.g. `TursoDatabaseAdapter`).
     *
     * コレクションやドキュメントからトークンを解決するためのデータベースアダプター（例: `TursoDatabaseAdapter`）。
     */
    database?: DatabaseAdapterBase | undefined;
}

/**
 * Resolve the service account JSON from options and `context.env`.
 *
 * オプションと`context.env`からサービスアカウントJSONを解決します。
 */
export function resolveNotificationServiceAccount(
    context: Context,
    options: NotificationWorkersOptions,
): string | undefined {
    return resolveConfig(context, options.serviceAccount, "GOOGLE_SERVICE_ACCOUNT");
}
