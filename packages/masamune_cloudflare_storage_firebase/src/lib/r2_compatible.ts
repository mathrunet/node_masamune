import {
    FirebaseStorageClient,
    FirebaseStorageObject,
    FirebaseStorageObjectBody,
} from "./client";

/**
 * HTTP metadata of an object, compatible with `R2HTTPMetadata`.
 *
 * `R2HTTPMetadata`と互換のオブジェクトのHTTPメタデータ。
 */
export interface R2CompatibleHttpMetadata {
    contentType?: string | undefined;
    cacheControl?: string | undefined;
    contentDisposition?: string | undefined;
    contentEncoding?: string | undefined;
    contentLanguage?: string | undefined;
}

/**
 * Conditions for writing an object, compatible with `R2Conditional`.
 *
 * `etag` corresponds to the Cloud Storage generation.
 *
 * `R2Conditional`と互換のオブジェクト書き込み条件。
 *
 * `etag`はCloud Storageのgenerationに対応します。
 */
export interface R2CompatibleConditional {
    /** Write only when the current etag matches. */
    etagMatches?: string | undefined;
    /** Write only when the current etag does not match. `*` means "only when the object does not exist". */
    etagDoesNotMatch?: string | undefined;
}

/**
 * Object metadata compatible with `R2Object`.
 *
 * `R2Object`と互換のオブジェクトのメタデータ。
 */
export interface R2CompatibleObject {
    key: string;
    version: string;
    size: number;
    etag: string;
    httpEtag: string;
    uploaded: Date;
    httpMetadata: R2CompatibleHttpMetadata;
    customMetadata: Record<string, string>;
}

/**
 * Object with its content, compatible with `R2ObjectBody`.
 *
 * `R2ObjectBody`と互換の内容を含むオブジェクト。
 */
export interface R2CompatibleObjectBody extends R2CompatibleObject {
    readonly body: ReadableStream<Uint8Array>;
    arrayBuffer(): Promise<ArrayBuffer>;
    text(): Promise<string>;
    json<T = unknown>(): Promise<T>;
    blob(): Promise<Blob>;
}

/**
 * Options for `put`, compatible with `R2PutOptions`.
 *
 * `R2PutOptions`と互換の`put`のオプション。
 */
export interface R2CompatiblePutOptions {
    httpMetadata?: R2CompatibleHttpMetadata | undefined;
    customMetadata?: Record<string, string> | undefined;
    onlyIf?: R2CompatibleConditional | undefined;
}

/**
 * Options for `list`, compatible with `R2ListOptions`.
 *
 * `R2ListOptions`と互換の`list`のオプション。
 */
export interface R2CompatibleListOptions {
    prefix?: string | undefined;
    delimiter?: string | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
}

/**
 * Result of `list`, compatible with `R2Objects`.
 *
 * `R2Objects`と互換の`list`の結果。
 */
export interface R2CompatibleObjects {
    objects: R2CompatibleObject[];
    truncated: boolean;
    cursor?: string | undefined;
    delimitedPrefixes: string[];
}

/**
 * Subset of the `R2Bucket` binding implemented on Firebase Storage.
 *
 * Firebase Storage上で実装した`R2Bucket`バインディングのサブセット。
 */
export interface R2CompatibleBucket {
    head(key: string): Promise<R2CompatibleObject | null>;
    get(key: string): Promise<R2CompatibleObjectBody | null>;
    put(
        key: string,
        value: string | ArrayBuffer | ArrayBufferView | Blob | ReadableStream | null,
        options?: R2CompatiblePutOptions,
    ): Promise<R2CompatibleObject | null>;
    delete(keys: string | string[]): Promise<void>;
    list(options?: R2CompatibleListOptions): Promise<R2CompatibleObjects>;
}

