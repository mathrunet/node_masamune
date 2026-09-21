import Stripe from "stripe";
import { Context } from "hono";
import { resolveConfig } from "@mathrunet/masamune_cloudflare/dist/lib/src/http_error";
import { WorkersOptions } from "@mathrunet/masamune_cloudflare/dist/lib/src/workers_base";
import { SqlDatabaseLike } from "./meter/d1_usage_event_store";
import { D1StripePurchaseStore, D1StripePurchaseStoreOptions } from "./purchase/d1_purchase_store";
import { StripePurchaseStore } from "./purchase/interface";
import { createStripeClient } from "./stripe_client";

/**
 * Email content sent for 3D Secure authentication.
 *
 * 3Dセキュア認証用に送信するメールの内容。
 */
export interface StripePurchaseEmail {
    /**
     * Sender's email address.
     *
     * 送信元メールアドレス。
     */
    from: string;

    /**
     * Email address to be sent to.
     *
     * 送信先メールアドレス。
     */
    to: string;

    /**
     * Email title.
     *
     * メールタイトル。
     */
    subject: string;

    /**
     * Email content.
     *
     * メール本文。
     */
    text: string;
}

/**
 * Options for the Stripe purchase workers.
 *
 * Stripe課金ワーカーのオプション。
 */
export interface StripePurchaseWorkersOptions extends WorkersOptions {
    /**
     * Stripe secret key.
     *
     * If not specified, it is resolved from the `PURCHASE_STRIPE_SECRETKEY` environment variable (Workers secret).
     *
     * Stripeのシークレットキー。
     *
     * 指定されていない場合は`PURCHASE_STRIPE_SECRETKEY`環境変数（Workersシークレット）から解決されます。
     */
    secretKey?: string | undefined;

    /**
     * Meter event name registered on Stripe (billing meters, basil or later).
     *
     * If not specified, it is resolved from the `PURCHASE_STRIPE_METER_EVENT_NAME` environment variable.
     *
     * Stripeに登録したMeterイベント名（billing meters、basil以降）。
     *
     * 指定されていない場合は`PURCHASE_STRIPE_METER_EVENT_NAME`環境変数から解決されます。
     */
    meterEventName?: string | undefined;

    /**
     * Signing secret for the main Stripe webhook.
     *
     * If not specified, it is resolved from the `PURCHASE_STRIPE_WEBHOOKSECRET` environment variable (Workers secret).
     *
     * StripeメインWebhookの署名シークレット。
     *
     * 指定されていない場合は`PURCHASE_STRIPE_WEBHOOKSECRET`環境変数（Workersシークレット）から解決されます。
     */
    webhookSecret?: string | undefined;

    /**
     * Signing secret for the Stripe Connect webhook.
     *
     * If not specified, it is resolved from the `PURCHASE_STRIPE_WEBHOOKCONNECTSECRET` environment variable (Workers secret).
     *
     * Stripe Connect用Webhookの署名シークレット。
     *
     * 指定されていない場合は`PURCHASE_STRIPE_WEBHOOKCONNECTSECRET`環境変数（Workersシークレット）から解決されます。
     */
    webhookConnectSecret?: string | undefined;

    /**
     * Purchase data store factory. Defaults to [D1StripePurchaseStore] on the D1
     * binding named by [d1Binding] (default `DB`).
     *
     * 購入データストアのファクトリ。デフォルトは[d1Binding]（既定`DB`）で指定した
     * D1バインディング上の[D1StripePurchaseStore]。
     */
    store?: ((context: Context) => StripePurchaseStore) | undefined;

    /**
     * Name of the D1 binding used by the default store. Defaults to `DB`.
     *
     * デフォルトストアが使用するD1バインディング名。デフォルトは`DB`。
     */
    d1Binding?: string | undefined;

    /**
     * Table name options for the default [D1StripePurchaseStore].
     *
     * デフォルトの[D1StripePurchaseStore]のテーブル名オプション。
     */
    tables?: D1StripePurchaseStoreOptions | undefined;

    /**
     * Resolve the email address of an application user (parity with
     * `admin.auth().getUser()` in the Firebase implementation). When not
     * specified, the `email` field of the stored user document and the billing
     * details of the default payment method are used as fallbacks.
     *
     * アプリケーションユーザーのメールアドレスを解決します（Firebase実装の
     * `admin.auth().getUser()`相当）。未指定の場合は保存済みユーザードキュメントの
     * `email`フィールドとデフォルト支払い方法のbilling detailsをフォールバックとして
     * 使用します。
     */
    resolveUserEmail?: ((context: Context, userId: string) => Promise<string | null | undefined>) | undefined;

    /**
     * Send an email for 3D Secure authentication. When not specified, the
     * provider resolved from `PURCHASE_STRIPE_EMAILPROVIDER` (default
     * `sendgrid`, using the `MAIL_SENDGRID_APIKEY` Workers secret) is used.
     *
     * 3Dセキュア認証用のメールを送信します。未指定の場合は
     * `PURCHASE_STRIPE_EMAILPROVIDER`（既定`sendgrid`、`MAIL_SENDGRID_APIKEY`の
     * Workersシークレットを使用）から解決したプロバイダーを使用します。
     */
    sendEmail?: ((context: Context, email: StripePurchaseEmail) => Promise<void>) | undefined;

