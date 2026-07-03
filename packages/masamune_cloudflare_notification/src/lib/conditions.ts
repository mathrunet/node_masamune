import { DatabaseAdapterBase } from "@mathrunet/masamune_cloudflare";

/**
 * Check if the document data matches all conditions.
 *
 * Values in the form of `ModelRefBase` (objects with an `@ref` string) are resolved recursively through [database].
 *
 * ドキュメントデータがすべての条件に一致するかどうかを確認します。
 *
 * `ModelRefBase`形式の値（`@ref`文字列を持つオブジェクト）は[database]を通じて再帰的に解決されます。
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
 * @param database
 * Database adapter used to resolve document references.
 *
 * ドキュメント参照を解決するためのデータベースアダプター。
 *
 * @returns
 * Returns true if all conditions match, false otherwise.
 *
 * 全ての条件が一致する場合はtrue、それ以外はfalseを返します。
 */
export async function hasMatch({
    data,
    conditions,
    database,
}: {
    data: { [key: string]: any },
    conditions: { [key: string]: any }[] | undefined,
    database?: DatabaseAdapterBase | undefined,
}): Promise<boolean> {
    if (!conditions) {
        return true;
    }
    for (const c of conditions) {
        const type = c["type"] as string | undefined | null;
        const key = c["key"] as string | undefined | null;
        const value = c["value"] as any;
        if (key === undefined || key === null) {
            continue;
        }
        const source = data[key];
        const ref = _refPath(source);
        if (ref && database) {
            const doc = await database.getDocument(ref);
            if (doc) {
                const refData = doc.data;
                console.log(`Reference data ${JSON.stringify(refData)}`);
                if (Array.isArray(value)) {
                    const res = await hasMatch({ data: refData, conditions: value, database });
                    if (!res) {
                        return false;
                    }
                    continue;
                } else if (_isObject(value)) {
                    const res = await hasMatch({ data: refData, conditions: [value as { [key: string]: any }], database });
                    if (!res) {
                        return false;
                    }
                    continue;
                }
            }
        }
        if (type === undefined || type === null) {
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
                if (!source.some((v) => value.includes(v))) {
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

/**
 * Get the value of the specified field from the document data.
 *
 * Values in the form of `ModelRefBase` (objects with an `@ref` string) are resolved recursively through [database].
 *
 * ドキュメントデータから指定されたフィールドの値を取得します。
 *
 * `ModelRefBase`形式の値（`@ref`文字列を持つオブジェクト）は[database]を通じて再帰的に解決されます。
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
 * @param database
 * Database adapter used to resolve document references.
 *
 * ドキュメント参照を解決するためのデータベースアダプター。
 *
 * @returns
 * Returns the value of the specified field.
 *
 * 指定されたフィールドの値を返します。
 */
export async function get({
    data,
    field,
    database,
}: {
    data: { [key: string]: any },
    field: { [key: string]: any } | string,
    database?: DatabaseAdapterBase | undefined,
}): Promise<any> {
    if (typeof field === "string") {
        return data[field];
    }
    const key = field["key"];
    const source = data[key];
    const ref = _refPath(source);
    if (ref && database) {
        const doc = await database.getDocument(ref);
        if (doc) {
            return get({ data: doc.data, field: field["value"], database });
        }
    }
    return source;
}

function _refPath(source: any): string | null {
    if (!_isObject(source)) {
        return null;
    }
    const ref = (source as { [key: string]: any })["@ref"];
    if (typeof ref === "string" && ref.length > 0) {
        return ref;
    }
    return null;
}

function _isObject(obj: any): obj is { [key: string]: any } {
    return typeof obj === "object" && obj !== null;
}
