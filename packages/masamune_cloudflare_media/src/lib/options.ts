import { WorkersOptions } from "@mathrunet/masamune_cloudflare";

/**
 * Options for the media workers.
 *
 * メディアワーカーのオプション。
 */
export interface MediaWorkersOptions extends WorkersOptions {
    /**
     * Cloudflare account ID.
     *
     * If not specified, it is resolved from the `CLOUDFLARE_ACCOUNT_ID` environment variable (Workers secret).
     *
     * CloudflareのアカウントID。
     *
     * 指定されていない場合は`CLOUDFLARE_ACCOUNT_ID`環境変数（Workersシークレット）から解決されます。
     */
    accountId?: string | undefined;

    /**
     * API token with Cloudflare Stream permissions.
     *
     * If not specified, it is resolved from the `CLOUDFLARE_STREAM_APITOKEN` environment variable (Workers secret).
     *
     * Cloudflare Streamの権限を持つAPIトークン。
     *
     * 指定されていない場合は`CLOUDFLARE_STREAM_APITOKEN`環境変数（Workersシークレット）から解決されます。
     */
    apiToken?: string | undefined;

    /**
     * Binding name of the R2 bucket that stores the source videos (default: `R2_BUCKET`).
     *
     * ソース動画を保存しているR2バケットのバインディング名（デフォルト: `R2_BUCKET`）。
     */
    bucketBindingName?: string | undefined;

    /**
     * Public base URL of the storage. Used to build the source URL from an R2 key.
     *
     * ストレージの公開ベースURL。R2キーからソースURLを構築するために使用します。
     */
    publicBaseUrl?: string | undefined;

    /**
     * Base URL of the storage worker's `/download` endpoint. Used together with [downloadUrlSecret] to build a signed source URL from an R2 key.
     *
     * ストレージワーカーの`/download`エンドポイントのベースURL。[downloadUrlSecret]と組み合わせて、R2キーから署名付きソースURLを構築するために使用します。
     */
    downloadBaseUrl?: string | undefined;

    /**
     * Secret used to sign download URLs (same as the storage worker's secret).
     *
     * If not specified, it is resolved from the `STORAGE_DOWNLOAD_URL_SECRET` environment variable (Workers secret).
     *
     * ダウンロードURLの署名に使用するシークレット（ストレージワーカーのシークレットと同じもの）。
     *
     * 指定されていない場合は`STORAGE_DOWNLOAD_URL_SECRET`環境変数（Workersシークレット）から解決されます。
     */
    downloadUrlSecret?: string | undefined;

    /**
     * Whether the converted video requires signed URLs for playback.
     *
     * 変換後の動画の再生に署名付きURLを必要とするかどうか。
     */
    requireSignedURLs?: boolean | undefined;
}
