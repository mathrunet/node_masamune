import {
    base64UrlDecode,
    base64UrlEncode,
    DatabaseAdapterBase,
    DatabaseDocument,
    DatabaseQueryResult,
    DatabaseWhereCondition,
    HttpError,
} from "@mathrunet/masamune_cloudflare";
import {
    FirestoreOrderBy,
    FirestoreRestClient,
    FirestoreRestDocument,
    FirestoreWhere,
} from "./client";
import {
    decodeFirestoreValue,
    FirestoreRestValue,
    trimSlashes,
} from "./value";

/**
 * Where condition types that are inequalities in Firestore.
 *
 * Firestore requires inequality fields to be ordered before `__name__`, so the adapter
 * orders by these fields first when paginating.
 */
const inequalityTypes = new Set<DatabaseWhereCondition["type"]>([
    "notEqualTo",
    "lessThan",
    "lessThanOrEqualTo",
    "greaterThan",
    "greaterThanOrEqualTo",
    "whereNotIn",
    "isNotNull",
]);

/**
 * Convert a [DatabaseWhereCondition] into a [FirestoreWhere].
 */
export function databaseWhereToFirestoreWhere(condition: DatabaseWhereCondition): FirestoreWhere {
    switch (condition.type) {
        case "equalTo":
            return { field: condition.key, op: "==", value: condition.value };
        case "notEqualTo":
            return { field: condition.key, op: "!=", value: condition.value };
        case "lessThan":
            return { field: condition.key, op: "<", value: condition.value };
        case "lessThanOrEqualTo":
            return { field: condition.key, op: "<=", value: condition.value };
        case "greaterThan":
            return { field: condition.key, op: ">", value: condition.value };
        case "greaterThanOrEqualTo":
            return { field: condition.key, op: ">=", value: condition.value };
        case "whereIn":
            return { field: condition.key, op: "in", value: condition.value };
        case "whereNotIn":
            return { field: condition.key, op: "not-in", value: condition.value };
        case "isNull":
            return { field: condition.key, op: "is-null" };
        case "isNotNull":
            return { field: condition.key, op: "is-not-null" };
        case "arrayContains":
            return { field: condition.key, op: "array-contains", value: condition.value };
        case "arrayContainsAny":
            return { field: condition.key, op: "array-contains-any", value: condition.value };
        default:
            throw new HttpError(400, `Unsupported where condition: ${(condition as { type: string }).type}`);
    }
}

/**
 * [DatabaseAdapterBase] implementation for Firestore (via the REST API).
 *
 * Paths are plain Firestore paths (e.g. `user/{uid}` or `user/{uid}/transaction/{id}`).
 * Can be passed as `database` to packages such as
 * `@mathrunet/masamune_cloudflare_purchase` and `@mathrunet/masamune_cloudflare_notification`.
 *
 * Runs with service account (admin) privileges: Firestore Security Rules are not applied.
 */
export class FirestoreDatabaseAdapter extends DatabaseAdapterBase {
    /**
     * [DatabaseAdapterBase] implementation for Firestore.
     *
     * @param config.client
     * Firestore REST client.
     */
    constructor({ client }: { client: FirestoreRestClient }) {
        super();
        this.client = client;
    }

    /**
     * Firestore REST client.
     */
    readonly client: FirestoreRestClient;

    async getDocument(path: string): Promise<DatabaseDocument | null> {
        const doc = await this.client.getDocument(path);
        if (!doc) {
            return null;
        }
        return { path: doc.path, data: doc.data };
    }

    async saveDocument(
        path: string,
        data: { [key: string]: any },
        options?: { merge?: boolean | undefined },
    ): Promise<void> {
        await this.client.setDocument(path, data, { merge: options?.merge ?? false });
    }

    async query(
        collectionPath: string,
        options?: {
            wheres?: DatabaseWhereCondition[] | undefined,
            limit?: number | undefined,
            cursor?: string | null | undefined,
        },
    ): Promise<DatabaseQueryResult> {
        const wheres = options?.wheres ?? [];
        const orderBy: FirestoreOrderBy[] = [];
        for (const where of wheres) {
            if (inequalityTypes.has(where.type) && !orderBy.some((order) => order.field === where.key)) {
                orderBy.push({ field: where.key, direction: "asc" });
            }
        }
        orderBy.push({ field: "__name__", direction: "asc" });
        const limit = options?.limit && options.limit > 0 ? options.limit : undefined;
        const startAfter = options?.cursor ? decodeCursor(options.cursor, orderBy.length) : undefined;
        const docs = await this.client.runQueryRaw(collectionPath, {
            where: wheres.map(databaseWhereToFirestoreWhere),
            orderBy,
            limit,
            startAfter,
        });
        const decoded = docs.map((doc) => this.client.decodeDocument(doc));
        const last = docs[docs.length - 1];
        const cursor = limit && docs.length >= limit && last
            ? encodeCursor(last, orderBy)
            : null;
        return {
            docs: decoded.map((doc) => ({ path: doc.path, data: doc.data })),
            cursor,
        };
    }
}

function encodeCursor(doc: FirestoreRestDocument, orderBy: FirestoreOrderBy[]): string {
    const values: FirestoreRestValue[] = orderBy.map((order) => {
        if (order.field === "__name__") {
            return { referenceValue: doc.name };
        }
        return getRestField(doc.fields, order.field) ?? { nullValue: null };
    });
    return base64UrlEncode(JSON.stringify(values));
}

function decodeCursor(cursor: string, length: number): unknown[] {
    let values: FirestoreRestValue[];
    try {
        values = JSON.parse(new TextDecoder().decode(base64UrlDecode(cursor))) as FirestoreRestValue[];
    } catch {
        throw new HttpError(400, "Invalid cursor.");
    }
    if (!Array.isArray(values) || values.length !== length) {
        throw new HttpError(400, "Cursor does not match the query.");
    }
    return values.map((value) => decodeFirestoreValue(value, { preciseTimestamps: true }));
}

function getRestField(
    fields: { [key: string]: FirestoreRestValue } | undefined,
    path: string,
): FirestoreRestValue | undefined {
    const segments = trimSlashes(path).split(".");
    let current: FirestoreRestValue | undefined = undefined;
    let currentFields = fields;
    for (const segment of segments) {
        current = currentFields?.[segment];
        if (current === undefined) {
            return undefined;
        }
        currentFields = (current as { mapValue?: { fields?: { [key: string]: FirestoreRestValue } } }).mapValue?.fields;
    }
    return current;
}
