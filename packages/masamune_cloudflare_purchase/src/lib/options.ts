import { Context } from "hono";
import { DatabaseAdapterBase, resolveConfig, WorkersOptions } from "@mathrunet/masamune_cloudflare";

/**
 * Options for the purchase workers.
 *
 * 課金ワーカーのオプション。
 */
export interface PurchaseWorkersOptions extends WorkersOptions {
    /**
     * The email address of your Google service account.
     *
     * If not specified, it is resolved from the `PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL` environment variable (Workers secret).
     *
     * Googleのサービスアカウントのメールアドレス。
     *
     * 指定されていない場合は`PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL`環境変数（Workersシークレット）から解決されます。
     */
    androidServiceAccountEmail?: string | undefined;

    /**
     * A private key for your Google service account.
     *
     * If not specified, it is resolved from the `PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY` environment variable (Workers secret).
     *
     * Googleのサービスアカウントのプライベートキー。
     *
     * 指定されていない場合は`PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY`環境変数（Workersシークレット）から解決されます。
     */
    androidServiceAccountPrivateKey?: string | undefined;

    /**
     * SharedSecret for AppStore, obtained from [Apps]->[App Info]->[Shared Secret for App] in the AppStore.
     *
     * If not specified, it is resolved from the `PURCHASE_IOS_SHAREDSECRET` environment variable (Workers secret).
     *
     * AppStoreのSharedSecret。AppStoreの[アプリ]->[App情報]->[App用共有シークレット]から取得します。
     *
     * 指定されていない場合は`PURCHASE_IOS_SHAREDSECRET`環境変数（Workersシークレット）から解決されます。
     */
    iosSharedSecret?: string | undefined;

    /**
     * The path to the collection of subscriptions.
     *
     * If not specified, it is resolved from the `PURCHASE_SUBSCRIPTIONPATH` environment variable (Workers secret).
     *
     * サブスクリプションのコレクションのパス。
     *
     * 指定されていない場合は`PURCHASE_SUBSCRIPTIONPATH`環境変数（Workersシークレット）から解決されます。
     */
    subscriptionPath?: string | undefined;

    /**
     * Database adapter for storing wallet, unlock and subscription data (e.g. `TursoDatabaseAdapter`).
     *
     * ウォレット・アンロック・サブスクリプションデータを保存するためのデータベースアダプター（例: `TursoDatabaseAdapter`）。
     */
    database?: DatabaseAdapterBase | undefined;
}

/**
 * Resolve Android service account credentials from options and `context.env`.
 *
 * オプションと`context.env`からAndroidサービスアカウントの認証情報を解決します。
 */
export function resolveAndroidServiceAccount(
    context: Context,
    options: PurchaseWorkersOptions,
): { email: string, privateKey: string } {
    return {
        email: resolveConfig(context, options.androidServiceAccountEmail, "PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL") ?? "",
        privateKey: resolveConfig(context, options.androidServiceAccountPrivateKey, "PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY") ?? "",
    };
}

/**
 * Resolve the AppStore shared secret from options and `context.env`.
 *
 * オプションと`context.env`からAppStoreの共有シークレットを解決します。
 */
export function resolveIOSSharedSecret(
    context: Context,
    options: PurchaseWorkersOptions,
): string {
    return resolveConfig(context, options.iosSharedSecret, "PURCHASE_IOS_SHAREDSECRET") ?? "";
}

/**
 * Resolve the subscription collection path from options and `context.env`.
 *
 * オプションと`context.env`からサブスクリプションのコレクションパスを解決します。
 */
export function resolveSubscriptionPath(
    context: Context,
    options: PurchaseWorkersOptions,
): string | undefined {
    return resolveConfig(context, options.subscriptionPath, "PURCHASE_SUBSCRIPTIONPATH");
}
