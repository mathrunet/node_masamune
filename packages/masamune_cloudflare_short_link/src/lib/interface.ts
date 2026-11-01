import { WorkersOptions } from "@mathrunet/masamune_cloudflare";

/**
 * Minimal subset of the Cloudflare `KVNamespace` binding used by this package.
 *
 * このパッケージで利用するCloudflare `KVNamespace`バインディングの最小インターフェース。
 */
export interface ShortLinkKVNamespace {
    get(key: string, type: "text"): Promise<string | null>;
    put(key: string, value: string, options?: { expiration?: number; expirationTtl?: number; metadata?: unknown }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
        keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
        list_complete: boolean;
        cursor?: string;
    }>;
}

/**
 * A short link stored in KV.
 *
 * KVに保存される短縮リンク。
 */
export interface ShortLinkRecord {
    /**
     * Short code (the `<code>` part of `/s/<code>`).
     *
     * 短縮コード（`/s/<code>`の`<code>`部分）。
     */
    code: string;

    /**
     * Destination URL.
     *
     * リダイレクト先のURL。
     */
    url: string;

    /**
     * Query parameters (e.g. `utm_source`) appended to [url] on redirect. They override the same keys in [url].
     *
     * リダイレクト時に[url]へ付与するクエリパラメータ（`utm_source`など）。[url]内の同名キーを上書きします。
     */
    params?: Record<string, string>;

    /**
     * Free text memo for operators.
     *
     * 運用者向けのメモ。
     */
    note?: string;

    /**
     * Creation time (ISO 8601).
     *
     * 作成日時（ISO 8601）。
     */
    createdAt: string;

    /**
     * Last update time (ISO 8601).
     *
     * 最終更新日時（ISO 8601）。
     */
    updatedAt: string;

    /**
     * Expiration time (ISO 8601). Expired links are treated as not found.
     *
     * 有効期限（ISO 8601）。期限切れのリンクは存在しないものとして扱います。
     */
    expiresAt?: string;
}

/**
 * Options shared by [Functions.shortLink] and [Functions.shortLinkAdmin].
 *
 * [Functions.shortLink]と[Functions.shortLinkAdmin]で共通のオプション。
 */
export interface ShortLinkWorkersOptions extends WorkersOptions {
    /**
     * Name of the KV binding. Falls back to the `SHORT_LINK_KV_BINDING` env var, then `SHORT_LINK_KV`.
     *
     * KVバインディング名。未指定時は環境変数`SHORT_LINK_KV_BINDING`、次に`SHORT_LINK_KV`を使います。
     */
    bindingName?: string;

    /**
     * KV binding instance. Takes precedence over [bindingName] (useful for tests).
     *
     * KVバインディングのインスタンス。[bindingName]より優先されます（テスト用）。
     */
    namespace?: ShortLinkKVNamespace;

    /**
     * Prefix of KV keys. Defaults to `short_link:`.
     *
     * KVキーのプレフィックス。デフォルトは`short_link:`。
     */
    keyPrefix?: string;

    /**
     * Hosts allowed as destinations. A leading `*.` allows subdomains. If empty, every https host is allowed.
     *
     * リダイレクト先として許可するホスト。`*.`で始めるとサブドメインを許可します。空の場合はすべてのhttpsホストを許可します。
     */
    allowedHosts?: string[];

    /**
     * URL to redirect to when the code does not exist or has expired. Returns 404 if not set.
     *
     * コードが存在しない、または期限切れの場合のリダイレクト先。未指定の場合は404を返します。
     */
    notFoundUrl?: string;

    /**
     * Length of automatically generated codes. Defaults to 7.
     *
     * 自動生成するコードの長さ。デフォルトは7。
     */
    codeLength?: number;

    /**
     * Admin token for [Functions.shortLinkAdmin]. Falls back to the `SHORT_LINK_ADMIN_TOKEN` env var (Workers secret).
     *
     * [Functions.shortLinkAdmin]の管理トークン。未指定時は環境変数`SHORT_LINK_ADMIN_TOKEN`（Workers secret）を使います。
     */
    adminToken?: string;

    /**
     * Hook to customize the final destination (e.g. convert `utm_*` to store specific parameters).
     *
     * 最終的なリダイレクト先をカスタマイズするフック（`utm_*`をストア固有のパラメータへ変換するなど）。
     */
    resolveDestination?: (record: ShortLinkRecord, destination: URL, env: Record<string, unknown>) => URL | string | Promise<URL | string>;
}

/**
 * Request body to create or update a short link.
 *
 * 短縮リンクの作成・更新リクエストのボディ。
 */
export interface ShortLinkInput {
    url: string;
    params?: Record<string, string>;
    code?: string;
    note?: string;
    expiresAt?: string;
}
