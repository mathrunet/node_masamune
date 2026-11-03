import {
    GoogleServiceAccount,
    HttpError,
    issueGoogleAccessToken,
    parseGoogleServiceAccount,
} from "@mathrunet/masamune_cloudflare";
import {
    decodeFirestoreFields,
    decodeFirestoreValue,
    encodeFirestoreValue,
    encodeFirestoreWriteFields,
    FirestoreReference,
    FirestoreRestFieldTransform,
    FirestoreRestValue,
    normalizeFieldPath,
    trimSlashes,
} from "./value";

declare const process: { env?: Record<string, string | undefined> } | undefined;

/**
 * OAuth2 scope used to access Firestore.
 */
export const firestoreDatastoreScope = "https://www.googleapis.com/auth/datastore";

/**
 * Default Firestore database ID.
 */
export const firestoreDefaultDatabaseId = "(default)";

/**
 * Default Firestore REST API base URL.
 */
export const firestoreDefaultBaseUrl = "https://firestore.googleapis.com/v1";

/**
 * Options for [FirestoreRestClient].
 */
export interface FirestoreRestClientOptions {
    /**
     * Service account credentials, or its JSON string.
     */
    serviceAccount: GoogleServiceAccount | string;

    /**
     * Firebase project ID.
     *
     * Resolved in the order: this option -> `project_id` of the service account -> `process.env.FIREBASE_PROJECT_ID`.
     */
    projectId?: string | undefined;

    /**
     * Firestore database ID. Defaults to `(default)`.
     */
    databaseId?: string | undefined;

    /**
     * REST API base URL. Defaults to `https://firestore.googleapis.com/v1`.
     *
     * Can be changed to the emulator (e.g. `http://127.0.0.1:8080/v1`).
     */
    baseUrl?: string | undefined;

    /**
     * Custom fetch implementation used for Firestore requests.
     *
     * Access tokens are issued with the global `fetch` unless [accessToken] is specified.
     */
    fetch?: typeof fetch | undefined;

    /**
     * Custom access token provider. If omitted, a token is issued from the service account
     * with the `https://www.googleapis.com/auth/datastore` scope and cached until shortly before it expires.
     */
    accessToken?: (() => Promise<string>) | undefined;

    /**
     * If `true`, `timestampValue` is decoded as [FirestoreTimestamp] instead of [Date].
     */
    preciseTimestamps?: boolean | undefined;

    /**
     * Maximum number of attempts for [FirestoreRestClient.runTransaction]. Defaults to `5`.
     */
    maxTransactionAttempts?: number | undefined;
}

/**
 * A Firestore document.
 */
export interface FirestoreDocument {
    /**
     * Document path relative to the database root (e.g. `user/abc`).
     */
    path: string;

    /**
     * Document ID.
     */
    id: string;

    /**
     * Decoded document data.
     */
    data: { [key: string]: any };

    /**
     * Creation time (RFC 3339).
     */
    createTime?: string | undefined;

    /**
     * Last update time (RFC 3339).
     */
    updateTime?: string | undefined;
}

/**
 * Raw Firestore REST document.
 */
export interface FirestoreRestDocument {
    name: string;
    fields?: { [key: string]: FirestoreRestValue };
    createTime?: string;
    updateTime?: string;
}

/**
 * Filter operators for [FirestoreRestClient.runQuery].
 */
export type FirestoreFilterOperator =
    | "=="
    | "!="
    | "<"
    | "<="
    | ">"
    | ">="
    | "in"
    | "not-in"
    | "array-contains"
    | "array-contains-any"
    | "is-null"
    | "is-not-null"
    | "is-nan"
    | "is-not-nan";

/**
 * A filter for [FirestoreRestClient.runQuery].
 */
export interface FirestoreWhere {
    /**
     * Field path. Dots separate nested fields (`a.b`). Use `__name__` for the document ID.
     */
    field: string;

    /**
     * Filter operator.
     */
    op: FirestoreFilterOperator;

    /**
     * Value to compare. Not used for unary operators (`is-null`, `is-not-null`, `is-nan`, `is-not-nan`).
     *
     * For `__name__`, document IDs or document paths (strings) are accepted.
     */
    value?: unknown;
}

/**
 * Ordering for [FirestoreRestClient.runQuery].
 */
export interface FirestoreOrderBy {
    /**
     * Field path. Use `__name__` for the document ID.
     */
    field: string;

    /**
     * Direction. Defaults to `asc`.
     */
    direction?: "asc" | "desc" | undefined;
}

