import {
    GoogleServiceAccount,
    issueGoogleAccessToken,
} from "@mathrunet/masamune_cloudflare";

/**
 * OAuth2 scope used to read and write Cloud Storage objects.
 *
 * Cloud Storageのオブジェクトを読み書きするためのOAuth2スコープ。
 */
export const firebaseStorageScope = "https://www.googleapis.com/auth/devstorage.read_write";

/**
 * Custom metadata key that stores Firebase Storage download tokens.
 *
 * Firebase Storageのダウンロードトークンを保存するカスタムメタデータのキー。
 */
export const firebaseStorageDownloadTokensKey = "firebaseStorageDownloadTokens";

const maxConsistencyRetries = 3;

/**
 * Options for [FirebaseStorageClient].
 *
 * [FirebaseStorageClient]のオプション。
 */
export interface FirebaseStorageClientOptions {
    /**
     * Service account used to issue access tokens.
     *
     * アクセストークンの発行に使うサービスアカウント。
     */
    serviceAccount: GoogleServiceAccount;

    /**
     * Bucket name (e.g. `my-project.firebasestorage.app`).
     *
     * バケット名（例：`my-project.firebasestorage.app`）。
     */
    bucket: string;

    /**
     * Fetch implementation. Defaults to the global `fetch`.
     *
     * fetchの実装。デフォルトはグローバルの`fetch`。
     */
    fetch?: typeof fetch | undefined;

    /**
     * Base URL of the Cloud Storage JSON API. Defaults to `https://storage.googleapis.com`.
     *
     * Cloud Storage JSON APIのベースURL。デフォルトは`https://storage.googleapis.com`。
     */
    storageBaseUrl?: string | undefined;

    /**
     * Base URL used to build Firebase download URLs. Defaults to `https://firebasestorage.googleapis.com`.
     *
     * FirebaseのダウンロードURLを作成するためのベースURL。デフォルトは`https://firebasestorage.googleapis.com`。
     */
    downloadBaseUrl?: string | undefined;
}

/**
 * Metadata of a stored object.
 *
 * 保存されたオブジェクトのメタデータ。
 */
export interface FirebaseStorageObject {
    /** Object path. */
    key: string;
    /** Bucket name. */
    bucket: string;
    /** Object generation. Changes on every write and is used for optimistic locking. */
    generation: string;
    /** Metadata generation. */
    metageneration: string;
    /** Object size in bytes. */
    size: number;
    /** Content type. */
    contentType?: string | undefined;
    /** Cache-Control header. */
    cacheControl?: string | undefined;
    /** Content-Disposition header. */
    contentDisposition?: string | undefined;
    /** Content-Encoding header. */
    contentEncoding?: string | undefined;
    /** Content-Language header. */
    contentLanguage?: string | undefined;
    /** Last updated time. */
    updated?: Date | undefined;
    /** Base64 encoded MD5 hash. */
    md5Hash?: string | undefined;
    /** Custom metadata, excluding Firebase download tokens. */
    customMetadata: Record<string, string>;
    /** Firebase download tokens. */
    downloadTokens: string[];
}

/**
 * A stored object with its content.
 *
 * 内容を含む保存されたオブジェクト。
 */
export interface FirebaseStorageObjectBody extends FirebaseStorageObject {
    /** Object content. */
    body: Uint8Array;
    /** Returns the content as an ArrayBuffer. */
    arrayBuffer(): Promise<ArrayBuffer>;
    /** Returns the content as a UTF-8 string. */
    text(): Promise<string>;
    /** Parses the content as JSON. */
    json<T = unknown>(): Promise<T>;
}

/**
 * Options for writing an object.
 *
 * オブジェクトを書き込む際のオプション。
 */
export interface FirebaseStoragePutOptions {
    /** Content type. Defaults to `application/octet-stream`. */
    contentType?: string | undefined;
    /** Cache-Control header. */
    cacheControl?: string | undefined;
    /** Content-Disposition header. */
    contentDisposition?: string | undefined;
    /** Content-Encoding header. */
    contentEncoding?: string | undefined;
    /** Content-Language header. */
    contentLanguage?: string | undefined;
    /** Custom metadata. */
    customMetadata?: Record<string, string> | undefined;
    /**
     * Write only when the current generation matches. `0` means "only when the object does not exist".
     * When the precondition fails, [FirebaseStorageClient.put] returns `null`.
     *
     * 現在のgenerationが一致する場合のみ書き込みます。`0`は「オブジェクトが存在しない場合のみ」を意味します。
     * 前提条件を満たさない場合、[FirebaseStorageClient.put]は`null`を返します。
     */
    ifGenerationMatch?: string | number | undefined;
    /**
     * Adds a Firebase download token so that a download URL can be issued.
     *
     * ダウンロードURLを発行できるようにFirebaseのダウンロードトークンを付与します。
     */
    createDownloadToken?: boolean | undefined;
}

