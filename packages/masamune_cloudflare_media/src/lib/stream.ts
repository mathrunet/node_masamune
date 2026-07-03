import { HttpError } from "@mathrunet/masamune_cloudflare";

/**
 * Video information returned by the Cloudflare Stream API.
 *
 * Cloudflare Stream APIから返される動画情報。
 */
export interface StreamVideo {
    uid: string;
    readyToStream: boolean;
    status?: { state?: string | undefined } | undefined;
    playback?: {
        hls?: string | undefined,
        dash?: string | undefined,
    } | undefined;
    [key: string]: any;
}

/**
 * Client for the Cloudflare Stream API.
 *
 * Cloudflare Stream APIのクライアント。
 */
export class StreamClient {
    /**
     * Client for the Cloudflare Stream API.
     *
     * Cloudflare Stream APIのクライアント。
     *
     * @param config.accountId
     * Cloudflare account ID.
     *
     * CloudflareのアカウントID。
     *
     * @param config.apiToken
     * API token with Cloudflare Stream permissions.
     *
     * Cloudflare Streamの権限を持つAPIトークン。
     */
    constructor({
        accountId,
        apiToken,
    }: {
        accountId: string,
        apiToken: string,
    }) {
        this.accountId = accountId;
        this.apiToken = apiToken;
    }

    readonly accountId: string;
    readonly apiToken: string;

    /**
     * Copy a video from a URL into Cloudflare Stream. The video is automatically converted to HLS/DASH.
     *
     * URLからCloudflare Streamに動画をコピーします。動画は自動的にHLS/DASHに変換されます。
     */
    async copyFromUrl({
        url,
        meta,
        requireSignedURLs,
    }: {
        url: string,
        meta?: { [key: string]: string } | undefined,
        requireSignedURLs?: boolean | undefined,
    }): Promise<StreamVideo> {
        return await this.request("POST", "/stream/copy", {
            url: url,
            meta: meta,
            requireSignedURLs: requireSignedURLs ?? false,
        });
    }

    /**
     * Get the video information.
     *
     * 動画情報を取得します。
     */
    async getVideo(uid: string): Promise<StreamVideo> {
        return await this.request("GET", `/stream/${uid}`);
    }

    /**
     * Delete the video.
     *
     * 動画を削除します。
     */
    async deleteVideo(uid: string): Promise<void> {
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream/${uid}`,
            {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${this.apiToken}`,
                },
            },
        );
        if (!res.ok) {
            const body = await res.text();
            throw new HttpError(500, `Failed to delete Stream video: ${res.status} ${body}`);
        }
    }

    private async request(
        method: string,
        path: string,
        body?: { [key: string]: any } | undefined,
    ): Promise<StreamVideo> {
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.accountId}${path}`,
            {
                method: method,
                headers: {
                    "Authorization": `Bearer ${this.apiToken}`,
                    ...(body ? { "Content-Type": "application/json" } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
            },
        );
        if (!res.ok) {
            const resBody = await res.text();
            throw new HttpError(500, `Failed to request Cloudflare Stream API: ${res.status} ${resBody}`);
        }
        const json = await res.json() as { success?: boolean, result?: StreamVideo, errors?: any[] };
        if (!json.success || !json.result) {
            throw new HttpError(500, `Cloudflare Stream API returned an error: ${JSON.stringify(json.errors ?? [])}`);
        }
        return json.result;
    }
}
