import * as admin from "firebase-admin";
import { json } from "stream/consumers";

/**
 * Create a filter for loading Firestore collections.
 * 
 * Firestoreのコレクションをロードする際のフィルターを作成します。
 * 
 * @param query
 * Specifies a reference to a Firestore collection.
 * 
 * Firestoreのコレクションのリファレンスを指定します。
 * 
 * @param wheres
 * Specifies the filter to be applied to the collection.
 * 
 * コレクションに適用するフィルターを指定します。
 * 
 * @returns
 * Returns a Firestore query with the specified filter.
 * 
 * 指定されたフィルターを持つFirestoreのクエリを返します。
 */
export function where({
    query,
    wheres,
}: {
        query: admin.firestore.Query<admin.firestore.DocumentData, admin.firestore.DocumentData>,
        wheres: { [key: string]: any }[] | undefined,
}) : admin.firestore.Query<admin.firestore.DocumentData, admin.firestore.DocumentData> {
    if (!wheres) {
        return query;
    }
    for (let w of wheres) {
        const type = w["type"] as string | undefined | null;
        const key = w["key"] as string | undefined | null;
        const value = w["value"] as any;
        if (type === undefined || key === undefined || type === null || key === null) {
            continue;
        }
        switch (type) {
            case "equalTo":
                query = query.where(key, "==", value);
                break;
            case "notEqualTo":
                query = query.where(key, "!=", value);
                break;            
            case "lessThan":
                query = query.where(key, "<", value);
                break;
            case "greaterThan":
                query = query.where(key, ">", value);
                break;
            case "lessThanOrEqualTo":
                query = query.where(key, "<=", value);
                break;
            case "greaterThanOrEqualTo":
                query = query.where(key, ">=", value);
                break;
            case "arrayContains":
                query = query.where(key, "array-contains", value);
                break;
            case "arrayContainsAny":
                query = query.where(key, "array-contains-any", value);
                break;
            case "whereIn":
                query = query.where(key, "in", value);
                break;
            case "whereNotIn":
                query = query.where(key, "not-in", value);
                break;
            case "isNull":
                query = query.where(key, "==", null);
                break;
            case "isNotNull":
                query = query.where(key, "!=", null);
                break;
            default:
                break;
        }
    }
    return query;
}

/**
 * Judges whether all the conditions in [conditons] match the document data in [data].
 * 
 * If a reference is included in [data], the document is retrieved recursively and the condition is determined.
 * 
 * [data]のドキュメントデータに対して、[conditions]の条件が全て一致するかどうかを判定します。
 * 
 * [data]の中にリファレンスが含まれている場合、再帰的にドキュメントを取得し条件を判定します。
 * 
 * @param data
 * Target document data.
 * 
 * 対象となるドキュメントデータ。
 * 
 * @param conditions
 * Conditions to be matched.
 * 
 * 一致させる条件。
 * 
 * @returns 
 * Returns true if all conditions match, false otherwise.
 * 
 * 全ての条件が一致する場合はtrue、それ以外はfalseを返します。
 */
