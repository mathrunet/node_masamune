import { DatabaseIncrement } from "@mathrunet/masamune_cloudflare";

/**
 * Firestore REST `Value` object.
 *
 * See https://firebase.google.com/docs/firestore/reference/rest/v1/Value
 */
export type FirestoreRestValue =
    | { nullValue: null }
    | { booleanValue: boolean }
    | { integerValue: string }
    | { doubleValue: number | string }
    | { timestampValue: string }
    | { stringValue: string }
    | { bytesValue: string }
    | { referenceValue: string }
    | { geoPointValue: { latitude?: number; longitude?: number } }
    | { arrayValue: { values?: FirestoreRestValue[] } }
    | { mapValue: { fields?: { [key: string]: FirestoreRestValue } } };

/**
 * Firestore REST field transform.
 */
export interface FirestoreRestFieldTransform {
    fieldPath: string;
    increment?: FirestoreRestValue;
    setToServerValue?: "REQUEST_TIME";
}

/**
 * Reference to another Firestore document.
 *
 * Encoded as `referenceValue`. `path` is relative to the database root
 * (e.g. `user/abc`).
 */
export class FirestoreReference {
    /**
     * Reference to another Firestore document.
     *
     * @param path
     * Document path relative to the database root (e.g. `user/abc`).
     */
    constructor(public readonly path: string) { }

    /**
     * Document ID (last path segment).
     */
    get id(): string {
        const segments = this.path.split("/");
        return segments[segments.length - 1] ?? "";
    }
}

/**
 * Geographic point. Encoded as `geoPointValue`.
 */
export class FirestoreGeoPoint {
    /**
     * Geographic point.
     *
     * @param latitude
     * Latitude in degrees (-90 to 90).
     *
     * @param longitude
     * Longitude in degrees (-180 to 180).
     */
    constructor(
        public readonly latitude: number,
        public readonly longitude: number,
    ) { }
}

/**
 * Timestamp with nanosecond precision.
 *
 * [Date] is also accepted when writing, but values are decoded as [Date]
 * unless `preciseTimestamps` is enabled on the client.
 */
export class FirestoreTimestamp {
    /**
     * Timestamp with nanosecond precision.
     *
     * @param seconds
     * Seconds since the Unix epoch.
     *
     * @param nanos
     * Non-negative fractions of a second at nanosecond resolution.
     */
    constructor(
        public readonly seconds: number,
        public readonly nanos: number,
    ) { }

    /**
     * Create a timestamp from a [Date].
     */
    static fromDate(date: Date): FirestoreTimestamp {
        const millis = date.getTime();
        const seconds = Math.floor(millis / 1000);
        return new FirestoreTimestamp(seconds, (millis - seconds * 1000) * 1000000);
    }

    /**
     * Parse an RFC 3339 timestamp string.
     */
    static fromRfc3339(value: string): FirestoreTimestamp {
        const match = /^(.*?)(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
        if (!match) {
            return FirestoreTimestamp.fromDate(new Date(value));
        }
        const base = Date.parse(`${match[1]}${match[3]}`);
        const fraction = (match[2] ?? "").padEnd(9, "0").substring(0, 9);
        return new FirestoreTimestamp(Math.floor(base / 1000), Number(fraction));
    }

    /**
     * Convert to a [Date] (millisecond precision).
     */
    toDate(): Date {
        return new Date(this.seconds * 1000 + Math.floor(this.nanos / 1000000));
    }

    /**
     * Convert to an RFC 3339 string with nanosecond precision.
     */
    toRfc3339(): string {
        const base = new Date(this.seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "");
        return `${base}.${String(this.nanos).padStart(9, "0")}Z`;
    }
}

/**
 * Sentinel values for field transforms and deletes.
 */
export class FirestoreFieldValue {
    private constructor(
        public readonly kind: "increment" | "serverTimestamp" | "delete",
        public readonly operand?: number | bigint,
    ) { }

    /**
     * Increment a numeric field by `value` (equivalent to `FieldValue.increment`).
     */
    static increment(value: number | bigint): FirestoreFieldValue {
        return new FirestoreFieldValue("increment", value);
    }

    /**
     * Set the field to the server request time (equivalent to `FieldValue.serverTimestamp`).
     */
    static serverTimestamp(): FirestoreFieldValue {
        return new FirestoreFieldValue("serverTimestamp");
    }

