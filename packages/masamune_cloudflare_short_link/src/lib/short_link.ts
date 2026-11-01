import { HttpError, resolveConfig } from "@mathrunet/masamune_cloudflare";
import { Context } from "hono";
import { ShortLinkInput, ShortLinkKVNamespace, ShortLinkRecord, ShortLinkWorkersOptions } from "./interface";

/**
 * Default KV binding name.
 *
 * デフォルトのKVバインディング名。
 */
export const DEFAULT_SHORT_LINK_BINDING_NAME = "SHORT_LINK_KV";

/**
 * Default KV key prefix.
 *
 * デフォルトのKVキープレフィックス。
 */
export const DEFAULT_SHORT_LINK_KEY_PREFIX = "short_link:";

/**
 * Default length of generated codes.
 *
 * 自動生成コードのデフォルト長。
 */
export const DEFAULT_SHORT_LINK_CODE_LENGTH = 7;

const CODE_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;
const PARAM_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MAX_URL_LENGTH = 2048;
const MAX_PARAM_VALUE_LENGTH = 256;
const MAX_PARAMS = 20;
const MAX_NOTE_LENGTH = 500;

/**
 * Whether [code] is a valid short code.
 *
 * [code]が有効な短縮コードかどうか。
 */
export function isValidShortLinkCode(code: unknown): code is string {
    return typeof code === "string" && CODE_PATTERN.test(code);
}

/**
 * Generate a random base62 code.
 *
 * ランダムなbase62コードを生成します。
 */
export function generateShortLinkCode(length: number = DEFAULT_SHORT_LINK_CODE_LENGTH): string {
    const size = Math.min(Math.max(Math.floor(length), 3), 64);
    const result: string[] = [];
    // Rejection sampling to avoid modulo bias.
    while (result.length < size) {
        const bytes = new Uint8Array(size * 2);
        crypto.getRandomValues(bytes);
        for (const byte of bytes) {
            if (byte < 248 && result.length < size) {
                result.push(ALPHABET[byte % 62]);
            }
        }
    }
    return result.join("");
}

/**
 * Whether [host] is allowed by [allowedHosts].
 *
 * [host]が[allowedHosts]で許可されているかどうか。
 */
export function isAllowedShortLinkHost(host: string, allowedHosts: string[] | undefined): boolean {
    if (!allowedHosts || allowedHosts.length === 0) {
        return true;
    }
    const target = host.toLowerCase();
    return allowedHosts.some((value) => {
        const allowed = value.trim().toLowerCase();
        if (allowed.startsWith("*.")) {
            const base = allowed.substring(2);
            return target === base || target.endsWith(`.${base}`);
        }
        return target === allowed;
    });
}

/**
 * Validate [input] and convert it into a [ShortLinkRecord]. Throws [HttpError] (400) if invalid.
 *
 * [input]を検証し[ShortLinkRecord]に変換します。不正な場合は[HttpError]（400）を投げます。
 */
export function validateShortLinkInput(
    input: unknown,
    options: ShortLinkWorkersOptions,
    { code, now = new Date(), createdAt }: { code: string; now?: Date; createdAt?: string },
): ShortLinkRecord {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new HttpError(400, "Request body must be an object.");
    }
    const body = input as Record<string, unknown>;
    if (typeof body.url !== "string" || body.url.length === 0 || body.url.length > MAX_URL_LENGTH) {
        throw new HttpError(400, "url is invalid.");
    }
    let url: URL;
    try {
        url = new URL(body.url);
    } catch {
        throw new HttpError(400, "url is invalid.");
    }
    if (url.protocol !== "https:" || url.username || url.password) {
        throw new HttpError(400, "url must be an https URL without credentials.");
    }
    if (!isAllowedShortLinkHost(url.hostname, options.allowedHosts)) {
        throw new HttpError(400, `The host "${url.hostname}" is not allowed.`);
    }
    let params: Record<string, string> | undefined;
    if (body.params !== undefined && body.params !== null) {
        if (typeof body.params !== "object" || Array.isArray(body.params)) {
            throw new HttpError(400, "params must be an object.");
        }
        const entries = Object.entries(body.params as Record<string, unknown>);
        if (entries.length > MAX_PARAMS) {
            throw new HttpError(400, "Too many params.");
        }
        params = {};
        for (const [key, value] of entries) {
            if (!PARAM_KEY_PATTERN.test(key) || typeof value !== "string" || value.length > MAX_PARAM_VALUE_LENGTH) {
                throw new HttpError(400, `params.${key} is invalid.`);
            }
            if (value.length > 0) {
                params[key] = value;
            }
        }
    }
    if (body.note !== undefined && body.note !== null && (typeof body.note !== "string" || body.note.length > MAX_NOTE_LENGTH)) {
        throw new HttpError(400, "note is invalid.");
    }
    let expiresAt: string | undefined;
    if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== "") {
        const time = typeof body.expiresAt === "string" ? Date.parse(body.expiresAt) : NaN;
        if (Number.isNaN(time) || time <= now.getTime()) {
            throw new HttpError(400, "expiresAt must be a future ISO 8601 date.");
        }
        expiresAt = new Date(time).toISOString();
    }
    const record: ShortLinkRecord = {
        code,
        url: url.href,
        createdAt: createdAt ?? now.toISOString(),
        updatedAt: now.toISOString(),
    };
    if (params && Object.keys(params).length > 0) {
        record.params = params;
    }
    if (typeof body.note === "string" && body.note.length > 0) {
        record.note = body.note;
    }
    if (expiresAt) {
        record.expiresAt = expiresAt;
    }
    return record;
}