export async function hasMatch({
    data,
    conditions,
}: {
        data: { [key: string]: any },
        conditions: { [key: string]: any }[] | undefined,
    }): Promise<boolean> {
    if (!conditions) {
        return true;
    }
    for (let c of conditions) {
        const type = c["type"] as string | undefined | null;
        const key = c["key"] as string | undefined | null;
        const value = c["value"] as any;
        console.log(`Match ${key} ${type} ${value}`);
        if (key === undefined || key === null) {
            continue;
        }
        const source = data[key];
        console.log(`Source ${source}`);
        if (source instanceof admin.firestore.DocumentReference) {
            console.log(`Reference ${source}`);
            const doc = await source.get();
            const data = doc.data() as { [key: string]: any };
            console.log(`Reference data ${JSON.stringify(data)}`);
            if (Array.isArray(value)) {
                console.log(`Reference data value is array`);
                const res = await hasMatch({ data, conditions: value });
                console.log(`Reference data value is array res: ${res}`);
                if (!res) {
                    return false;
                }
                continue;
            } else if (_isObject(value)) {
                console.log(`Reference data value is object`);
                const res = await hasMatch({ data, conditions: [value as { [key: string]: any }] });
                console.log(`Reference data value is object res: ${res}`);
                if (!res) {
                    return false;
                }
                continue;
            }
        }
        if (type === undefined || type === null) {
            continue;
        }
        switch (type) {
            case "equalTo":
                console.log(`equalTo ${source} ${value}`);
                if (value === undefined || value === null) {
                    continue;
                }
                if (source !== value) {
                    return false;
                }
                break;
            case "notEqualTo":
                console.log(`notequalTo ${source} ${value}`);
                if (value === undefined || value === null) {
                    continue;
                }
                if (source === value) {
                    return false;
                }
                break;            
            case "lessThan":
                console.log(`lessThan ${source} ${value}`);
                if (value === undefined || value === null || typeof source !== "number" || typeof value !== "number") {
                    continue;
                }
                if (source >= value) {
                    return false;
                }
                break;
            case "greaterThan":
                console.log(`greaterThan ${source} ${value}`);
                if (value === undefined || value === null || typeof source !== "number" || typeof value !== "number") {
                    continue;
                }
                if (source <= value) {
                    return false;
                }
                break;
            case "lessThanOrEqualTo":
                console.log(`lessThanOrEqualTo ${source} ${value}`);
                if (value === undefined || value === null || typeof source !== "number" || typeof value !== "number") {
                    continue;
                }
                if (source > value) {
                    return false;
                }
                break;
            case "greaterThanOrEqualTo":
                console.log(`greaterThanOrEqualTo ${source} ${value}`);
                if (value === undefined || value === null || typeof source !== "number" || typeof value !== "number") {
                    continue;
                }
                if (source < value) {
                    return false;
                }
                break;
            case "arrayContains":
                console.log(`arrayContains ${source} ${value}`);
                if (value === undefined || value === null || !Array.isArray(source)) {
                    continue;
                }
                if (!source.includes(value)) {
                    return false;
                }
                break;
            case "arrayContainsAny":
                console.log(`arrayContainsAny ${source} ${value}`);
                if (value === undefined || value === null || !Array.isArray(source) || !Array.isArray(value)) {
                    continue;
                }
                if (!source.some(v => value.includes(v))) {
                    return false;
                }
                break;
            case "whereIn":
                console.log(`whereIn ${source} ${value}`);
                if (value === undefined || value === null || !Array.isArray(value)) {
                    continue;
                }
                if (!value.includes(source)) {
                    return false;
                }
                break;
            case "whereNotIn":
                console.log(`whereNotIn ${source} ${value}`);
                if (value === undefined || value === null || !Array.isArray(value)) {
                    continue;
                }
                if (value.includes(source)) {
                    return false;
                }
                break;
            case "isNull":
                console.log(`isNull ${source} ${value}`);
                if (source !== undefined && source !== null) {
                    return false;
                }
                break;
            case "isNotNull":
                console.log(`isNotNull ${source} ${value}`);
                if (!(source !== undefined && source !== null)) {
                    return false;
                }
                break;
            default:
                break;
        }

    }
    console.log(`Result true`);
    return true;
}

/**
 * Get the value of the specified field from the document data.
 * 
 * ドキュメントデータから指定されたフィールドの値を取得します。
 * 
 * @param data
 * Target document data.
 * 
 * 対象となるドキュメントデータ。
 * 
 * @param field
 * Specifies the field to be retrieved.
 * 
 * 取得するフィールドを指定します。
 * 
 * @returns
 * Returns the value of the specified field.
 * 
 * 指定されたフィールドの値を返します。 
 */
export async function get({
    data,
    field,
}: {
    data: { [key: string]: any },
    field: { [key: string]: any } | string,
}): Promise<any> {
    if (typeof field === "string") {
        return data[field];
    }
    const key = field["key"];
    const source = data[key];
    if (source instanceof admin.firestore.DocumentReference) {
        const doc = await source.get();
        const data = doc.data() as { [key: string]: any };
        return get({ data, field: field["reference"] });
    }
    return source;
}

/**
 * Get [limit] documents from [cursor].
 * 
 * [cursor]から[limit]個のドキュメントを取得します。
 * 
 * @param query
 * Specifies a reference to a Firestore collection.
 * 
 * Firestoreのコレクションのリファレンスを指定します。
 * 
 * @param limit
 * Specifies the number of documents to be retrieved.
 * 
 * 取得するドキュメントの数を指定します。
 * 
 * @param cursor
 * Specifies the document to start retrieving from.
 * 
 * 取得を開始するドキュメントを指定します。
 * 
 * @returns 
 */
export function cursor({
    query,
    limit,
    cursor,
}: {
        query: admin.firestore.Query<admin.firestore.DocumentData, admin.firestore.DocumentData>,
    limit: number,
    cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined | null,
    }): admin.firestore.Query<admin.firestore.DocumentData, admin.firestore.DocumentData> {
    if (!cursor) {
        return query.limit(limit);
    }
    return query.startAfter(cursor).limit(limit);
}


function _isObject(obj: any): obj is { [key: string]: any } {
    return typeof obj === "object" && obj !== null;
}