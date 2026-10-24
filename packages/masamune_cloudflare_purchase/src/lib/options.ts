import { Context } from "hono";
import { DatabaseAdapterBase, resolveConfig, WorkersOptions } from "@mathrunet/masamune_cloudflare";
import { DEFAULT_USER_DOCUMENT_PATH } from "./auth";

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
     * Template of the per-user document that stores wallet and unlock fields. Must contain `{userId}`.
     * Client-supplied `path` values must be `<template>/<fieldKey>` for the authenticated user.
     *
     * If not specified, it is resolved from the `PURCHASE_USERPATH` environment variable, then defaults to `plugins/iap/user/{userId}`.
     *
     * ウォレット・アンロックのフィールドを保存するユーザー別ドキュメントのテンプレート。`{userId}`を含む必要があります。
     * クライアントが指定する`path`は認証済みユーザーの`<テンプレート>/<フィールドキー>`でなければなりません。
     *
     * 指定されていない場合は`PURCHASE_USERPATH`環境変数から解決され、それも無ければ`plugins/iap/user/{userId}`になります。
     */
    userDocumentPath?: string | undefined;

    /**
     * iOS bundle ID. Required for StoreKit 2 verification and App Store Server Notifications;
     * signed transactions whose `bundleId` differs are rejected.
     *
     * If not specified, it is resolved from the `PURCHASE_IOS_BUNDLEID` environment variable (Workers secret).
     *
     * iOSのバンドルID。StoreKit 2の検証とApp Store Server Notificationsでは必須で、
     * `bundleId`が異なる署名付きトランザクションは拒否されます。
     *
     * 指定されていない場合は`PURCHASE_IOS_BUNDLEID`環境変数（Workersシークレット）から解決されます。
     */
    iosBundleId?: string | undefined;

    /**
     * Accepted App Store environment (`Production` or `Sandbox`). When unset, both are accepted.
     *
     * If not specified, it is resolved from the `PURCHASE_IOS_ENVIRONMENT` environment variable.
     *
     * 受け入れるApp Store環境（`Production`または`Sandbox`）。未設定の場合は両方を受け入れます。
     *
     * 指定されていない場合は`PURCHASE_IOS_ENVIRONMENT`環境変数から解決されます。
     */
    iosEnvironment?: string | undefined;

    /**
     * Trusted root certificates (base64 DER) for Apple JWS verification. Defaults to Apple Root CA - G3.
     * Intended for tests or future root rotation.
     *
     * Apple JWS検証で信頼するルート証明書（base64 DER）。デフォルトはApple Root CA - G3です。
     * テストや将来のルート更新向けです。
     */
    iosRootCertificates?: string[] | undefined;

    /**
     * Android package name. When set, requests whose `packageName` differs are rejected.
     *
     * If not specified, it is resolved from the `PURCHASE_ANDROID_PACKAGENAME` environment variable.
     *
     * Androidのパッケージ名。設定した場合、`packageName`が異なるリクエストは拒否されます。
     *
     * 指定されていない場合は`PURCHASE_ANDROID_PACKAGENAME`環境変数から解決されます。
     */
    androidPackageName?: string | undefined;

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

/**
 * Resolve the per-user document path template from options and `context.env`.
 *
 * オプションと`context.env`からユーザー別ドキュメントパスのテンプレートを解決します。
 */
export function resolveUserDocumentPath(
    context: Context,
    options: PurchaseWorkersOptions,
): string {
    return resolveConfig(context, options.userDocumentPath, "PURCHASE_USERPATH") ?? DEFAULT_USER_DOCUMENT_PATH;
}

/**
 * Resolve the iOS bundle ID from options and `context.env`.
 *
 * オプションと`context.env`からiOSのバンドルIDを解決します。
 */
export function resolveIOSBundleId(
    context: Context,
    options: PurchaseWorkersOptions,
): string | undefined {
    return resolveConfig(context, options.iosBundleId, "PURCHASE_IOS_BUNDLEID");
}

/**
 * Resolve the accepted App Store environment from options and `context.env`.
 *
 * オプションと`context.env`から受け入れるApp Store環境を解決します。
 */
export function resolveIOSEnvironment(
    context: Context,
    options: PurchaseWorkersOptions,
): string | undefined {
    return resolveConfig(context, options.iosEnvironment, "PURCHASE_IOS_ENVIRONMENT");
}

/**
 * Resolve the trusted root certificates for Apple JWS verification.
 *
 * Apple JWS検証で信頼するルート証明書を解決します。
 */
export function resolveIOSRootCertificates(
    options: PurchaseWorkersOptions,
): string[] | undefined {
    return options.iosRootCertificates && options.iosRootCertificates.length > 0
        ? options.iosRootCertificates
        : undefined;
}

/**
 * Resolve the Android package name from options and `context.env`.
 *
 * オプションと`context.env`からAndroidのパッケージ名を解決します。
 */
export function resolveAndroidPackageName(
    context: Context,
    options: PurchaseWorkersOptions,
): string | undefined {
    return resolveConfig(context, options.androidPackageName, "PURCHASE_ANDROID_PACKAGENAME");
}
