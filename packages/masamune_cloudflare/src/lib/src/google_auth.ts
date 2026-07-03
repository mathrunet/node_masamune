/**
 * Utilities for issuing Google OAuth2 access tokens from a service account on Cloudflare Workers.
 *
 * Implemented using only WebCrypto and fetch, so it works without Node.js APIs.
 *
 * Cloudflare Workers上でサービスアカウントからGoogle OAuth2アクセストークンを発行するためのユーティリティ。
 *
 * WebCryptoとfetchのみで実装されているため、Node.jsのAPIなしで動作します。
 */

/**
 * Google service account credentials.
 *
 * Googleサービスアカウントの認証情報。
 */
export interface GoogleServiceAccount {
    /**
     * The email address of the service account.
     *
     * サービスアカウントのメールアドレス。
     */
    client_email: string;

    /**
     * The private key of the service account (PEM, PKCS#8).
     *
     * サービスアカウントのプライベートキー（PEM、PKCS#8）。
     */
    private_key: string;

    /**
     * The project ID of the service account.
     *
     * サービスアカウントのプロジェクトID。
     */
    project_id?: string | undefined;

    /**
     * The key ID of the private key.
     *
     * プライベートキーのキーID。
     */
    private_key_id?: string | undefined;
}

/**
 * Google access token.
 *
 * Googleのアクセストークン。
 */
export interface GoogleAccessToken {
    /**
     * The access token.
     *
     * アクセストークン。
     */
    accessToken: string;

    /**
     * Expiration time in milliseconds since the epoch.
     *
     * 有効期限（エポックからのミリ秒）。
     */
    expiresAt: number;
}

/**
 * Parse a Google service account JSON string.
 *
 * Googleサービスアカウントの JSON 文字列をパースします。
 *
 * @param json
 * JSON string of the service account.
 *
 * サービスアカウントのJSON文字列。
 *
 * @returns { GoogleServiceAccount }
 * Parsed service account.
 *
 * パースされたサービスアカウント。
 */
export function parseGoogleServiceAccount(json: string): GoogleServiceAccount {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const clientEmail = parsed["client_email"];
    const privateKey = parsed["private_key"];
    if (typeof clientEmail !== "string" || clientEmail.length === 0) {
        throw new Error("Service account is missing [client_email].");
    }
    if (typeof privateKey !== "string" || privateKey.length === 0) {
        throw new Error("Service account is missing [private_key].");
    }
    return {
        client_email: clientEmail,
        private_key: privateKey,
        project_id: typeof parsed["project_id"] === "string" ? parsed["project_id"] as string : undefined,
        private_key_id: typeof parsed["private_key_id"] === "string" ? parsed["private_key_id"] as string : undefined,
    };
}

/**
 * Encode data as base64url.
 *
 * データをbase64urlでエンコードします。
 */
export function base64UrlEncode(data: ArrayBuffer | Uint8Array | string): string {
    let bytes: Uint8Array;
    if (typeof data === "string") {
        bytes = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
        bytes = data;
    } else {
        bytes = new Uint8Array(data);
    }
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

/**
 * Decode a base64url string into bytes.
 *
 * base64url文字列をバイト列にデコードします。
 */
export function base64UrlDecode(data: string): Uint8Array {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Convert a PEM string to an ArrayBuffer of the DER contents.
 *
 * PEM文字列をDER内容のArrayBufferに変換します。
 */
export function pemToArrayBuffer(pem: string): ArrayBuffer {
    const body = pem
        .replace(/-----BEGIN [A-Z ]+-----/g, "")
        .replace(/-----END [A-Z ]+-----/g, "")
        .replace(/\s/g, "");
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Normalize a private key that may contain escaped newlines.
 *
 * エスケープされた改行を含む可能性のあるプライベートキーを正規化します。
 */
export function normalizePrivateKey(privateKey: string): string {
    return privateKey.replace(/\\n/g, "\n");
}

/**
 * Create an RS256-signed JWT.
 *
 * RS256で署名されたJWTを作成します。
 *
 * @param options.payload
 * JWT payload.
 *
 * JWTのペイロード。
 *
 * @param options.privateKeyPem
 * Private key in PEM (PKCS#8) format.
 *
 * PEM（PKCS#8）形式のプライベートキー。
 *
 * @param options.keyId
 * Key ID to include in the header.
 *
 * ヘッダーに含めるキーID。
 *
 * @returns { Promise<string> }
 * Signed JWT.
 *
 * 署名されたJWT。
 */
export async function signJwtRS256(options: {
    payload: Record<string, unknown>,
    privateKeyPem: string,
    keyId?: string | undefined,
}): Promise<string> {
    const header: Record<string, unknown> = {
        alg: "RS256",
        typ: "JWT",
    };
    if (options.keyId) {
        header["kid"] = options.keyId;
    }
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(options.payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const key = await crypto.subtle.importKey(
        "pkcs8",
        pemToArrayBuffer(normalizePrivateKey(options.privateKeyPem)),
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256",
        },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${base64UrlEncode(signature)}`;
}

const accessTokenCache = new Map<string, GoogleAccessToken>();
const accessTokenCacheMarginMs = 60 * 1000;

/**
 * Issue a Google OAuth2 access token from a service account.
 *
 * The token is cached at module level and reused until 60 seconds before its expiration.
 *
 * サービスアカウントからGoogle OAuth2アクセストークンを発行します。
 *
 * トークンはモジュールレベルでキャッシュされ、有効期限の60秒前まで再利用されます。
 *
 * @param options.serviceAccount
 * Service account credentials.
 *
 * サービスアカウントの認証情報。
 *
 * @param options.scopes
 * OAuth2 scopes.
 *
 * OAuth2スコープ。
 *
 * @param options.lifetimeSeconds
 * Token lifetime in seconds (default: 3600).
 *
 * トークンの有効期間（秒、デフォルト: 3600）。
 *
 * @returns { Promise<GoogleAccessToken> }
 * Access token and its expiration time.
 *
 * アクセストークンとその有効期限。
 */
export async function issueGoogleAccessToken(options: {
    serviceAccount: GoogleServiceAccount,
    scopes: string[],
    lifetimeSeconds?: number | undefined,
}): Promise<GoogleAccessToken> {
    const scopes = options.scopes.join(" ");
    const cacheKey = `${options.serviceAccount.client_email}|${scopes}`;
    const cached = accessTokenCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt - accessTokenCacheMarginMs > now) {
        return cached;
    }
    const lifetimeSeconds = Math.min(options.lifetimeSeconds ?? 3600, 3600);
    const issuedAt = Math.floor(now / 1000);
    const jwt = await signJwtRS256({
        payload: {
            iss: options.serviceAccount.client_email,
            scope: scopes,
            aud: "https://oauth2.googleapis.com/token",
            iat: issuedAt,
            exp: issuedAt + lifetimeSeconds,
        },
        privateKeyPem: options.serviceAccount.private_key,
        keyId: options.serviceAccount.private_key_id,
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to issue Google access token: ${res.status} ${body}`);
    }
    const json = await res.json() as { access_token?: string, expires_in?: number };
    if (!json.access_token) {
        throw new Error("Failed to issue Google access token: access_token is missing.");
    }
    const token: GoogleAccessToken = {
        accessToken: json.access_token,
        expiresAt: now + (json.expires_in ?? lifetimeSeconds) * 1000,
    };
    accessTokenCache.set(cacheKey, token);
    return token;
}

/**
 * Clear the module-level access token cache.
 *
 * モジュールレベルのアクセストークンキャッシュをクリアします。
 */
export function clearGoogleAccessTokenCache(): void {
    accessTokenCache.clear();
}