    /**
     * Delete the field. Only valid with `merge` / `updateMask` / `update` writes.
     */
    static delete(): FirestoreFieldValue {
        return new FirestoreFieldValue("delete");
    }
}

/**
 * Options for decoding values.
 */
export interface FirestoreDecodeOptions {
    /**
     * If `true`, `timestampValue` is decoded as [FirestoreTimestamp] instead of [Date].
     */
    preciseTimestamps?: boolean | undefined;
}

const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);
const minSafeInteger = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Encode a JavaScript value into a Firestore REST `Value`.
 *
 * - `null` / `undefined` -> `nullValue`
 * - `boolean` -> `booleanValue`
 * - integer `number` / `bigint` -> `integerValue`
 * - non-integer `number` (including NaN / Infinity) -> `doubleValue`
 * - [Date] / [FirestoreTimestamp] -> `timestampValue`
 * - `string` -> `stringValue`
 * - [Uint8Array] / [ArrayBuffer] -> `bytesValue` (base64)
 * - [FirestoreReference] -> `referenceValue`
 * - [FirestoreGeoPoint] -> `geoPointValue`
 * - `Array` -> `arrayValue`
 * - plain object -> `mapValue`
 *
 * Sentinels ([FirestoreFieldValue], [DatabaseIncrement]) cannot be encoded
 * as values; use [encodeFirestoreWriteFields] instead.
 *
 * @param value
 * Value to encode.
 *
 * @param documentRoot
 * Resource name of the database documents root
 * (`projects/{project}/databases/{database}/documents`). Required to encode [FirestoreReference].
 */
export function encodeFirestoreValue(value: unknown, documentRoot?: string): FirestoreRestValue {
    if (value === null || value === undefined) {
        return { nullValue: null };
    }
    if (typeof value === "boolean") {
        return { booleanValue: value };
    }
    if (typeof value === "bigint") {
        return { integerValue: value.toString() };
    }
    if (typeof value === "number") {
        if (Number.isInteger(value) && !Object.is(value, -0)) {
            return { integerValue: String(value) };
        }
        if (Number.isNaN(value)) {
            return { doubleValue: "NaN" };
        }
        if (value === Infinity) {
            return { doubleValue: "Infinity" };
        }
        if (value === -Infinity) {
            return { doubleValue: "-Infinity" };
        }
        return { doubleValue: value };
    }
    if (typeof value === "string") {
        return { stringValue: value };
    }
    if (value instanceof Date) {
        return { timestampValue: value.toISOString() };
    }
    if (value instanceof FirestoreTimestamp) {
        return { timestampValue: value.toRfc3339() };
    }
    if (value instanceof Uint8Array) {
        return { bytesValue: bytesToBase64(value) };
    }
    if (value instanceof ArrayBuffer) {
        return { bytesValue: bytesToBase64(new Uint8Array(value)) };
    }
    if (value instanceof FirestoreReference) {
        if (!documentRoot) {
            throw new Error("A document root is required to encode a FirestoreReference.");
        }
        return { referenceValue: `${documentRoot}/${trimSlashes(value.path)}` };
    }
    if (value instanceof FirestoreGeoPoint) {
        return { geoPointValue: { latitude: value.latitude, longitude: value.longitude } };
    }
    if (value instanceof FirestoreFieldValue || value instanceof DatabaseIncrement) {
        throw new Error("Field transforms cannot be used as values (e.g. inside arrays or query filters).");
    }
    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map((item) => encodeFirestoreValue(item, documentRoot)) } };
    }
    if (typeof value === "object") {
        return { mapValue: { fields: encodeFirestoreFields(value as { [key: string]: unknown }, documentRoot) } };
    }
    throw new Error(`Unsupported value type: ${typeof value}`);
}

/**
 * Encode a plain object into Firestore REST `fields`.
 */
export function encodeFirestoreFields(
    data: { [key: string]: unknown },
    documentRoot?: string,
): { [key: string]: FirestoreRestValue } {
    const fields: { [key: string]: FirestoreRestValue } = {};
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined) {
            continue;
        }
        fields[key] = encodeFirestoreValue(value, documentRoot);
    }
    return fields;
}

/**
 * Decode a Firestore REST `Value` into a JavaScript value.
 *
 * `integerValue` is decoded as `number` when it is within the safe integer
 * range, otherwise as `bigint`. `referenceValue` is decoded as
 * [FirestoreReference] with a path relative to the database root.
 */
export function decodeFirestoreValue(value: FirestoreRestValue | undefined, options?: FirestoreDecodeOptions): any {
    if (value === undefined || value === null) {
        return null;
    }
    const v = value as { [key: string]: any };
    if ("nullValue" in v) {
        return null;
    }
    if ("booleanValue" in v) {
        return Boolean(v.booleanValue);
    }
    if ("integerValue" in v) {
        const big = BigInt(v.integerValue);
        if (big <= maxSafeInteger && big >= minSafeInteger) {
            return Number(big);
        }
        return big;
    }
    if ("doubleValue" in v) {
        return Number(v.doubleValue);
    }
    if ("timestampValue" in v) {
        const timestamp = FirestoreTimestamp.fromRfc3339(String(v.timestampValue));
        return options?.preciseTimestamps ? timestamp : timestamp.toDate();
    }
    if ("stringValue" in v) {
        return String(v.stringValue);
    }
    if ("bytesValue" in v) {
        return base64ToBytes(String(v.bytesValue));
    }
    if ("referenceValue" in v) {
        return new FirestoreReference(referenceNameToPath(String(v.referenceValue)));
    }
    if ("geoPointValue" in v) {
        return new FirestoreGeoPoint(v.geoPointValue?.latitude ?? 0, v.geoPointValue?.longitude ?? 0);
    }
    if ("arrayValue" in v) {
        return ((v.arrayValue?.values ?? []) as FirestoreRestValue[]).map((item) => decodeFirestoreValue(item, options));
    }
    if ("mapValue" in v) {
        return decodeFirestoreFields(v.mapValue?.fields, options);
    }
    return null;
}