/**
 * Query for [FirestoreRestClient.runQuery].
 */
export interface FirestoreQuery {
    /**
     * Filters combined with AND.
     */
    where?: FirestoreWhere[] | undefined;

    /**
     * Orderings.
     */
    orderBy?: FirestoreOrderBy[] | undefined;

    /**
     * Maximum number of documents.
     */
    limit?: number | undefined;

    /**
     * Number of documents to skip.
     */
    offset?: number | undefined;

    /**
     * Start cursor (inclusive). Values correspond to [orderBy] positionally.
     */
    startAt?: unknown[] | undefined;

    /**
     * Start cursor (exclusive). Values correspond to [orderBy] positionally.
     */
    startAfter?: unknown[] | undefined;

    /**
     * End cursor (inclusive). Values correspond to [orderBy] positionally.
     */
    endAt?: unknown[] | undefined;

    /**
     * End cursor (exclusive). Values correspond to [orderBy] positionally.
     */
    endBefore?: unknown[] | undefined;

    /**
     * Field paths to return. All fields are returned if omitted.
     */
    select?: string[] | undefined;

    /**
     * If `true`, queries all collections with the same ID under the parent (collection group query).
     */
    allDescendants?: boolean | undefined;
}

/**
 * Precondition for a write.
 */
export interface FirestorePrecondition {
    /**
     * Require the document to exist (`true`) or not exist (`false`).
     */
    exists?: boolean | undefined;

    /**
     * Require the document to have been last updated at this time (RFC 3339).
     */
    updateTime?: string | undefined;
}

/**
 * A write operation for [FirestoreRestClient.commit].
 *
 * - `set`: Overwrite the document. With `merge: true`, only the given leaf fields are updated.
 *   With `updateMask`, only the given field paths are updated.
 * - `create`: Create the document. Fails if it already exists.
 * - `update`: Update the given fields of an existing document. Keys may be dotted field paths (`a.b`).
 * - `delete`: Delete the document.
 *
 * Values may contain [FirestoreFieldValue] / [DatabaseIncrement] sentinels.
 */
export type FirestoreWrite =
    | {
        type: "set";
        path: string;
        data: { [key: string]: unknown };
        merge?: boolean | undefined;
        updateMask?: string[] | undefined;
        precondition?: FirestorePrecondition | undefined;
    }
    | {
        type: "create";
        path: string;
        data: { [key: string]: unknown };
    }
    | {
        type: "update";
        path: string;
        data: { [key: string]: unknown };
        precondition?: FirestorePrecondition | undefined;
    }
    | {
        type: "delete";
        path: string;
        precondition?: FirestorePrecondition | undefined;
    };

/**
 * Result of a single write.
 */
export interface FirestoreWriteResult {
    /**
     * Last update time of the document after the write (RFC 3339).
     */
    updateTime?: string | undefined;

    /**
     * Decoded results of field transforms, in the order of the transforms.
     */
    transformResults?: any[] | undefined;
}

/**
 * Result of [FirestoreRestClient.commit].
 */
export interface FirestoreCommitResult {
    /**
     * Commit time (RFC 3339).
     */
    commitTime?: string | undefined;

    /**
     * Results of each write, in the same order as the writes.
     */
    writeResults: FirestoreWriteResult[];
}

/**
 * Error returned by the Firestore REST API.
 */
export class FirestoreRestError extends HttpError {
    /**
     * Error returned by the Firestore REST API.
     *
     * @param status
     * HTTP status code.
     *
     * @param code
     * gRPC status name (e.g. `ABORTED`, `NOT_FOUND`, `ALREADY_EXISTS`, `FAILED_PRECONDITION`).
     *
     * @param message
     * Error message.
     */
    constructor(
        status: number,
        public readonly code: string,
        message: string,
    ) {
        super(status, message);
        this.name = "FirestoreRestError";
    }

    /**
     * Whether the transaction was aborted due to contention and can be retried.
     */
    get aborted(): boolean {
        return this.code === "ABORTED";
    }
}

/**
 * Transaction handle passed to [FirestoreRestClient.runTransaction].
 *
 * Reads are executed immediately within the transaction. Writes are buffered and committed
 * atomically when the callback completes. All reads must happen before writes.
 */
export class FirestoreTransaction {
    /**
     * Transaction handle.
     *
     * @param client
     * Client that started the transaction.
     *
     * @param id
     * Transaction ID returned by `beginTransaction`.
     */
    constructor(
        private readonly client: FirestoreRestClient,
        public readonly id: string,
    ) { }