/**
 * Options for listing objects.
 *
 * オブジェクト一覧を取得する際のオプション。
 */
export interface FirebaseStorageListOptions {
    /** Only objects whose path starts with this prefix. */
    prefix?: string | undefined;
    /** Delimiter used to group paths (e.g. `/`). */
    delimiter?: string | undefined;
    /** Maximum number of objects to return in one page (max 1000). */
    limit?: number | undefined;
    /** Cursor returned by the previous page. */
    cursor?: string | undefined;
}

/**
 * Result of listing objects.
 *
 * オブジェクト一覧の取得結果。
 */
export interface FirebaseStorageListResult {
    /** Objects in this page. */
    objects: FirebaseStorageObject[];
    /** Whether more objects exist. */
    truncated: boolean;
    /** Cursor for the next page. */
    cursor?: string | undefined;
    /** Prefixes grouped by [FirebaseStorageListOptions.delimiter]. */
    delimitedPrefixes: string[];
}

/**
 * Error returned by the Cloud Storage API.
 *
 * Cloud Storage APIから返されたエラー。
 */
export class FirebaseStorageError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = "FirebaseStorageError";
    }
}

interface StorageObjectResource {
    name: string;
    bucket: string;
    generation: string;
    metageneration: string;
    size?: string;
    contentType?: string;
    cacheControl?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    contentLanguage?: string;
    updated?: string;
    md5Hash?: string;
    metadata?: Record<string, string>;
}

/**
 * Client that operates Firebase Storage (Cloud Storage) from Cloudflare Workers via the JSON API.
 *
 * It only depends on `fetch` and WebCrypto, so it works on Workers without Node.js SDKs.
 *
 * JSON API経由でCloudflare WorkersからFirebase Storage（Cloud Storage）を操作するクライアント。
 *
 * `fetch`とWebCryptoのみに依存するため、Node.jsのSDKを使わずにWorkers上で動作します。
 */
export class FirebaseStorageClient {
    constructor(readonly options: FirebaseStorageClientOptions) {
        if (!options.bucket) {
            throw new FirebaseStorageError(500, "Firebase Storage bucket is not specified.");
        }
    }

    /**
     * Bucket name.
     *
     * バケット名。
     */
    get bucket(): string {
        return this.options.bucket;
    }

    /**
     * Returns the object metadata, or `null` if the object does not exist.
     *
     * オブジェクトのメタデータを返します。存在しない場合は`null`を返します。
     */
    async head(key: string): Promise<FirebaseStorageObject | null> {
        const response = await this.request(this.objectUrl(key));
        if (response.status === 404) {
            return null;
        }
        await this.ensureOk(response, `head ${key}`);
        return toStorageObject(await response.json() as StorageObjectResource);
    }

    /**
     * Returns the object with its content, or `null` if the object does not exist.
     *
     * オブジェクトを内容とともに返します。存在しない場合は`null`を返します。
     */
    async get(key: string): Promise<FirebaseStorageObjectBody | null> {
        for (let attempt = 0; attempt < maxConsistencyRetries; attempt++) {
            const metadata = await this.head(key);
            if (!metadata) {
                return null;
            }
            // Pin the generation so that the content always matches the metadata.
            const response = await this.request(this.objectUrl(key, {
                alt: "media",
                ifGenerationMatch: metadata.generation,
            }));
            if (response.status === 404) {
                return null;
            }
            if (response.status === 412) {
                // Replaced between the two requests; read it again.
                continue;
            }
            await this.ensureOk(response, `get ${key}`);
            return toStorageObjectBody(metadata, new Uint8Array(await response.arrayBuffer()));
        }
        throw new FirebaseStorageError(409, `Object kept changing while reading: ${key}`);
    }

