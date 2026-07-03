import { deploy, NoneAuthAdapter } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";

const streamCopyResponse = {
    success: true,
    result: {
        uid: "video-uid-1",
        readyToStream: false,
        status: { state: "queued" },
        playback: {
            hls: "https://customer-code.cloudflarestream.com/video-uid-1/manifest/video.m3u8",
            dash: "https://customer-code.cloudflarestream.com/video-uid-1/manifest/video.mpd",
        },
    },
};

describe("masamune_cloudflare_media", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });

    test("正常系: URL指定でStream copyを実行しHLS URLを返す", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            json: async () => streamCopyResponse,
        } as unknown as Response));
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        const app = deploy([
            Functions.hls({
                auth: new NoneAuthAdapter(),
                accountId: "account-1",
                apiToken: "api-token",
            }),
        ]);
        const response = await app.request("http://localhost/hls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: "https://example.com/videos/source.mp4",
            }),
        });
        expect(response.status).toBe(200);
        const body = await response.json() as { [key: string]: any };
        expect(body.success).toBe(true);
        expect(body.uid).toBe("video-uid-1");
        expect(body.hls).toContain("manifest/video.m3u8");
        expect(body.dash).toContain("manifest/video.mpd");
        const calls = fetchMock.mock.calls as unknown as [string, { body: string }][];
        expect(calls[0][0]).toBe("https://api.cloudflare.com/client/v4/accounts/account-1/stream/copy");
        expect(JSON.parse(calls[0][1].body).url).toBe("https://example.com/videos/source.mp4");
    });

    test("正常系: path指定で公開URLからコピーしdeleteOriginalでR2から削除", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            json: async () => streamCopyResponse,
        } as unknown as Response));
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        const deleted: string[] = [];
        const bucket = {
            delete: async (key: string) => {
                deleted.push(key);
            },
        };
        const app = deploy([
            Functions.hls({
                auth: new NoneAuthAdapter(),
                accountId: "account-1",
                apiToken: "api-token",
                publicBaseUrl: "https://cdn.example.com",
            }),
        ]);
        const response = await app.request("http://localhost/hls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                path: "videos/source.mp4",
                deleteOriginal: true,
            }),
        }, {
            R2_BUCKET: bucket,
        });
        expect(response.status).toBe(200);
        const calls = fetchMock.mock.calls as unknown as [string, { body: string }][];
        expect(JSON.parse(calls[0][1].body).url).toBe("https://cdn.example.com/videos/source.mp4");
        expect(JSON.parse(calls[0][1].body).meta.path).toBe("videos/source.mp4");
        expect(deleted).toEqual(["videos/source.mp4"]);
    });

    test("正常系: downloadBaseUrl + secretで署名付きURLを生成", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            json: async () => streamCopyResponse,
        } as unknown as Response));
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        const app = deploy([
            Functions.hls({
                auth: new NoneAuthAdapter(),
                accountId: "account-1",
                apiToken: "api-token",
                downloadBaseUrl: "https://storage.example.com/storage_cloudflare",
                downloadUrlSecret: "secret-key",
            }),
        ]);
        const response = await app.request("http://localhost/hls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                path: "videos/source.mp4",
            }),
        });
        expect(response.status).toBe(200);
        const calls = fetchMock.mock.calls as unknown as [string, { body: string }][];
        const sourceUrl = JSON.parse(calls[0][1].body).url as string;
        expect(sourceUrl).toContain("https://storage.example.com/storage_cloudflare/download/videos/source.mp4");
        expect(sourceUrl).toContain("expires=");
        expect(sourceUrl).toContain("signature=");
    });

    test("エラー: url/path未指定", async () => {
        const app = deploy([
            Functions.hls({
                auth: new NoneAuthAdapter(),
                accountId: "account-1",
                apiToken: "api-token",
            }),
        ]);
        const response = await app.request("http://localhost/hls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(response.status).toBe(400);
    });

    test("エラー: 変換済みファイル（.m3u8）", async () => {
        const app = deploy([
            Functions.hls({
                auth: new NoneAuthAdapter(),
                accountId: "account-1",
                apiToken: "api-token",
            }),
        ]);
        const response = await app.request("http://localhost/hls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: "https://example.com/videos/source.m3u8",
            }),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "The file is already processed." });
    });

    test("エラー: 認証情報未設定", async () => {
        const app = deploy([
            Functions.hls({ auth: new NoneAuthAdapter() }),
        ]);
        const response = await app.request("http://localhost/hls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: "https://example.com/videos/source.mp4",
            }),
        });
        expect(response.status).toBe(500);
    });
});