    /**
     * Stripe SDK client factory. Defaults to [createStripeClient] with the
     * resolved secret key. Inject for tests.
     *
     * Stripe SDKクライアントのファクトリ。デフォルトは解決したシークレットキー
     * を用いた[createStripeClient]。テスト時に注入します。
     */
    stripeClient?: ((context: Context, secretKey: string) => Stripe) | undefined;
}

/**
 * Resolve the Stripe SDK client from options and the resolved secret key.
 *
 * オプションと解決済みシークレットキーからStripe SDKクライアントを解決します。
 */
export function resolveStripeClient(
    context: Context,
    options: StripePurchaseWorkersOptions,
    secretKey: string,
): Stripe {
    if (options.stripeClient) {
        return options.stripeClient(context, secretKey);
    }
    return createStripeClient({ secretKey });
}

/**
 * Resolve the Stripe secret key from options and `context.env`.
 *
 * オプションと`context.env`からStripeのシークレットキーを解決します。
 */
export function resolveStripeSecretKey(
    context: Context,
    options: StripePurchaseWorkersOptions,
): string {
    return resolveConfig(context, options.secretKey, "PURCHASE_STRIPE_SECRETKEY") ?? "";
}

/**
 * Resolve the Stripe meter event name from options and `context.env`.
 *
 * オプションと`context.env`からStripeのMeterイベント名を解決します。
 */
export function resolveStripeMeterEventName(
    context: Context,
    options: StripePurchaseWorkersOptions,
): string | undefined {
    return resolveConfig(context, options.meterEventName, "PURCHASE_STRIPE_METER_EVENT_NAME");
}

/**
 * Resolve the main webhook signing secret from options and `context.env`.
 *
 * オプションと`context.env`からメインWebhookの署名シークレットを解決します。
 */
export function resolveStripeWebhookSecret(
    context: Context,
    options: StripePurchaseWorkersOptions,
): string {
    return resolveConfig(context, options.webhookSecret, "PURCHASE_STRIPE_WEBHOOKSECRET") ?? "";
}

/**
 * Resolve the Connect webhook signing secret from options and `context.env`.
 *
 * オプションと`context.env`からConnect用Webhookの署名シークレットを解決します。
 */
export function resolveStripeWebhookConnectSecret(
    context: Context,
    options: StripePurchaseWorkersOptions,
): string {
    return resolveConfig(context, options.webhookConnectSecret, "PURCHASE_STRIPE_WEBHOOKCONNECTSECRET") ?? "";
}

/**
 * Resolve the purchase data store from options and `context.env`.
 *
 * オプションと`context.env`から購入データストアを解決します。
 */
export function resolveStripePurchaseStore(
    context: Context,
    options: StripePurchaseWorkersOptions,
): StripePurchaseStore {
    if (options.store) {
        return options.store(context);
    }
    const binding = options.d1Binding ?? "DB";
    const env = (context.env ?? {}) as Record<string, unknown>;
    const db = env[binding] as SqlDatabaseLike | undefined;
    if (!db) {
        throw new Error(`The D1 binding "${binding}" is not found. Set options.store or options.d1Binding.`);
    }
    return new D1StripePurchaseStore(db, options.tables ?? {});
}

/**
 * Resolve the email sender from options and `context.env`.
 *
 * Returns `null` when no provider is configured.
 *
 * オプションと`context.env`からメール送信手段を解決します。
 *
 * プロバイダーが未設定の場合は`null`を返します。
 */
export function resolveStripeEmailSender(
    context: Context,
    options: StripePurchaseWorkersOptions,
): ((email: StripePurchaseEmail) => Promise<void>) | null {
    if (options.sendEmail) {
        const sendEmail = options.sendEmail;
        return (email) => sendEmail(context, email);
    }
    const provider = resolveConfig(context, undefined, "PURCHASE_STRIPE_EMAILPROVIDER") ?? "sendgrid";
    switch (provider) {
        case "sendgrid": {
            const apiKey = resolveConfig(context, undefined, "MAIL_SENDGRID_APIKEY");
            if (!apiKey) {
                return null;
            }
            return (email) => sendWithSendGrid(apiKey, email);
        }
        default: {
            return null;
        }
    }
}

// SendGrid REST API (v3) 直呼び。@mathrunet/masamune_cloudflare_mail_sendgrid と
// 同一の送信仕様だが、同パッケージの再エクスポート連鎖をWorkersバンドルへ
// 持ち込まないためここにインライン実装する。
async function sendWithSendGrid(apiKey: string, email: StripePurchaseEmail): Promise<void> {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            personalizations: [
                {
                    to: [{ email: email.to }],
                },
            ],
            from: { email: email.from },
            subject: email.subject,
            content: [
                {
                    type: "text/plain",
                    value: email.text,
                },
            ],
        }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to send mail through SendGrid: ${res.status} ${body}`);
    }
}
