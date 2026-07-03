/**
 * Abstraction of a document database used by Cloudflare Workers functions.
 *
 * Provides Firestore-like document operations (save with merge, increment, query with conditions) on top of any backing store (Turso, KV, etc.).
 *
 * Cloudflare Workersの関数で使用するドキュメントデータベースの抽象化。
 *
 * 任意のバックエンドストア（Turso、KVなど）の上にFirestoreライクなドキュメント操作（マージ保存、インクリメント、条件付きクエリ）を提供します。
 */

/**
 * A document in the database.
 *
 * データベース内のドキュメント。
 */
export interface DatabaseDocument {
    /**
     * Document path (e.g. `user/{uid}` or `user/{uid}/transaction/{id}`).
     *
     * ドキュメントパス（例: `user/{uid}`、`user/{uid}/transaction/{id}`）。
     */
    path: string;

    /**
     * Document data.
     *
     * ドキュメントデータ。
     */
    data: { [key: string]: any };
}

/**
 * Condition types for database queries.
 *
 * データベースクエリの条件タイプ。
 */
export type DatabaseWhereConditionType =
    | "equalTo"
    | "notEqualTo"
    | "lessThan"
    | "lessThanOrEqualTo"
    | "greaterThan"
    | "greaterThanOrEqualTo"
    | "whereIn"
    | "whereNotIn"
    | "isNull"
    | "isNotNull"
    | "arrayContains"
    | "arrayContainsAny";

/**
 * A condition for a database query.
 *
 * データベースクエリの条件。
 */
export interface DatabaseWhereCondition {
    /**
     * Condition type.
     *
     * 条件タイプ。
     */
    type: DatabaseWhereConditionType;

    /**
     * Field key to compare.
     *
     * 比較するフィールドキー。
     */
    key: string;

    /**
     * Value to compare with.
     *
     * 比較する値。
     */
    value?: any;
}

/**
 * Sentinel value for incrementing a numeric field, equivalent to Firestore's `FieldValue.increment`.
 *
 * FirestoreのFieldValue.incrementに相当する、数値フィールドをインクリメントするためのセンチネル値。
 */
export class DatabaseIncrement {
    /**
     * Sentinel value for incrementing a numeric field.
     *
     * 数値フィールドをインクリメントするためのセンチネル値。
     *
     * @param value
     * Value to add.
     *
     * 加算する値。
     */
    constructor(public readonly value: number) { }
}

/**
 * Result of a database query.
 *
 * データベースクエリの結果。
 */
export interface DatabaseQueryResult {
    /**
     * Retrieved documents.
     *
     * 取得されたドキュメント。
     */
    docs: DatabaseDocument[];

    /**
     * Cursor to pass to the next query. `null` when there are no more documents.
     *
     * 次のクエリに渡すカーソル。これ以上ドキュメントがない場合は`null`。
     */
    cursor: string | null;
}

/**
 * Base class for document database adapters.
 *
 * ドキュメントデータベースアダプターのベースクラス。
 */
export abstract class DatabaseAdapterBase {
    /**
     * Get a document.
     *
     * ドキュメントを取得します。
     *
     * @param path
     * Document path (e.g. `user/{uid}`).
     *
     * ドキュメントパス（例: `user/{uid}`）。
     *
     * @returns { Promise<DatabaseDocument | null> }
     * The document, or `null` if it does not exist.
     *
     * ドキュメント。存在しない場合は`null`。
     */
    abstract getDocument(path: string): Promise<DatabaseDocument | null>;

    /**
     * Save a document.
     *
     * Values in `data` may contain [DatabaseIncrement] to increment numeric fields.
     *
     * ドキュメントを保存します。
     *
     * `data`の値には数値フィールドをインクリメントするための[DatabaseIncrement]を含めることができます。
     *
     * @param path
     * Document path (e.g. `user/{uid}`).
     *
     * ドキュメントパス（例: `user/{uid}`）。
     *
     * @param data
     * Data to save.
     *
     * 保存するデータ。
     *
     * @param options.merge
     * If `true`, merge with the existing document. If `false`, overwrite it.
     *
     * `true`の場合は既存のドキュメントとマージします。`false`の場合は上書きします。
     */
    abstract saveDocument(
        path: string,
        data: { [key: string]: any },
        options?: { merge?: boolean | undefined },
    ): Promise<void>;

    /**
     * Query a collection.
     *
     * コレクションをクエリします。
     *
     * @param collectionPath
     * Collection path (e.g. `user`).
     *
     * コレクションパス（例: `user`）。
     *
     * @param options.wheres
     * Query conditions.
     *
     * クエリ条件。
     *
     * @param options.limit
     * Maximum number of documents to retrieve.
     *
     * 取得するドキュメントの最大数。
     *
     * @param options.cursor
     * Cursor returned by the previous query.
     *
     * 前回のクエリで返されたカーソル。
     *
     * @returns { Promise<DatabaseQueryResult> }
     * Query result.
     *
     * クエリ結果。
     */
    abstract query(
        collectionPath: string,
        options?: {
            wheres?: DatabaseWhereCondition[] | undefined,
            limit?: number | undefined,
            cursor?: string | null | undefined,
        },
    ): Promise<DatabaseQueryResult>;
}