    /**
     * Buffered writes.
     */
    readonly writes: FirestoreWrite[] = [];

    /**
     * Get a document within the transaction.
     */
    async get(path: string): Promise<FirestoreDocument | null> {
        return await this.client.getDocument(path, { transaction: this.id });
    }

    /**
     * Get multiple documents within the transaction.
     */
    async getAll(paths: string[]): Promise<(FirestoreDocument | null)[]> {
        return await this.client.batchGet(paths, { transaction: this.id });
    }

    /**
     * Run a query within the transaction.
     */
    async query(collectionPath: string, query?: FirestoreQuery): Promise<FirestoreDocument[]> {
        return await this.client.runQuery(collectionPath, query, { transaction: this.id });
    }

    /**
     * Buffer a set write.
     */
    set(
        path: string,
        data: { [key: string]: unknown },
        options?: { merge?: boolean | undefined, updateMask?: string[] | undefined },
    ): this {
        this.writes.push({ type: "set", path, data, merge: options?.merge, updateMask: options?.updateMask });
        return this;
    }

    /**
     * Buffer a create write (fails if the document exists).
     */
    create(path: string, data: { [key: string]: unknown }): this {
        this.writes.push({ type: "create", path, data });
        return this;
    }

    /**
     * Buffer an update write (fails if the document does not exist).
     */
    update(path: string, data: { [key: string]: unknown }): this {
        this.writes.push({ type: "update", path, data });
        return this;
    }

    /**
     * Buffer a delete write.
     */
    delete(path: string, options?: { exists?: boolean | undefined }): this {
        this.writes.push({
            type: "delete",
            path,
            precondition: options?.exists !== undefined ? { exists: options.exists } : undefined,
        });
        return this;
    }
}

/**
 * Firestore REST API client for Cloudflare Workers.
 *
 * Authenticates with a Google service account (admin privileges), so
 * **Firestore Security Rules are NOT applied**. The Worker code itself is the
 * permission boundary: validate the caller and the data before writing.
 */
export class FirestoreRestClient {
    /**
     * Firestore REST API client.
     */
    constructor(options: FirestoreRestClientOptions) {
        this.serviceAccount = typeof options.serviceAccount === "string"
            ? parseGoogleServiceAccount(options.serviceAccount)
            : options.serviceAccount;
        const env = typeof process !== "undefined" ? (process?.env ?? {}) : {};
        const projectId = firstNonEmpty(
            options.projectId,
            this.serviceAccount.project_id,
            env["FIREBASE_PROJECT_ID"],
        );
        if (!projectId) {
            throw new HttpError(500, "Firestore project ID is not found.");
        }
        this.projectId = projectId;
        this.databaseId = firstNonEmpty(options.databaseId) ?? firestoreDefaultDatabaseId;
        this.baseUrl = (firstNonEmpty(options.baseUrl) ?? firestoreDefaultBaseUrl).replace(/\/+$/, "");
        this.fetcher = options.fetch;
        this.accessTokenProvider = options.accessToken;
        this.preciseTimestamps = options.preciseTimestamps ?? false;
        this.maxTransactionAttempts = Math.max(1, options.maxTransactionAttempts ?? 5);
    }

    /**
     * Service account credentials.
     */
    readonly serviceAccount: GoogleServiceAccount;

    /**
     * Firebase project ID.
     */
    readonly projectId: string;

    /**
     * Firestore database ID.
     */
    readonly databaseId: string;

    /**
     * REST API base URL.
     */
    readonly baseUrl: string;

    private readonly fetcher?: typeof fetch;
    private readonly accessTokenProvider?: () => Promise<string>;
    private readonly preciseTimestamps: boolean;
    private readonly maxTransactionAttempts: number;

    /**
     * Resource name of the database (`projects/{project}/databases/{database}`).
     */
    get databaseName(): string {
        return `projects/${this.projectId}/databases/${this.databaseId}`;
    }

    /**
     * Resource name of the documents root (`projects/{project}/databases/{database}/documents`).
     */
    get documentRoot(): string {
        return `${this.databaseName}/documents`;
    }

    /**
     * Convert a document path to its full resource name.
     */
    documentName(path: string): string {
        const segments = splitPath(path);
        if (segments.length === 0 || segments.length % 2 !== 0) {
            throw new HttpError(400, `Invalid document path: ${path}`);
        }
        return `${this.documentRoot}/${segments.join("/")}`;
    }