/**
 * Wraps a [FirebaseStorageClient] with an `R2Bucket` compatible interface.
 *
 * This lets Worker code written for R2 (`head`, `get`, `put` with `onlyIf`, `delete`, `list`)
 * move to Firebase Storage by only replacing the binding.
 * The etag is mapped to the Cloud Storage generation, so conditional writes stay atomic.
 *
 * [FirebaseStorageClient]を`R2Bucket`互換のインターフェースでラップします。
 *
 * R2向けに書かれたWorkerのコード（`head`、`get`、`onlyIf`付きの`put`、`delete`、`list`）を、
 * バインディングを差し替えるだけでFirebase Storageへ移行できます。
 * etagはCloud Storageのgenerationに対応するため、条件付き書き込みはアトミックなままです。
 */
export function createR2CompatibleBucket(client: FirebaseStorageClient): R2CompatibleBucket {
    return {
        head: async (key) => {
            const object = await client.head(key);
            return object ? toR2Object(object) : null;
        },
        get: async (key) => {
            const object = await client.get(key);
            return object ? toR2ObjectBody(object) : null;
        },
        put: async (key, value, options = {}) => {
            const bytes = await toBytes(value);
            const write = (ifGenerationMatch: string | undefined) => client.put(key, bytes, {
                ...options.httpMetadata,
                customMetadata: options.customMetadata,
                ifGenerationMatch,
            });
            const onlyIf = options.onlyIf;
            if (!onlyIf || (onlyIf.etagMatches === undefined && onlyIf.etagDoesNotMatch === undefined)) {
                const object = await write(undefined);
                return object ? toR2Object(object) : null;
            }
            if (onlyIf.etagMatches !== undefined && onlyIf.etagDoesNotMatch !== undefined) {
                throw new Error("etagMatches and etagDoesNotMatch cannot be combined.");
            }
            if (onlyIf.etagMatches !== undefined) {
                const object = await write(unquote(onlyIf.etagMatches));
                return object ? toR2Object(object) : null;
            }
            const notMatch = unquote(onlyIf.etagDoesNotMatch!);
            if (notMatch === "*") {
                const object = await write("0");
                return object ? toR2Object(object) : null;
            }
            // Pin the generation observed by head so that the comparison and the write stay atomic.
            const current = await client.head(key);
            if (current?.generation === notMatch) {
                return null;
            }
            const object = await write(current?.generation ?? "0");
            return object ? toR2Object(object) : null;
        },
        delete: async (keys) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
                await client.delete(key);
            }
        },
        list: async (options = {}) => {
            const result = await client.list(options);
            return {
                objects: result.objects.map(toR2Object),
                truncated: result.truncated,
                cursor: result.cursor,
                delimitedPrefixes: result.delimitedPrefixes,
            };
        },
    };
}

function toR2Object(object: FirebaseStorageObject): R2CompatibleObject {
    return {
        key: object.key,
        version: object.generation,
        size: object.size,
        etag: object.generation,
        httpEtag: `"${object.generation}"`,
        uploaded: object.updated ?? new Date(0),
        httpMetadata: {
            contentType: object.contentType,
            cacheControl: object.cacheControl,
            contentDisposition: object.contentDisposition,
            contentEncoding: object.contentEncoding,
            contentLanguage: object.contentLanguage,
        },
        customMetadata: object.customMetadata,
    };
}

function toR2ObjectBody(object: FirebaseStorageObjectBody): R2CompatibleObjectBody {
    const bytes = object.body;
    return {
        ...toR2Object(object),
        get body() {
            return new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(bytes);
                    controller.close();
                },
            });
        },
        arrayBuffer: () => object.arrayBuffer(),
        text: () => object.text(),
        json: <T = unknown>() => object.json<T>(),
        blob: async () => new Blob([await object.arrayBuffer()], {
            type: object.contentType ?? "application/octet-stream",
        }),
    };
}

function unquote(etag: string): string {
    return etag.trim().replace(/^W\//, "").replace(/^"(.*)"$/, "$1");
}

async function toBytes(
    value: string | ArrayBuffer | ArrayBufferView | Blob | ReadableStream | null,
): Promise<string | ArrayBuffer | ArrayBufferView> {
    if (value === null) {
        return new Uint8Array(0);
    }
    if (typeof value === "string" || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        return value;
    }
    if (value instanceof Blob) {
        return await value.arrayBuffer();
    }
    return await new Response(value).arrayBuffer();
}
