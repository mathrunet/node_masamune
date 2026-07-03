import { WorkersOptions } from "@mathrunet/masamune_cloudflare";

/**
 * Options for the geocoding worker.
 *
 * geocodingワーカーのオプション。
 */
export interface GeocodingWorkersOptions extends WorkersOptions {
    /**
     * API key for the Google Maps Geocoding API.
     *
     * If not specified, it is resolved from the `MAP_GEOCODING_APIKEY` environment variable (Workers secret).
     *
     * Google Maps Geocoding APIのAPIキー。
     *
     * 指定されていない場合は`MAP_GEOCODING_APIKEY`環境変数（Workersシークレット）から解決されます。
     */
    apiKey?: string | undefined;
}

/**
 * Response for geocoding function.
 *
 * geocoding関数のレスポンス。
 */
export interface GeocodingResponse {
    success: boolean;
    [key: string]: any;
}
