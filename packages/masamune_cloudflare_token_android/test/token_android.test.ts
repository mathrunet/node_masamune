import { deploy } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";

function createApp() {
    return deploy([
        Functions.androidAuthCode({
            redirectUri: "https://example.com/android_token",
        }),
        Functions.androidToken({
            redirectUri: "https://example.com/android_token",
            clientId: "test-client-id",
            clientSecret: "test-client-secret",
        }),
    ]);
}

describe("masamune_cloudflare_token_android", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });

    describe("android_auth_code", () => {
        test("正常系: Google OAuth同意画面へリダイレクト", async () => {
            const app = createApp();
            const response = await app.request("http://localhost/android_auth_code?id=test-client-id");
            expect(response.status).toBe(302);
            const location = response.headers.get("location") ?? "";
            expect(location).toContain("https://accounts.google.com/o/oauth2/auth");
            expect(location).toContain("client_id=test-client-id");
            expect(location).toContain("redirect_uri=https://example.com/android_token");
            expect(location).toContain("scope=https://www.googleapis.com/auth/androidpublisher");
        });

        test("エラー: id未指定", async () => {
            const app = createApp();
            const response = await app.request("http://localhost/android_auth_code");
            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error: "Query parameter is invalid." });
        });

        test("正常系: context.envのPURCHASE_ANDROID_REDIRECTURIを使用", async () => {
            const app = deploy([
                Functions.androidAuthCode({}),
            ]);
            const response = await app.request(
                "http://localhost/android_auth_code?id=abc",
                {},
                { PURCHASE_ANDROID_REDIRECTURI: "https://env.example.com/android_token" },
            );
            expect(response.status).toBe(302);
            expect(response.headers.get("location")).toContain("https://env.example.com/android_token");
        });
    });

    describe("android_token", () => {
        test("正常系: 認可コードからリフレッシュトークンを取得", async () => {
            const fetchMock = jest.fn(async () => ({
                ok: true,
                json: async () => ({ refresh_token: "refresh-token-1" }),
            } as unknown as Response));
            (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
            const app = createApp();
            const response = await app.request("http://localhost/android_token?code=auth-code");
            expect(response.status).toBe(200);
            expect(await response.text()).toBe("RefreshToken:refresh-token-1");
            const calls = fetchMock.mock.calls as unknown as [string, { body: URLSearchParams }][];
            expect(calls[0][0]).toBe("https://accounts.google.com/o/oauth2/token");
            expect(calls[0][1].body.get("grant_type")).toBe("authorization_code");
            expect(calls[0][1].body.get("client_id")).toBe("test-client-id");
            expect(calls[0][1].body.get("client_secret")).toBe("test-client-secret");
            expect(calls[0][1].body.get("code")).toBe("auth-code");
        });

        test("エラー: code未指定", async () => {
            const app = createApp();
            const response = await app.request("http://localhost/android_token");
            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error: "Query parameter is invalid." });
        });

        test("エラー: トークン交換失敗", async () => {
            (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async () => ({
                ok: false,
                status: 400,
            } as unknown as Response)) as unknown as typeof fetch;
            const app = createApp();
            const response = await app.request("http://localhost/android_token?code=bad-code");
            expect(response.status).toBe(500);
            expect(await response.json()).toEqual({ error: "Cannot get access token." });
        });
    });
});