    /**
     * Get a document.
     *
     * @returns { Promise<FirestoreDocument | null> }
     * The document, or `null` if it does not exist.
     */
    async getDocument(
        path: string,
        options?: { transaction?: string | undefined },
    ): Promise<FirestoreDocument | null> {
        const name = this.documentName(path);
        const query = options?.transaction ? `?transaction=${encodeURIComponent(options.transaction)}` : "";
        const res = await this.send("GET", `${this.baseUrl}/${encodePath(name)}${query}`, undefined, true);
        if (res === null) {
            return null;
        }
        return this.decodeDocument(res as FirestoreRestDocument);
    }

    /**
     * Get multiple documents in one request.
     *
     * @returns { Promise<(FirestoreDocument | null)[]> }
     * Documents in the same order as `paths`. Missing documents are `null`.
     */
    async batchGet(
        paths: string[],
        options?: { transaction?: string | undefined },
    ): Promise<(FirestoreDocument | null)[]> {
        if (paths.length === 0) {
            return [];
        }
        const names = paths.map((path) => this.documentName(path));
        const body: { [key: string]: unknown } = { documents: names };
        if (options?.transaction) {
            body["transaction"] = options.transaction;
        }
        const res = await this.send("POST", `${this.baseUrl}/${encodePath(this.documentRoot)}:batchGet`, body) as {
            found?: FirestoreRestDocument,
            missing?: string,
        }[];
        const found = new Map<string, FirestoreDocument>();
        for (const item of res ?? []) {
            if (item.found) {
                found.set(item.found.name, this.decodeDocument(item.found));
            }
        }
        return names.map((name) => found.get(name) ?? null);
    }

    /**
     * Create a document. Fails with `ALREADY_EXISTS` if the document exists.
     *
     * @param collectionPath
     * Collection path (e.g. `user`).
     *
     * @param data
     * Document data. May contain sentinels.
     *
     * @param options.documentId
     * Document ID. A random 20-character ID is generated if omitted.
     *
     * @returns { Promise<{ path: string, id: string, updateTime?: string }> }
     * Path and ID of the created document.
     */
    async createDocument(
        collectionPath: string,
        data: { [key: string]: unknown },
        options?: { documentId?: string | undefined },
    ): Promise<{ path: string, id: string, updateTime?: string | undefined }> {
        const segments = splitPath(collectionPath);
        if (segments.length === 0 || segments.length % 2 !== 1) {
            throw new HttpError(400, `Invalid collection path: ${collectionPath}`);
        }
        const id = options?.documentId ?? generateDocumentId();
        const path = `${segments.join("/")}/${id}`;
        const result = await this.commit([{ type: "create", path, data }]);
        return { path, id, updateTime: result.writeResults[0]?.updateTime };
    }

    /**
     * Set a document.
     *
     * @param options.merge
     * If `true`, only the leaf fields in `data` are written and other fields are kept.
     *
     * @param options.updateMask
     * Field paths to write. Fields in the mask that are absent from `data` are deleted.
     *
     * @param options.precondition
     * Precondition for the write.
     */
    async setDocument(
        path: string,
        data: { [key: string]: unknown },
        options?: {
            merge?: boolean | undefined,
            updateMask?: string[] | undefined,
            precondition?: FirestorePrecondition | undefined,
        },
    ): Promise<FirestoreWriteResult> {
        const result = await this.commit([{
            type: "set",
            path,
            data,
            merge: options?.merge,
            updateMask: options?.updateMask,
            precondition: options?.precondition,
        }]);
        return result.writeResults[0] ?? {};
    }

    /**
     * Update fields of an existing document. Fails with `NOT_FOUND` if it does not exist.
     *
     * Keys may be dotted field paths (`a.b`).
     */
    async updateDocument(
        path: string,
        data: { [key: string]: unknown },
    ): Promise<FirestoreWriteResult> {
        const result = await this.commit([{ type: "update", path, data }]);
        return result.writeResults[0] ?? {};
    }

    /**
     * Delete a document.
     *
     * @param options.exists
     * If `true`, fails when the document does not exist.
     */
    async deleteDocument(
        path: string,
        options?: { exists?: boolean | undefined },
    ): Promise<void> {
        await this.commit([{
            type: "delete",
            path,
            precondition: options?.exists !== undefined ? { exists: options.exists } : undefined,
        }]);
    }

