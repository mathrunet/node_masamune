import * as admin from "firebase-admin";

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
        const value = w["key"] as any;
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
        const value = c["key"] as any;
        if (type === undefined || key === undefined || type === null || key === null) {
            continue;
        }
        const source = data[key];
        if (source instanceof admin.firestore.DocumentReference && _isObject(value)) {
            const doc = await source.get();
            const data = doc.data() as { [key: string]: any };
            const res = await hasMatch({ data, conditions: [value as { [key: string]: any }] });
            if (!res) {
                return false;
            }
            continue;
        }
        switch (type) {
            case "equalTo":
                if (value === undefined || value === null) {
                    continue;
                }
                if (source !== value) {
                    return false;
                }
                break;
            case "notEqualTo":
                if (value === undefined || value === null) {
                    continue;
                }
                if (source === value) {
                    return false;
                }
                break;            
            case "lessThan":
                if (value === undefined || value === null || typeof source !== "number" || typeof value !== "number") {
                    continue;
                }
                if (source >= value) {
                    return false;
                }
                break;
            case "greaterThan":
                if (value === undefined || value === null || typeof source !== "number" || typeof value !== "number") {
                    continue;
                }
                if (source <= value) {
                    return false;
                }
                break;
            case "lessThanOrEqualTo":
                if (value === undefined || value === null || typeof source !== "number" || typeof value !== "number") {
                    continue;
                }
                if (source > value) {
                    return false;
                }
                break;
            case "greaterThanOrEqualTo":
                if (value === undefined || value === null || typeof source !== "number" || typeof value !== "number") {
                    continue;
                }
                if (source < value) {
                    return false;
                }
                break;
            case "arrayContains":
                if (value === undefined || value === null || !Array.isArray(source)) {
                    continue;
                }
                if (!source.includes(value)) {
                    return false;
                }
                break;
            case "arrayContainsAny":
                if (value === undefined || value === null || !Array.isArray(source) || !Array.isArray(value)) {
                    continue;
                }
                if (!source.some(v => value.includes(v))) {
                    return false;
                }
                break;
            case "whereIn":
                if (value === undefined || value === null || !Array.isArray(value)) {
                    continue;
                }
                if (!value.includes(source)) {
                    return false;
                }
                break;
            case "whereNotIn":
                if (value === undefined || value === null || !Array.isArray(value)) {
                    continue;
                }
                if (value.includes(source)) {
                    return false;
                }
                break;
            case "isNull":
                if (source !== undefined && source !== null) {
                    return false;
                }
                break;
            case "isNotNull":
                if (!(source !== undefined && source !== null)) {
                    return false;
                }
                break;
            default:
                break;
        }

    }
    return true;
}

function _isObject(obj: any): obj is { [key: string]: any } {
    return typeof obj === "object" && obj !== null;
}