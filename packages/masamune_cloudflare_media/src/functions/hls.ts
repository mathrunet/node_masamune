import { Context, Hono } from "hono";
import { HttpError, jsonError, resolveConfig } from "@mathrunet/masamune_cloudflare";
import { StreamClient, StreamVideo } from "../lib/stream";
import { MediaWorkersOptions } from "../lib/options";

const defaultBucketBindingName = "R2_BUCKET";
const defaultDownloadUrlSecretBindingName = "STORAGE_DOWNLOAD_URL_SECRET";
const defaultSignedUrlExpiresIn = 60 * 60;
const waitUntilReadyIntervalMs = 2000;
const waitUntilReadyMaxAttempts = 10;

interface R2BucketLike {
    delete(key: string): Promise<void>;
}

/**
 * Converts videos to HLS format using Cloudflare Stream.
 *
 * Specify either [url] (a publicly fetchable video URL) or [path] (an R2 object key). The video is copied to Cloudflare Stream and converted to HLS/DASH, and the playback URLs are returned. Unlike the Firebase version, the converted files are not written back to the original storage path — the playback is served from the Stream CDN, so save the returned `hls` URL on the client side.
 *
 * Cloudflare Streamを使用して動画をHLS形式に変換します。
 *
 * [url]（公開取得可能な動画URL）または[path]（R2オブジェクトキー）のいずれかを指定します。動画はCloudflare Streamにコピーされ、HLS/DASHに変換されて再生URLが返されます。Firebase版とは異なり、変換後のファイルは元のストレージパスには書き戻されません——再生はStreamのCDNから配信されるため、返却された`hls`のURLをクライアント側で保存してください。
 *
 * @param {string} CLOUDFLARE_ACCOUNT_ID
 * Cloudflare account ID. Specify it in [options.accountId] or the `CLOUDFLARE_ACCOUNT_ID` Workers secret.
 *
 * CloudflareのアカウントID。[options.accountId]または`CLOUDFLARE_ACCOUNT_ID`のWorkersシークレットで指定します。
 *
 * @param {string} CLOUDFLARE_STREAM_APITOKEN
 * API token with Cloudflare Stream permissions. Specify it in [options.apiToken] or the `CLOUDFLARE_STREAM_APITOKEN` Workers secret.
 *
 * Cloudflare Streamの権限を持つAPIトークン。[options.apiToken]または`CLOUDFLARE_STREAM_APITOKEN`のWorkersシークレットで指定します。
 *
 * @param {string} url
 * A publicly fetchable URL of the source video.
 *
 * ソース動画の公開取得可能なURL。
 *
 * @param {string} path
 * R2 object key of the source video. Converted to a URL using [options.publicBaseUrl] or [options.downloadBaseUrl] + signed token.
 *
 * ソース動画のR2オブジェクトキー。[options.publicBaseUrl]または[options.downloadBaseUrl]+署名付きトークンを使用してURLに変換されます。
 *
 * @param {boolean} deleteOriginal
 * If true, the original R2 object is deleted after the copy has been started.
 *
 * trueの場合、コピー開始後に元のR2オブジェクトを削除します。
 *
 * @param {boolean} waitUntilReady
 * If true, waits until the video is ready to stream (up to about 20 seconds).
 *
 * trueの場合、動画がストリーミング可能になるまで待機します（最大約20秒）。
 */
module.exports = (
    hono: Hono,
    options: MediaWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        try {
            const body = await context.req.json() as { [key: string]: any };
            const url = body.url as string | undefined;
            const path = body.path as string | undefined;
            const meta = body.meta as { [key: string]: string } | undefined;
            const deleteOriginal = body.deleteOriginal as boolean | undefined;
            const waitUntilReady = body.waitUntilReady as boolean | undefined;
            if (!url && !path) {
                throw new HttpError(400, "Either [url] or [path] must be specified.");
            }
            // 変換済みファイル（.m3u8/.ts）は処理しない
            const sourceName = url ?? path ?? "";
            if (sourceName.endsWith(".m3u8") || sourceName.endsWith(".ts")) {
                throw new HttpError(400, "The file is already processed.");
            }
            const accountId = resolveConfig(context, options.accountId, "CLOUDFLARE_ACCOUNT_ID");
            const apiToken = resolveConfig(context, options.apiToken, "CLOUDFLARE_STREAM_APITOKEN");
            if (!accountId || !apiToken) {
                throw new HttpError(500, "CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_APITOKEN is not set.");
            }
            const client = new StreamClient({ accountId, apiToken });
            const sourceUrl = url ?? await resolveSourceUrl(context, path ?? "", options);
            let video = await client.copyFromUrl({
                url: sourceUrl,
                meta: {
                    ...(meta ?? {}),
                    ...(path ? { path: path } : {}),
                },
                requireSignedURLs: options.requireSignedURLs,
            });
            if (waitUntilReady && !video.readyToStream) {
                video = await waitForReady(client, video);
            }
            if (deleteOriginal && path) {
                const bucket = resolveBucket(context, options);
                await bucket.delete(path);
            }
            return context.json({
                success: true,
                uid: video.uid,
                hls: video.playback?.hls ?? null,
                dash: video.playback?.dash ?? null,
                readyToStream: video.readyToStream,
                status: video.status?.state ?? null,
            });
        } catch (err) {
            return jsonError(context, err);
        }
    });
    return hono;
};

async function waitForReady(client: StreamClient, video: StreamVideo): Promise<StreamVideo> {
    let current = video;
    for (let i = 0; i < waitUntilReadyMaxAttempts; i++) {
        if (current.readyToStream) {
            return current;
        }
        await new Promise((resolve) => setTimeout(resolve, waitUntilReadyIntervalMs));
        current = await client.getVideo(video.uid);
    }
    return current;
}

async function resolveSourceUrl(
    context: Context,
    path: string,
    options: MediaWorkersOptions,
): Promise<string> {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    // 署名付きダウンロードURL（storageワーカーの/downloadエンドポイントと互換）
    const secret = resolveConfig(context, options.downloadUrlSecret, defaultDownloadUrlSecretBindingName);
    if (options.downloadBaseUrl && secret) {
        const expires = Math.floor(Date.now() / 1000) + defaultSignedUrlExpiresIn;
        const signature = await signDownloadPath(path, expires, secret);
        const baseUrl = options.downloadBaseUrl.replace(/\/+$/g, "");
        return `${baseUrl}/download/${encodedPath}?expires=${expires}&signature=${signature}`;
    }
    // 公開URL
    if (options.publicBaseUrl) {
        return `${options.publicBaseUrl.replace(/\/+$/g, "")}/${encodedPath}`;
    }
    throw new HttpError(500, "Either [publicBaseUrl] or [downloadBaseUrl] + download URL secret must be configured to resolve the source URL from [path].");
}

function resolveBucket(context: Context, options: MediaWorkersOptions): R2BucketLike {
    const bindingName = options.bucketBindingName || defaultBucketBindingName;
    const bucket = (context.env as Record<string, unknown> | undefined)?.[bindingName];
    if (!bucket || typeof (bucket as R2BucketLike).delete !== "function") {
        throw new HttpError(500, `Cloudflare R2 binding is not found: ${bindingName}`);
    }
    return bucket as R2BucketLike;
}

async function signDownloadPath(path: string, expires: number, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${path}:${expires}`),
    );
    return arrayBufferToHex(signature);
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
