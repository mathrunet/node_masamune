/**
 * Name of the environment variable that stores the shared secret for internal requests.
 */
export const masamuneInternalSecretEnv = "MASAMUNE_INTERNAL_SECRET";

/**
 * Header name that carries the UNIX timestamp (seconds) of an internal request.
 */
export const masamuneInternalTimestampHeader = "x-masamune-internal-timestamp";

/**
 * Header name that carries the hex encoded HMAC-SHA256 signature of an internal request.
 */
export const masamuneInternalSignatureHeader = "x-masamune-internal-signature";

/**
 * Destination of an internal request between Workers.
 *
 * When `binding` is set, the request is sent through the Service Binding `fetch`.
 * Otherwise it is sent to `url` with the global `fetch`.
 */
export interface InternalTarget {
    /**
     * Name of the Service Binding in `env` (for example `SELF`).
     */
    binding?: string | undefined;

    /**
     * Origin of the destination Worker (for example `https://my-app-region.example.workers.dev`).
     */
    url?: string | undefined;

    /**
     * Name of the environment variable that stores the shared secret.
     *
     * Defaults to [masamuneInternalSecretEnv].
     */
    secretEnv?: string | undefined;
}

/**
 * Options for [verifyInternalRequest].
 */
export interface VerifyInternalRequestOptions {
    /**
     * Maximum allowed clock skew in seconds. Defaults to 300.
     */
    maxSkewSeconds?: number | undefined;
}

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );
}

function canonicalMessage(
    timestamp: string,
    method: string,
    pathname: string,
    body: string,
): Uint8Array<ArrayBuffer> {
    return encoder.encode(`${timestamp}\n${method.toUpperCase()}\n${pathname}\n${body}`);
}

function toHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | undefined {
    if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
        return undefined;
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/**
 * Sign an internal request with HMAC-SHA256.
 *
 * The signed message is `${timestamp}\n${method}\n${pathname}\n${body}`.
 * Returns the headers to attach to the request.
 */
export async function signInternalRequest(
    secret: string,
    method: string,
    pathname: string,
    body: string,
    timestamp: number = Math.floor(Date.now() / 1000),
): Promise<Record<string, string>> {
    const key = await importKey(secret);
    const ts = String(Math.floor(timestamp));
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        canonicalMessage(ts, method, pathname, body),
    );
    return {
        [masamuneInternalTimestampHeader]: ts,
        [masamuneInternalSignatureHeader]: toHex(signature),
    };
}

/**
 * Verify the signature of an internal request.
 *
 * The body is read from a clone, so the original request can still be consumed.
 * Returns false when the secret is empty, the headers are missing, the timestamp is
 * outside the allowed skew, or the signature does not match. The comparison is done
 * in constant time by `crypto.subtle.verify`.
 */
export async function verifyInternalRequest(
    request: Request,
    secret: string | undefined | null,
    { maxSkewSeconds = 300 }: VerifyInternalRequestOptions = {},
): Promise<boolean> {
    if (!secret) {
        return false;
    }
    const timestamp = request.headers.get(masamuneInternalTimestampHeader);
    const signatureHex = request.headers.get(masamuneInternalSignatureHeader);
    if (!timestamp || !signatureHex || !/^\d+$/.test(timestamp)) {
        return false;
    }
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > maxSkewSeconds) {
        return false;
    }
    const signature = fromHex(signatureHex);
    if (!signature) {
        return false;
    }
    try {
        const body = await request.clone().text();
        const pathname = new URL(request.url).pathname;
        const key = await importKey(secret);
        return await crypto.subtle.verify(
            "HMAC",
            key,
            signature,
            canonicalMessage(timestamp, request.method, pathname, body),
        );
    } catch (_) {
        return false;
    }
}

/**
 * Read the shared secret for internal requests from `env`.
 */
export function getInternalSecret(
    env: unknown,
    secretEnv: string = masamuneInternalSecretEnv,
): string | undefined {
    const value = (env as { [key: string]: unknown } | undefined | null)?.[secretEnv];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Send a signed `POST` request to another Worker (or to this Worker itself).
 *
 * When `target.binding` is set, the request is sent through the Service Binding `fetch`
 * (not RPC), so the receiving Worker runs it in its `fetch` handler, where placement applies.
 * Otherwise the request is sent to `target.url + pathname` with the global `fetch`.
 */
export async function fetchInternal(
    env: unknown,
    target: InternalTarget,
    pathname: string,
    body: string,
): Promise<Response> {
    const secretEnv = target.secretEnv ?? masamuneInternalSecretEnv;
    const secret = getInternalSecret(env, secretEnv);
    if (!secret) {
        throw new Error(`The internal request secret is not configured. Set \`${secretEnv}\` in the Worker environment.`);
    }
    const headers = {
        "content-type": "application/json",
        ...await signInternalRequest(secret, "POST", pathname, body),
    };
    if (target.binding) {
        const binding = (env as { [key: string]: unknown } | undefined | null)?.[target.binding] as
            { fetch?: (request: Request) => Promise<Response> } | undefined;
        if (!binding || typeof binding.fetch !== "function") {
            throw new Error(`The Service Binding \`${target.binding}\` is not configured.`);
        }
        return await binding.fetch(new Request(`https://internal${pathname}`, {
            method: "POST",
            headers,
            body,
        }));
    }
    if (target.url) {
        return await fetch(`${target.url.replace(/\/+$/, "")}${pathname}`, {
            method: "POST",
            headers,
            body,
        });
    }
    throw new Error("The internal request target requires either `binding` or `url`.");
}
