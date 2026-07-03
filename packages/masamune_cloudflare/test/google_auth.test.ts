import { webcrypto } from "crypto";
import {
    base64UrlDecode,
    base64UrlEncode,
    clearGoogleAccessTokenCache,
    issueGoogleAccessToken,
    parseGoogleServiceAccount,
    signJwtRS256,
} from "../src/lib/src/google_auth";

if (!(globalThis as { crypto?: Crypto }).crypto) {
    (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
}

async function generateTestServiceAccount(): Promise<{
    privateKeyPem: string,
    publicKey: CryptoKey,
}> {
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
    const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
    return { privateKeyPem, publicKey: keyPair.publicKey };
}

describe("google_auth", () => {
    beforeEach(() => {
        clearGoogleAccessTokenCache();
        jest.restoreAllMocks();
    });

    test("base64UrlEncode / base64UrlDecode round trip", () => {
        const source = "Hello, World! こんにちは";
        const encoded = base64UrlEncode(source);
        expect(encoded).not.toMatch(/[+/=]/);
        const decoded = new TextDecoder().decode(base64UrlDecode(encoded));
        expect(decoded).toBe(source);
    });

    test("parseGoogleServiceAccount parses valid JSON", () => {
        const account = parseGoogleServiceAccount(JSON.stringify({
            client_email: "test@example.iam.gserviceaccount.com",
            private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
            project_id: "my-project",
        }));
        expect(account.client_email).toBe("test@example.iam.gserviceaccount.com");
        expect(account.project_id).toBe("my-project");
    });

    test("parseGoogleServiceAccount throws on missing fields", () => {
        expect(() => parseGoogleServiceAccount(JSON.stringify({
            private_key: "key",
        }))).toThrow("client_email");
        expect(() => parseGoogleServiceAccount(JSON.stringify({
            client_email: "test@example.com",
        }))).toThrow("private_key");
    });

    test("signJwtRS256 produces a verifiable JWT", async () => {
        const { privateKeyPem, publicKey } = await generateTestServiceAccount();
        const jwt = await signJwtRS256({
            payload: { iss: "test@example.com", aud: "https://example.com" },
            privateKeyPem,
        });
        const [header, payload, signature] = jwt.split(".");
        expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(header)))).toEqual({
            alg: "RS256",
            typ: "JWT",
        });
        expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)))).toEqual({
            iss: "test@example.com",
            aud: "https://example.com",
        });
        const valid = await crypto.subtle.verify(
            "RSASSA-PKCS1-v1_5",
            publicKey,
            base64UrlDecode(signature).buffer as ArrayBuffer,
            new TextEncoder().encode(`${header}.${payload}`),
        );
        expect(valid).toBe(true);
    });

    test("issueGoogleAccessToken exchanges JWT and caches the token", async () => {
        const { privateKeyPem } = await generateTestServiceAccount();
        const fetchMock = jest.fn(async () => {
            return {
                ok: true,
                json: async () => ({ access_token: "token-1", expires_in: 3600 }),
            } as unknown as Response;
        });
        (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
        const serviceAccount = {
            client_email: "test@example.iam.gserviceaccount.com",
            private_key: privateKeyPem,
        };
        const first = await issueGoogleAccessToken({
            serviceAccount,
            scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });
        expect(first.accessToken).toBe("token-1");
        expect(first.expiresAt).toBeGreaterThan(Date.now());
        const second = await issueGoogleAccessToken({
            serviceAccount,
            scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });
        expect(second.accessToken).toBe("token-1");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const request = fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }];
        expect(request[0]).toBe("https://oauth2.googleapis.com/token");
        expect(request[1].body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    });

    test("issueGoogleAccessToken throws on error response", async () => {
        const { privateKeyPem } = await generateTestServiceAccount();
        (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async () => {
            return {
                ok: false,
                status: 403,
                text: async () => "forbidden",
            } as unknown as Response;
        }) as unknown as typeof fetch;
        await expect(issueGoogleAccessToken({
            serviceAccount: {
                client_email: "test@example.iam.gserviceaccount.com",
                private_key: privateKeyPem,
            },
            scopes: ["scope"],
        })).rejects.toThrow("403");
    });
});
