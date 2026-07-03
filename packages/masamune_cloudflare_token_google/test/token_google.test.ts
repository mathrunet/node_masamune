import { webcrypto } from "crypto";
import { MiddlewareHandler } from "hono";
import {
    clearGoogleAccessTokenCache,
    deploy,
    NoneAuthAdapter,
    WorkersAuthAdapterBase,
} from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";

if (!(globalThis as { crypto?: Crypto }).crypto) {
    (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
}

class TestAuthAdapter extends WorkersAuthAdapterBase {
    build(): MiddlewareHandler {
        return async (context, next) => {
            this.setAuthContext(context, {
                uid: "test-user",
                token: { uid: "test-user" },
            });
            await next();
        };
    }
}

async function generatePrivateKeyPem(): Promise<string> {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: "RSASSA-PKCS1-v1_5",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
    );
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const base64 = Buffer.from(pkcs8).toString("base64");
    const lines = base64.match(/.{1,64}/g) ?? [];
    return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

describe("masamune_cloudflare_token_google", () => {
    beforeEach(() => {
        clearGoogleAccessTokenCache();
        jest.restoreAllMocks();
    });

    test("正常系: 認証済みユーザーがアクセストークンを取得", async () => {
        const privateKeyPem = await generatePrivateKeyPem();
        const serviceAccount = JSON.stringify({
            client_email: "test@example.iam.gserviceaccount.com",
            private_key: privateKeyPem,
            project_id: "test-project",
        });
        const fetchMock = jest.fn(async () => ({
            ok: true,
            json: async () => ({ access_token: "access-token-1", expires_in: 3600 }),
        } as unknown as Response));
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        const app = deploy([
            Functions.googleToken({
                auth: new TestAuthAdapter(),
                serviceAccount: serviceAccount,
            }),
        ]);
        const response = await app.request("http://localhost/google_token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(response.status).toBe(200);
        const body = await response.json() as { accessToken: string, expiresAt: number };
        expect(body.accessToken).toBe("access-token-1");
        expect(body.expiresAt).toBeGreaterThan(Date.now());
        const calls = fetchMock.mock.calls as unknown as [string][];
        expect(calls[0][0]).toBe("https://oauth2.googleapis.com/token");
    });

    test("エラー: 未認証", async () => {
        const app = deploy([
            Functions.googleToken({
                auth: new NoneAuthAdapter(),
                serviceAccount: "{}",
            }),
        ]);
        const response = await app.request("http://localhost/google_token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthenticated" });
    });

    test("エラー: サービスアカウント未設定", async () => {
        const app = deploy([
            Functions.googleToken({
                auth: new TestAuthAdapter(),
            }),
        ]);
        const response = await app.request("http://localhost/google_token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Service account is required" });
    });

    test("正常系: context.envのGOOGLE_SERVICE_ACCOUNTを使用", async () => {
        const privateKeyPem = await generatePrivateKeyPem();
        const serviceAccount = JSON.stringify({
            client_email: "env@example.iam.gserviceaccount.com",
            private_key: privateKeyPem,
        });
        (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({ access_token: "env-token", expires_in: 1800 }),
        } as unknown as Response)) as unknown as typeof fetch;
        const app = deploy([
            Functions.googleToken({ auth: new TestAuthAdapter() }),
        ]);
        const response = await app.request("http://localhost/google_token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ duration: 1800 }),
        }, {
            GOOGLE_SERVICE_ACCOUNT: serviceAccount,
        });
        expect(response.status).toBe(200);
        const body = await response.json() as { accessToken: string };
        expect(body.accessToken).toBe("env-token");
    });
});
