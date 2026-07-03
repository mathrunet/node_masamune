import { deploy, NoneAuthAdapter } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";

function createApp() {
    return deploy([
        Functions.sendGrid({
            auth: new NoneAuthAdapter(),
            apiKey: "test-api-key",
        }),
    ]);
}

describe("masamune_cloudflare_mail_sendgrid", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
    });

    test("正常系: SendGrid API v3にメール送信リクエストを送る", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 202,
        } as unknown as Response));
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        const app = createApp();
        const response = await app.request("http://localhost/send_grid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                from: "sender@example.com",
                to: "recipient@example.com",
                title: "テスト件名",
                content: "テスト本文",
            }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        const calls = fetchMock.mock.calls as unknown as [string, { headers: Record<string, string>, body: string }][];
        expect(calls[0][0]).toBe("https://api.sendgrid.com/v3/mail/send");
        expect(calls[0][1].headers["Authorization"]).toBe("Bearer test-api-key");
        expect(JSON.parse(calls[0][1].body)).toEqual({
            personalizations: [{ to: [{ email: "recipient@example.com" }] }],
            from: { email: "sender@example.com" },
            subject: "テスト件名",
            content: [{ type: "text/plain", value: "テスト本文" }],
        });
    });

    test("正常系: context.envのMAIL_SENDGRID_APIKEYを使用", async () => {
        const fetchMock = jest.fn(async () => ({
            ok: true,
            status: 202,
        } as unknown as Response));
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        const app = deploy([
            Functions.sendGrid({ auth: new NoneAuthAdapter() }),
        ]);
        const response = await app.request("http://localhost/send_grid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                from: "sender@example.com",
                to: "recipient@example.com",
                title: "件名",
                content: "本文",
            }),
        }, {
            MAIL_SENDGRID_APIKEY: "env-api-key",
        });
        expect(response.status).toBe(200);
        const calls = fetchMock.mock.calls as unknown as [string, { headers: Record<string, string> }][];
        expect(calls[0][1].headers["Authorization"]).toBe("Bearer env-api-key");
    });

    test("エラー: パラメータ不足", async () => {
        const app = createApp();
        const response = await app.request("http://localhost/send_grid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                from: "sender@example.com",
                to: "recipient@example.com",
            }),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Query parameter is invalid." });
    });

    test("エラー: APIキー未設定", async () => {
        const app = deploy([
            Functions.sendGrid({ auth: new NoneAuthAdapter() }),
        ]);
        const response = await app.request("http://localhost/send_grid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                from: "sender@example.com",
                to: "recipient@example.com",
                title: "件名",
                content: "本文",
            }),
        });
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "MAIL_SENDGRID_APIKEY is not set." });
    });

    test("エラー: SendGrid APIがエラーを返す", async () => {
        (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async () => ({
            ok: false,
            status: 401,
            text: async () => "unauthorized",
        } as unknown as Response)) as unknown as typeof fetch;
        const app = createApp();
        const response = await app.request("http://localhost/send_grid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                from: "sender@example.com",
                to: "recipient@example.com",
                title: "件名",
                content: "本文",
            }),
        });
        expect(response.status).toBe(500);
        const body = await response.json() as { error: string };
        expect(body.error).toContain("401");
    });
});