/**
 * Decode Firestore REST `fields` into a plain object.
 */
export function decodeFirestoreFields(
    fields: { [key: string]: FirestoreRestValue } | undefined,
    options?: FirestoreDecodeOptions,
): { [key: string]: any } {
    const data: { [key: string]: any } = {};
    for (const [key, value] of Object.entries(fields ?? {})) {
        data[key] = decodeFirestoreValue(value, options);
    }
    return data;
}

/**
 * Result of [encodeFirestoreWriteFields].
 */
export interface FirestoreEncodedWrite {
    /**
     * Encoded fields without sentinel values.
     */
    fields: { [key: string]: FirestoreRestValue };

    /**
     * Field transforms extracted from sentinel values.
     */
    transforms: FirestoreRestFieldTransform[];

    /**
     * Field paths of leaf values (used for `merge` writes). Includes deleted fields,
     * excludes transformed fields.
     */
    leafPaths: string[];

    /**
     * Field paths of fields marked with [FirestoreFieldValue.delete].
     */
    deletePaths: string[];
}

/**
 * Encode data for a write, extracting [FirestoreFieldValue] / [DatabaseIncrement]
 * sentinels (at any nesting level of plain objects) into field transforms.
 */
export function encodeFirestoreWriteFields(
    data: { [key: string]: unknown },
    documentRoot?: string,
): FirestoreEncodedWrite {
    const result: FirestoreEncodedWrite = {
        fields: {},
        transforms: [],
        leafPaths: [],
        deletePaths: [],
    };
    collectWriteFields(data, [], result.fields, result, documentRoot);
    return result;
}

function collectWriteFields(
    data: { [key: string]: unknown },
    parentPath: string[],
    target: { [key: string]: FirestoreRestValue },
    result: FirestoreEncodedWrite,
    documentRoot?: string,
): void {
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined) {
            continue;
        }
        const path = [...parentPath, key];
        const fieldPath = encodeFieldPath(path);
        if (value instanceof DatabaseIncrement) {
            result.transforms.push({ fieldPath, increment: encodeFirestoreValue(value.value) });
            continue;
        }
        if (value instanceof FirestoreFieldValue) {
            switch (value.kind) {
                case "increment":
                    result.transforms.push({ fieldPath, increment: encodeFirestoreValue(value.operand ?? 0) });
                    break;
                case "serverTimestamp":
                    result.transforms.push({ fieldPath, setToServerValue: "REQUEST_TIME" });
                    break;
                case "delete":
                    result.leafPaths.push(fieldPath);
                    result.deletePaths.push(fieldPath);
                    break;
            }
            continue;
        }
        if (isPlainObject(value) && Object.keys(value).length > 0) {
            const nested: { [key: string]: FirestoreRestValue } = {};
            collectWriteFields(value, path, nested, result, documentRoot);
            if (Object.keys(nested).length > 0) {
                target[key] = { mapValue: { fields: nested } };
            }
            continue;
        }
        target[key] = encodeFirestoreValue(value, documentRoot);
        result.leafPaths.push(fieldPath);
    }
}

/**
 * Check whether a value is a write sentinel ([FirestoreFieldValue] or [DatabaseIncrement]).
 */
export function isFirestoreSentinel(value: unknown): boolean {
    return value instanceof FirestoreFieldValue || value instanceof DatabaseIncrement;
}

/**
 * Encode field path segments into a Firestore field path string.
 *
 * Segments that are not simple identifiers are quoted with backticks.
 */
export function encodeFieldPath(segments: string[]): string {
    return segments.map((segment) => {
        if (/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(segment)) {
            return segment;
        }
        return `\`${segment.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
    }).join(".");
}

/**
 * Convert a key that may contain dots (`a.b.c`) into a quoted field path.
 *
 * Keys that are already quoted or `__name__` are returned unchanged.
 */
export function normalizeFieldPath(path: string): string {
    if (path === "__name__" || path.includes("`")) {
        return path;
    }
    return encodeFieldPath(path.split("."));
}

/**
 * Convert a full document resource name into a path relative to the database root.
 */
export function referenceNameToPath(name: string): string {
    const marker = "/documents/";
    const index = name.indexOf(marker);
    if (index < 0) {
        return trimSlashes(name);
    }
    return name.substring(index + marker.length);
}

/**
 * Trim leading and trailing slashes.
 */
export function trimSlashes(path: string): string {
    return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
    const normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
