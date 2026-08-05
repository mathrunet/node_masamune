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
    constructor(private readonly uid: string) {
        super();
    }

    build(): MiddlewareHandler {
        return async (context, next) => {
            this.setAuthContext(context, {
                uid: this.uid,
                token: { uid: this.uid },
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

describe("masamune_cloudflare_auth", () => {
    let serviceAccount: string;

    beforeAll(async () => {
        serviceAccount = JSON.stringify({
            client_email: "test@example.iam.gserviceaccount.com",
            private_key: await generatePrivateKeyPem(),
            project_id: "test-project",
        });
    });

    beforeEach(() => {
        clearGoogleAccessTokenCache();
        jest.restoreAllMocks();
    });

    test("正常系: 認証済みユーザーが自分のアカウントを削除", async () => {
        const fetchMock = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: "access-token", expires_in: 3600 }),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "{}",
            } as Response);
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        const app = deploy([
            Functions.deleteUser({
                auth: new TestAuthAdapter("test-user"),
                serviceAccount,
            }),
        ]);

        const response = await app.request("http://localhost/delete_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: "test-user" }),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token");
        expect(fetchMock.mock.calls[1][0]).toBe("https://identitytoolkit.googleapis.com/v1/accounts:delete");
        const deleteRequest = fetchMock.mock.calls[1][1] as RequestInit;
        expect(deleteRequest.headers).toEqual({
            "Authorization": "Bearer access-token",
            "Content-Type": "application/json",
        });
        expect(JSON.parse(deleteRequest.body as string)).toEqual({
            localId: "test-user",
            targetProjectId: "test-project",
        });
    });

    test("正常系: context.envのGOOGLE_SERVICE_ACCOUNTを使用", async () => {
        const fetchMock = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: "env-token", expires_in: 3600 }),
            } as Response)
            .mockResolvedValueOnce({ ok: true } as Response);
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        const app = deploy([
            Functions.deleteUser({ auth: new TestAuthAdapter("test-user") }),
        ]);

        const response = await app.request("http://localhost/delete_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: "test-user" }),
        }, {
            GOOGLE_SERVICE_ACCOUNT: serviceAccount,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
    });

    test("エラー: 未認証", async () => {
        const app = deploy([
            Functions.deleteUser({ auth: new NoneAuthAdapter(), serviceAccount }),
        ]);

        const response = await app.request("http://localhost/delete_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: "test-user" }),
        });

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthenticated" });
    });

    test("エラー: 別ユーザーの削除", async () => {
        const app = deploy([
            Functions.deleteUser({
                auth: new TestAuthAdapter("test-user"),
                serviceAccount,
            }),
        ]);

        const response = await app.request("http://localhost/delete_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: "another-user" }),
        });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            error: "The authenticated user cannot delete another user.",
        });
    });

    test("エラー: userIdが未指定", async () => {
        const app = deploy([
            Functions.deleteUser({
                auth: new TestAuthAdapter("test-user"),
                serviceAccount,
            }),
        ]);

        const response = await app.request("http://localhost/delete_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            error: "No user ID specified in `userId`.",
        });
    });

    test("エラー: サービスアカウントが未設定", async () => {
        const app = deploy([
            Functions.deleteUser({ auth: new TestAuthAdapter("test-user") }),
        ]);

        const response = await app.request("http://localhost/delete_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: "test-user" }),
        });

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Service account is required" });
    });

    test("エラー: Identity Toolkitの削除が失敗", async () => {
        const fetchMock = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: "access-token", expires_in: 3600 }),
            } as Response)
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                text: async () => "USER_NOT_FOUND",
            } as Response);
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        const app = deploy([
            Functions.deleteUser({
                auth: new TestAuthAdapter("test-user"),
                serviceAccount,
            }),
        ]);

        const response = await app.request("http://localhost/delete_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: "test-user" }),
        });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
            error: "Failed to delete Firebase Authentication user: USER_NOT_FOUND",
        });
    });
});