    /**
     * Run a query on a collection.
     *
     * @param collectionPath
     * Collection path (e.g. `user` or `user/abc/transaction`).
     *
     * @returns { Promise<FirestoreDocument[]> }
     * Matched documents.
     */
    async runQuery(
        collectionPath: string,
        query?: FirestoreQuery,
        options?: { transaction?: string | undefined },
    ): Promise<FirestoreDocument[]> {
        const docs = await this.runQueryRaw(collectionPath, query, options);
        return docs.map((doc) => this.decodeDocument(doc));
    }

    /**
     * Run a query and return raw REST documents (values are not decoded).
     */
    async runQueryRaw(
        collectionPath: string,
        query?: FirestoreQuery,
        options?: { transaction?: string | undefined },
    ): Promise<FirestoreRestDocument[]> {
        const { parent, structuredQuery } = this.buildStructuredQuery(collectionPath, query);
        const body: { [key: string]: unknown } = { structuredQuery };
        if (options?.transaction) {
            body["transaction"] = options.transaction;
        }
        const res = await this.send("POST", `${this.baseUrl}/${encodePath(parent)}:runQuery`, body) as {
            document?: FirestoreRestDocument,
        }[];
        const docs: FirestoreRestDocument[] = [];
        for (const item of res ?? []) {
            if (item.document) {
                docs.push(item.document);
            }
        }
        return docs;
    }

    /**
     * Build the parent resource name and `structuredQuery` for a query.
     */
    buildStructuredQuery(
        collectionPath: string,
        query?: FirestoreQuery,
    ): { parent: string, structuredQuery: { [key: string]: unknown } } {
        const segments = splitPath(collectionPath);
        if (segments.length === 0 || segments.length % 2 !== 1) {
            throw new HttpError(400, `Invalid collection path: ${collectionPath}`);
        }
        const collectionId = segments[segments.length - 1];
        const parentSegments = segments.slice(0, -1);
        const parent = parentSegments.length > 0
            ? `${this.documentRoot}/${parentSegments.join("/")}`
            : this.documentRoot;
        const normalizedCollection = segments.join("/");
        const structuredQuery: { [key: string]: unknown } = {
            from: [{ collectionId, allDescendants: query?.allDescendants ?? false }],
        };
        const filters = (query?.where ?? []).map((where) => this.encodeFilter(where, normalizedCollection));
        if (filters.length === 1) {
            structuredQuery["where"] = filters[0];
        } else if (filters.length > 1) {
            structuredQuery["where"] = { compositeFilter: { op: "AND", filters } };
        }
        const orderBy = query?.orderBy ?? [];
        if (orderBy.length > 0) {
            structuredQuery["orderBy"] = orderBy.map((order) => ({
                field: { fieldPath: normalizeFieldPath(order.field) },
                direction: order.direction === "desc" ? "DESCENDING" : "ASCENDING",
            }));
        }
        if (query?.select) {
            structuredQuery["select"] = {
                fields: query.select.map((field) => ({ fieldPath: normalizeFieldPath(field) })),
            };
        }
        const cursor = (values: unknown[], before: boolean) => ({
            values: values.map((value, index) => this.encodeCursorValue(value, orderBy[index]?.field, normalizedCollection)),
            before,
        });
        if (query?.startAt) {
            structuredQuery["startAt"] = cursor(query.startAt, true);
        } else if (query?.startAfter) {
            structuredQuery["startAt"] = cursor(query.startAfter, false);
        }
        if (query?.endAt) {
            structuredQuery["endAt"] = cursor(query.endAt, false);
        } else if (query?.endBefore) {
            structuredQuery["endAt"] = cursor(query.endBefore, true);
        }
        if (query?.offset !== undefined && query.offset > 0) {
            structuredQuery["offset"] = query.offset;
        }
        if (query?.limit !== undefined && query.limit > 0) {
            structuredQuery["limit"] = query.limit;
        }
        return { parent, structuredQuery };
    }

    /**
     * Commit writes atomically.
     *
     * @param writes
     * Write operations.
     *
     * @param options.transaction
     * Transaction ID to commit.
     */
    async commit(
        writes: FirestoreWrite[],
        options?: { transaction?: string | undefined },
    ): Promise<FirestoreCommitResult> {
        const body: { [key: string]: unknown } = {
            writes: writes.map((write) => this.encodeWrite(write)),
        };
        if (options?.transaction) {
            body["transaction"] = options.transaction;
        }
        const res = await this.send("POST", `${this.baseUrl}/${encodePath(this.documentRoot)}:commit`, body) as {
            commitTime?: string,
            writeResults?: { updateTime?: string, transformResults?: FirestoreRestValue[] }[],
        };
        const decodeOptions = { preciseTimestamps: this.preciseTimestamps };
        return {
            commitTime: res?.commitTime,
            writeResults: (res?.writeResults ?? []).map((result) => ({
                updateTime: result.updateTime,
                transformResults: result.transformResults?.map((value) => decodeFirestoreValue(value, decodeOptions)),
            })),
        };
    }