    /**
     * Writes an object. Returns `null` when [FirebaseStoragePutOptions.ifGenerationMatch] does not match.
     *
     * オブジェクトを書き込みます。[FirebaseStoragePutOptions.ifGenerationMatch]が一致しない場合は`null`を返します。
     */
    async put(
        key: string,
        value: string | ArrayBuffer | ArrayBufferView,
        options: FirebaseStoragePutOptions = {},
    ): Promise<FirebaseStorageObject | null> {
        const metadata: Record<string, string> = { ...(options.customMetadata ?? {}) };
        if (options.createDownloadToken) {
            metadata[firebaseStorageDownloadTokensKey] = crypto.randomUUID();
        }
        const resource: Record<string, unknown> = {
            name: key,
            contentType: options.contentType ?? "application/octet-stream",
            cacheControl: options.cacheControl,
            contentDisposition: options.contentDisposition,
            contentEncoding: options.contentEncoding,
            contentLanguage: options.contentLanguage,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        };
        const boundary = `masamune-${crypto.randomUUID()}`;
        const body = concatBytes([
            encodeText(
                `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
                `${JSON.stringify(resource)}\r\n` +
                `--${boundary}\r\nContent-Type: ${resource.contentType}\r\n\r\n`,
            ),
            toBytes(value),
            encodeText(`\r\n--${boundary}--`),
        ]);
        const query: Record<string, string | undefined> = { uploadType: "multipart" };
        if (options.ifGenerationMatch !== undefined) {
            query.ifGenerationMatch = String(options.ifGenerationMatch);
        }
        const response = await this.request(
            `${this.storageBaseUrl}/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o${toQuery(query)}`,
            {
                method: "POST",
                headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
                body,
            },
        );
        if (response.status === 412) {
            return null;
        }
        await this.ensureOk(response, `put ${key}`);
        return toStorageObject(await response.json() as StorageObjectResource);
    }

    /**
     * Deletes an object. Returns `false` if the object does not exist
     * (or the generation does not match).
     *
     * オブジェクトを削除します。存在しない（またはgenerationが一致しない）場合は`false`を返します。
     */
    async delete(
        key: string,
        options: { ifGenerationMatch?: string | number | undefined } = {},
    ): Promise<boolean> {
        const response = await this.request(
            this.objectUrl(key, {
                ifGenerationMatch: options.ifGenerationMatch === undefined
                    ? undefined
                    : String(options.ifGenerationMatch),
            }),
            { method: "DELETE" },
        );
        if (response.status === 404 || response.status === 412) {
            return false;
        }
        await this.ensureOk(response, `delete ${key}`);
        return true;
    }

    /**
     * Lists objects in one page.
     *
     * オブジェクトを1ページ分取得します。
     */
    async list(options: FirebaseStorageListOptions = {}): Promise<FirebaseStorageListResult> {
        const response = await this.request(
            `${this.storageBaseUrl}/storage/v1/b/${encodeURIComponent(this.bucket)}/o${toQuery({
                prefix: options.prefix,
                delimiter: options.delimiter,
                maxResults: options.limit === undefined
                    ? undefined
                    : String(Math.max(1, Math.min(1000, options.limit))),
                pageToken: options.cursor,
            })}`,
        );
        await this.ensureOk(response, `list ${options.prefix ?? ""}`);
        const json = await response.json() as {
            items?: StorageObjectResource[];
            prefixes?: string[];
            nextPageToken?: string;
        };
        return {
            objects: (json.items ?? []).map(toStorageObject),
            truncated: !!json.nextPageToken,
            cursor: json.nextPageToken,
            delimitedPrefixes: json.prefixes ?? [],
        };
    }

    /**
     * Deletes every object whose path starts with [prefix] and returns the number of deleted objects.
     *
     * Throws when more than [maxObjects] objects exist so that a runaway deletion can be retried safely.
     *
     * [prefix]で始まるすべてのオブジェクトを削除し、削除した件数を返します。
     *
     * [maxObjects]を超えるオブジェクトが存在する場合は、安全に再試行できるよう例外を投げます。
     */
    async deletePrefix(
        prefix: string,
        options: { maxObjects?: number | undefined } = {},
    ): Promise<number> {
        if (!prefix) {
            throw new FirebaseStorageError(400, "A non-empty prefix is required.");
        }
        const maxObjects = options.maxObjects ?? 100000;
        let deleted = 0;
        for (;;) {
            // Always read the first page because deleted objects disappear from the listing.
            const page = await this.list({ prefix, limit: 1000 });
            if (page.objects.length === 0) {
                return deleted;
            }
            for (const object of page.objects) {
                if (deleted >= maxObjects) {
                    throw new FirebaseStorageError(
                        500,
                        `Too many objects under the prefix: ${prefix}`,
                    );
                }
                if (await this.delete(object.key)) {
                    deleted += 1;
                }
            }
        }
    }

    /**
     * Returns a Firebase download URL of the object, or `null` if the object does not exist.
     *
     * When the object does not have a download token yet, a new one is added.
     *
     * オブジェクトのFirebaseダウンロードURLを返します。存在しない場合は`null`を返します。
     *
     * ダウンロードトークンがまだない場合は新しく付与します。
     */
    async downloadUrl(key: string): Promise<string | null> {
        for (let attempt = 0; attempt < maxConsistencyRetries; attempt++) {
            const object = await this.head(key);
            if (!object) {
                return null;
            }
            if (object.downloadTokens[0]) {
                return this.buildDownloadUrl(key, object.downloadTokens[0]);
            }
            const token = crypto.randomUUID();
            const response = await this.request(this.objectUrl(key, {
                ifMetagenerationMatch: object.metageneration,
            }), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    metadata: { [firebaseStorageDownloadTokensKey]: token },
                }),
            });
            if (response.status === 404) {
                return null;
            }
            if (response.status === 412) {
                // Metadata was updated concurrently; another writer may have added a token.
                continue;
            }
            await this.ensureOk(response, `downloadUrl ${key}`);
            return this.buildDownloadUrl(key, token);
        }
        throw new FirebaseStorageError(409, `Object kept changing while issuing a download URL: ${key}`);
    }

    /**
     * Builds a Firebase download URL from a path and a token.
     *
     * パスとトークンからFirebaseのダウンロードURLを作成します。
     */
    buildDownloadUrl(key: string, token: string): string {
        const base = (this.options.downloadBaseUrl ?? "https://firebasestorage.googleapis.com")
            .replace(/\/+$/g, "");
        return `${base}/v0/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(key)}` +
            `?alt=media&token=${encodeURIComponent(token)}`;
    }

    private get storageBaseUrl(): string {
        return (this.options.storageBaseUrl ?? "https://storage.googleapis.com").replace(/\/+$/g, "");
    }

    private objectUrl(key: string, query: Record<string, string | undefined> = {}): string {
        return `${this.storageBaseUrl}/storage/v1/b/${encodeURIComponent(this.bucket)}` +
            `/o/${encodeURIComponent(key)}${toQuery(query)}`;
    }

    private async request(url: string, init: RequestInit = {}): Promise<Response> {
        const token = await issueGoogleAccessToken({
            serviceAccount: this.options.serviceAccount,
            scopes: [firebaseStorageScope],
        });
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${token.accessToken}`);
        const fetcher = this.options.fetch ?? ((input: RequestInfo | URL, requestInit?: RequestInit) => fetch(input, requestInit));
        return await fetcher(url, { ...init, headers });
    }

    private async ensureOk(response: Response, action: string): Promise<void> {
        if (response.ok) {
            return;
        }
        const text = await response.text().catch(() => "");
        throw new FirebaseStorageError(
            response.status,
            `Firebase Storage request failed (${action}): ${response.status} ${text}`,
        );
    }
}

function toStorageObject(resource: StorageObjectResource): FirebaseStorageObject {
    const { [firebaseStorageDownloadTokensKey]: tokens, ...customMetadata } = resource.metadata ?? {};
    return {
        key: resource.name,
        bucket: resource.bucket,
        generation: String(resource.generation),
        metageneration: String(resource.metageneration),
        size: Number(resource.size ?? 0),
        contentType: resource.contentType,
        cacheControl: resource.cacheControl,
        contentDisposition: resource.contentDisposition,
        contentEncoding: resource.contentEncoding,
        contentLanguage: resource.contentLanguage,
        updated: resource.updated ? new Date(resource.updated) : undefined,
        md5Hash: resource.md5Hash,
        customMetadata,
        downloadTokens: tokens ? tokens.split(",").map((token) => token.trim()).filter(Boolean) : [],
    };
}

function toStorageObjectBody(
    metadata: FirebaseStorageObject,
    body: Uint8Array,
): FirebaseStorageObjectBody {
    return {
        ...metadata,
        body,
        arrayBuffer: async () => body.buffer.slice(
            body.byteOffset,
            body.byteOffset + body.byteLength,
        ) as ArrayBuffer,
        text: async () => new TextDecoder().decode(body),
        json: async <T = unknown>() => JSON.parse(new TextDecoder().decode(body)) as T,
    };
}

function toQuery(query: Record<string, string | undefined>): string {
    const entries = Object.entries(query)
        .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "");
    if (entries.length === 0) {
        return "";
    }
    return `?${new URLSearchParams(entries).toString()}`;
}

function encodeText(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

function toBytes(value: string | ArrayBuffer | ArrayBufferView): Uint8Array {
    if (typeof value === "string") {
        return encodeText(value);
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function concatBytes(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
    const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    return result;
}