/**
 * Whether [record] has expired.
 *
 * [record]が期限切れかどうか。
 */
export function isShortLinkExpired(record: ShortLinkRecord, now: Date = new Date()): boolean {
    return !!record.expiresAt && Date.parse(record.expiresAt) <= now.getTime();
}

/**
 * Build the destination URL of [record] by appending [ShortLinkRecord.params].
 *
 * [ShortLinkRecord.params]を付与して[record]のリダイレクト先URLを作成します。
 */
export function buildShortLinkDestination(record: ShortLinkRecord): URL {
    const url = new URL(record.url);
    for (const [key, value] of Object.entries(record.params ?? {})) {
        url.searchParams.set(key, value);
    }
    return url;
}

/**
 * Accessor for short links stored in KV.
 *
 * KVに保存された短縮リンクへのアクセサ。
 */
export class ShortLinkStore {
    constructor(
        readonly namespace: ShortLinkKVNamespace,
        readonly keyPrefix: string = DEFAULT_SHORT_LINK_KEY_PREFIX,
    ) { }

    private key(code: string): string {
        return `${this.keyPrefix}${code}`;
    }

    async get(code: string): Promise<ShortLinkRecord | null> {
        if (!isValidShortLinkCode(code)) {
            return null;
        }
        const raw = await this.namespace.get(this.key(code), "text");
        if (!raw) {
            return null;
        }
        try {
            const record = JSON.parse(raw) as ShortLinkRecord;
            return record && typeof record.url === "string" ? { ...record, code } : null;
        } catch {
            return null;
        }
    }

    async put(record: ShortLinkRecord): Promise<void> {
        const options: { expiration?: number; metadata: unknown } = {
            metadata: { url: record.url, note: record.note, expiresAt: record.expiresAt },
        };
        if (record.expiresAt) {
            // Keep expired records for a day so that they can still be inspected, then let KV purge them.
            options.expiration = Math.floor(Date.parse(record.expiresAt) / 1000) + 86400;
        }
        await this.namespace.put(this.key(record.code), JSON.stringify(record), options);
    }

    async delete(code: string): Promise<void> {
        await this.namespace.delete(this.key(code));
    }

    async list({ limit = 100, cursor }: { limit?: number; cursor?: string } = {}): Promise<{ links: ShortLinkRecord[]; cursor?: string }> {
        const result = await this.namespace.list({ prefix: this.keyPrefix, limit: Math.min(Math.max(limit, 1), 1000), cursor });
        const links = (await Promise.all(
            result.keys.map((key) => this.get(key.name.substring(this.keyPrefix.length))),
        )).filter((record): record is ShortLinkRecord => record !== null);
        return { links, cursor: result.list_complete ? undefined : result.cursor };
    }
}

/**
 * Resolve the [ShortLinkStore] from the Workers env.
 *
 * Workersのenvから[ShortLinkStore]を取得します。
 */
export function resolveShortLinkStore(context: Context, options: ShortLinkWorkersOptions): ShortLinkStore {
    if (options.namespace) {
        return new ShortLinkStore(options.namespace, options.keyPrefix ?? DEFAULT_SHORT_LINK_KEY_PREFIX);
    }
    const bindingName = resolveConfig(context, options.bindingName, "SHORT_LINK_KV_BINDING") ?? DEFAULT_SHORT_LINK_BINDING_NAME;
    const env = (context.env ?? {}) as Record<string, unknown>;
    const namespace = env[bindingName] as ShortLinkKVNamespace | undefined;
    if (!namespace || typeof namespace.get !== "function") {
        throw new HttpError(500, `The KV binding "${bindingName}" is not set.`);
    }
    return new ShortLinkStore(namespace, options.keyPrefix ?? DEFAULT_SHORT_LINK_KEY_PREFIX);
}

/**
 * Compare two strings in constant time.
 *
 * 2つの文字列を定数時間で比較します。
 */
export function timingSafeEqualString(a: string, b: string): boolean {
    const encoder = new TextEncoder();
    const left = encoder.encode(a);
    const right = encoder.encode(b);
    let diff = left.length ^ right.length;
    const length = Math.max(left.length, right.length);
    for (let i = 0; i < length; i++) {
        diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
    }
    return diff === 0;
}

export type { ShortLinkInput };