    /**
     * Begin a transaction.
     *
     * @returns { Promise<string> }
     * Transaction ID.
     */
    async beginTransaction(options?: {
        readOnly?: boolean | undefined,
        retryTransaction?: string | undefined,
    }): Promise<string> {
        const transactionOptions = options?.readOnly
            ? { readOnly: {} }
            : { readWrite: options?.retryTransaction ? { retryTransaction: options.retryTransaction } : {} };
        const res = await this.send(
            "POST",
            `${this.baseUrl}/${encodePath(this.documentRoot)}:beginTransaction`,
            { options: transactionOptions },
        ) as { transaction?: string };
        if (!res?.transaction) {
            throw new HttpError(500, "Failed to begin Firestore transaction.");
        }
        return res.transaction;
    }

    /**
     * Roll back a transaction.
     */
    async rollback(transaction: string): Promise<void> {
        await this.send("POST", `${this.baseUrl}/${encodePath(this.documentRoot)}:rollback`, { transaction });
    }

    /**
     * Run a transaction.
     *
     * Begins a transaction, runs `callback`, then commits the buffered writes. If the callback
     * or a read fails, the transaction is rolled back. If Firestore aborts the transaction
     * (`ABORTED`, e.g. due to contention), the whole callback is retried up to
     * `maxAttempts` times. The callback must therefore be free of side effects other than
     * the transaction's reads and writes.
     *
     * @param callback
     * Transaction body.
     *
     * @param options.readOnly
     * Start a read-only transaction. Writes are not allowed.
     *
     * @param options.maxAttempts
     * Maximum number of attempts (defaults to the client's `maxTransactionAttempts`).
     */
    async runTransaction<T>(
        callback: (transaction: FirestoreTransaction) => Promise<T>,
        options?: { readOnly?: boolean | undefined, maxAttempts?: number | undefined },
    ): Promise<T> {
        const maxAttempts = Math.max(1, options?.maxAttempts ?? this.maxTransactionAttempts);
        let previous: string | undefined;
        let lastError: unknown;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const id = await this.beginTransaction({
                readOnly: options?.readOnly,
                retryTransaction: options?.readOnly ? undefined : previous,
            });
            previous = id;
            const transaction = new FirestoreTransaction(this, id);
            let result: T;
            try {
                result = await callback(transaction);
            } catch (error) {
                await this.rollback(id).catch(() => undefined);
                if (isAborted(error) && attempt + 1 < maxAttempts) {
                    lastError = error;
                    continue;
                }
                throw error;
            }
            if (options?.readOnly) {
                if (transaction.writes.length > 0) {
                    await this.rollback(id).catch(() => undefined);
                    throw new HttpError(400, "Writes are not allowed in a read-only transaction.");
                }
                await this.rollback(id).catch(() => undefined);
                return result;
            }
            try {
                await this.commit(transaction.writes, { transaction: id });
                return result;
            } catch (error) {
                if (isAborted(error) && attempt + 1 < maxAttempts) {
                    lastError = error;
                    continue;
                }
                await this.rollback(id).catch(() => undefined);
                throw error;
            }
        }
        throw lastError ?? new HttpError(500, "Firestore transaction failed.");
    }

    /**
     * Convert a [FirestoreWrite] into a REST `Write` object.
     */
    encodeWrite(write: FirestoreWrite): { [key: string]: unknown } {
        const name = this.documentName(write.path);
        if (write.type === "delete") {
            return withPrecondition({ delete: name }, write.precondition);
        }
        if (write.type === "update") {
            const nested = expandDottedKeys(write.data);
            const encoded = encodeFirestoreWriteFields(nested, this.documentRoot);
            const transformPaths = new Set(encoded.transforms.map((transform) => transform.fieldPath));
            const mask = Object.keys(write.data)
                .map((key) => normalizeFieldPath(key))
                .filter((path) => !transformPaths.has(path));
            return withPrecondition(buildUpdate(name, encoded.fields, mask, encoded.transforms),
                write.precondition ?? { exists: true });
        }
        const encoded = encodeFirestoreWriteFields(write.data, this.documentRoot);
        if (write.type === "create") {
            if (encoded.deletePaths.length > 0) {
                throw new HttpError(400, "FirestoreFieldValue.delete() cannot be used with create.");
            }
            return withPrecondition(buildUpdate(name, encoded.fields, undefined, encoded.transforms), { exists: false });
        }
        let mask: string[] | undefined;
        if (write.updateMask) {
            mask = write.updateMask.map((path) => normalizeFieldPath(path));
        } else if (write.merge) {
            mask = encoded.leafPaths;
        } else if (encoded.deletePaths.length > 0) {
            throw new HttpError(400, "FirestoreFieldValue.delete() requires merge or updateMask.");
        }
        return withPrecondition(buildUpdate(name, encoded.fields, mask, encoded.transforms), write.precondition);
    }

    private encodeFilter(where: FirestoreWhere, collectionPath: string): { [key: string]: unknown } {
        const field = { fieldPath: normalizeFieldPath(where.field) };
        const unary = (op: string) => ({ unaryFilter: { op, field } });
        switch (where.op) {
            case "is-null":
                return unary("IS_NULL");
            case "is-not-null":
                return unary("IS_NOT_NULL");
            case "is-nan":
                return unary("IS_NAN");
            case "is-not-nan":
                return unary("IS_NOT_NAN");
        }
        if (where.op === "==" || where.op === "!=") {
            if (where.value === null || where.value === undefined) {
                return unary(where.op === "==" ? "IS_NULL" : "IS_NOT_NULL");
            }
            if (typeof where.value === "number" && Number.isNaN(where.value)) {
                return unary(where.op === "==" ? "IS_NAN" : "IS_NOT_NAN");
            }
        }
        const op = filterOperators[where.op];
        if (!op) {
            throw new HttpError(400, `Unsupported filter operator: ${where.op}`);
        }
        if (["in", "not-in", "array-contains-any"].includes(where.op)) {
            if (!Array.isArray(where.value) || where.value.length === 0) {
                throw new HttpError(400, `${where.op} requires a non-empty array.`);
            }
        }
        let value = where.value;
        if (where.field === "__name__") {
            value = Array.isArray(value)
                ? value.map((item) => toReference(item, collectionPath))
                : toReference(value, collectionPath);
        }
        return {
            fieldFilter: {
                field,
                op,
                value: encodeFirestoreValue(value, this.documentRoot),
            },
        };
    }

    private encodeCursorValue(value: unknown, field: string | undefined, collectionPath: string): FirestoreRestValue {
        if (field === "__name__") {
            return encodeFirestoreValue(toReference(value, collectionPath), this.documentRoot);
        }
        return encodeFirestoreValue(value, this.documentRoot);
    }

    /**
     * Decode a raw REST document.
     */
    decodeDocument(doc: FirestoreRestDocument): FirestoreDocument {
        const path = doc.name.substring(doc.name.indexOf("/documents/") + "/documents/".length);
        const segments = path.split("/");
        return {
            path,
            id: segments[segments.length - 1] ?? "",
            data: decodeFirestoreFields(doc.fields, { preciseTimestamps: this.preciseTimestamps }),
            createTime: doc.createTime,
            updateTime: doc.updateTime,
        };
    }

    private async accessToken(): Promise<string> {
        if (this.accessTokenProvider) {
            return await this.accessTokenProvider();
        }
        const token = await issueGoogleAccessToken({
            serviceAccount: this.serviceAccount,
            scopes: [firestoreDatastoreScope],
        });
        return token.accessToken;
    }

    private async send(
        method: "GET" | "POST",
        url: string,
        body?: unknown,
        allowNotFound = false,
    ): Promise<unknown> {
        const token = await this.accessToken();
        const fetcher = this.fetcher ?? fetch;
        const res = await fetcher(url, {
            method,
            headers: {
                "Authorization": `Bearer ${token}`,
                ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (allowNotFound && res.status === 404) {
            return null;
        }
        const text = await res.text();
        let json: unknown = null;
        if (text.length > 0) {
            try {
                json = JSON.parse(text);
            } catch {
                json = null;
            }
        }
        if (!res.ok) {
            throw toRestError(res.status, json, text);
        }
        // runQuery / batchGet may return errors inside the streamed array.
        if (Array.isArray(json)) {
            for (const item of json) {
                const error = (item as { error?: unknown })?.error;
                if (error) {
                    throw toRestError(500, item, text);
                }
            }
        }
        return json;
    }
}

const filterOperators: { [key: string]: string } = {
    "==": "EQUAL",
    "!=": "NOT_EQUAL",
    "<": "LESS_THAN",
    "<=": "LESS_THAN_OR_EQUAL",
    ">": "GREATER_THAN",
    ">=": "GREATER_THAN_OR_EQUAL",
    "in": "IN",
    "not-in": "NOT_IN",
    "array-contains": "ARRAY_CONTAINS",
    "array-contains-any": "ARRAY_CONTAINS_ANY",
};

const grpcStatusToHttp: { [key: string]: number } = {
    INVALID_ARGUMENT: 400,
    FAILED_PRECONDITION: 400,
    OUT_OF_RANGE: 400,
    UNAUTHENTICATED: 401,
    PERMISSION_DENIED: 403,
    NOT_FOUND: 404,
    ABORTED: 409,
    ALREADY_EXISTS: 409,
    RESOURCE_EXHAUSTED: 429,
    CANCELLED: 499,
    INTERNAL: 500,
    UNKNOWN: 500,
    UNIMPLEMENTED: 501,
    UNAVAILABLE: 503,
    DEADLINE_EXCEEDED: 504,
};

function toRestError(status: number, json: unknown, text: string): FirestoreRestError {
    const error = (json as { error?: { code?: number, status?: string, message?: string } } | null)?.error;
    const code = error?.status ?? "UNKNOWN";
    const httpStatus = status >= 400 ? status : (grpcStatusToHttp[code] ?? 500);
    const message = error?.message ?? (text.length > 0 ? text : `Firestore request failed with status ${status}.`);
    return new FirestoreRestError(httpStatus, code, `Firestore ${code}: ${message}`);
}

function isAborted(error: unknown): boolean {
    return error instanceof FirestoreRestError && error.aborted;
}

function buildUpdate(
    name: string,
    fields: { [key: string]: FirestoreRestValue },
    mask: string[] | undefined,
    transforms: FirestoreRestFieldTransform[],
): { [key: string]: unknown } {
    const write: { [key: string]: unknown } = { update: { name, fields } };
    if (mask !== undefined) {
        write["updateMask"] = { fieldPaths: mask };
    }
    if (transforms.length > 0) {
        write["updateTransforms"] = transforms;
    }
    return write;
}

function withPrecondition(
    write: { [key: string]: unknown },
    precondition: FirestorePrecondition | undefined,
): { [key: string]: unknown } {
    if (!precondition) {
        return write;
    }
    const currentDocument: { [key: string]: unknown } = {};
    if (precondition.exists !== undefined) {
        currentDocument["exists"] = precondition.exists;
    }
    if (precondition.updateTime !== undefined) {
        currentDocument["updateTime"] = precondition.updateTime;
    }
    if (Object.keys(currentDocument).length === 0) {
        return write;
    }
    return { ...write, currentDocument };
}

function expandDottedKeys(data: { [key: string]: unknown }): { [key: string]: unknown } {
    const result: { [key: string]: unknown } = {};
    for (const [key, value] of Object.entries(data)) {
        if (!key.includes(".") || key.includes("`")) {
            result[key] = value;
            continue;
        }
        const segments = key.split(".");
        let target = result;
        for (let i = 0; i < segments.length - 1; i++) {
            const existing = target[segments[i]];
            if (existing === null || typeof existing !== "object" || Array.isArray(existing)) {
                target[segments[i]] = {};
            }
            target = target[segments[i]] as { [key: string]: unknown };
        }
        target[segments[segments.length - 1]] = value;
    }
    return result;
}

function toReference(value: unknown, collectionPath: string): unknown {
    if (value instanceof FirestoreReference) {
        return value;
    }
    if (typeof value === "string") {
        const path = trimSlashes(value);
        return new FirestoreReference(path.includes("/") ? path : `${collectionPath}/${path}`);
    }
    return value;
}

function splitPath(path: string): string[] {
    return path.split("/").map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}

function encodePath(name: string): string {
    return name.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function firstNonEmpty(...values: (string | undefined | null)[]): string | undefined {
    for (const value of values) {
        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
    }
    return undefined;
}

/**
 * Generate a random 20-character document ID (same format as the Firebase SDKs).
 */
export function generateDocumentId(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const maxMultiple = Math.floor(256 / chars.length) * chars.length;
    let id = "";
    while (id.length < 20) {
        const bytes = new Uint8Array(40);
        crypto.getRandomValues(bytes);
        for (const byte of bytes) {
            if (id.length < 20 && byte < maxMultiple) {
                id += chars.charAt(byte % chars.length);
            }
        }
    }
    return id;
}
