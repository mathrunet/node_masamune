import { Context } from "hono";
import { HttpError, WorkersAuthContext } from "@mathrunet/masamune_cloudflare";

/**
 * Default template of the per-user document that stores wallet and unlock fields.
 *
 * ウォレット・アンロックのフィールドを保存するユーザー別ドキュメントのデフォルトテンプレート。
 */
export const DEFAULT_USER_DOCUMENT_PATH = "plugins/iap/user/{userId}";

const USER_ID_PLACEHOLDER = "{userId}";
const FIELD_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const RESERVED_FIELD_KEYS = new Set(["transaction"]);
const RESERVED_SUBSCRIPTION_KEYS = new Set([
    "userId",
    "expired",
    "paused",
    "token",
    "platform",
    "productId",
    "purchaseId",
    "packageName",
    "expiredTime",
    "orderId",
    "path",
]);

/**
 * Return the authenticated user ID set by the auth adapter, or throw 401.
 *
 * 認証アダプターが設定した認証済みユーザーIDを返します。無ければ401を投げます。
 */
export function requireAuthenticatedUid(context: Context): string {
    const authentication = context.get("authentication") as WorkersAuthContext | undefined;
    const uid = authentication?.uid;
    if (typeof uid !== "string" || uid.length === 0) {
        throw new HttpError(401, "Authentication is required.");
    }
    return uid;
}

/**
 * Throw 403 when the request body specifies a user ID different from the authenticated one.
 *
 * リクエストボディが認証済みユーザーと異なるユーザーIDを指定している場合は403を投げます。
 */
export function assertUserIdMatches(uid: string, bodyUserId: unknown): void {
    if (bodyUserId === undefined || bodyUserId === null || bodyUserId === "") {
        return;
    }
    if (bodyUserId !== uid) {
        throw new HttpError(403, "userId does not match the authenticated user.");
    }
}

/**
 * Keep only client-provided extra fields that cannot override server-managed subscription fields.
 *
 * サーバー管理のサブスクリプションフィールドを上書きできない、クライアント提供の追加フィールドのみを残します。
 */
export function sanitizeAdditionalData(data: unknown): { [key: string]: any } {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return {};
    }
    const result: { [key: string]: any } = {};
    for (const [key, value] of Object.entries(data as { [key: string]: any })) {
        if (RESERVED_SUBSCRIPTION_KEYS.has(key) || key.startsWith("@")) {
            continue;
        }
        result[key] = value;
    }
    return result;
}

/**
 * Validate a client-supplied field path against the authenticated user's document template.
 *
 * The path must be `<template with {userId} replaced>/<fieldKey>`; nothing deeper, nothing outside.
 *
 * クライアントが指定したフィールドパスを、認証済みユーザーのドキュメントテンプレートに対して検証します。
 *
 * パスは`<{userId}を置換したテンプレート>/<fieldKey>`でなければならず、それより深い階層や外側は許可しません。
 */
export function resolveUserFieldPath(
    path: unknown,
    uid: string,
    template: string = DEFAULT_USER_DOCUMENT_PATH,
): { documentPath: string, fieldKey: string } {
    if (!template.includes(USER_ID_PLACEHOLDER)) {
        throw new HttpError(500, "User document path template must contain {userId}.");
    }
    if (typeof path !== "string" || path.length === 0) {
        throw new HttpError(400, "The required parameters are not set. path is empty.");
    }
    const expected = template.split(USER_ID_PLACEHOLDER).join(uid).split("/").filter((segment) => segment.length > 0);
    const segments = path.split("/").filter((segment) => segment.length > 0);
    if (segments.length !== expected.length + 1) {
        throw new HttpError(403, "path is outside the authenticated user's document.");
    }
    for (let i = 0; i < expected.length; i++) {
        if (segments[i] !== expected[i]) {
            throw new HttpError(403, "path is outside the authenticated user's document.");
        }
    }
    const fieldKey = segments[segments.length - 1];
    if (!FIELD_KEY_PATTERN.test(fieldKey) || RESERVED_FIELD_KEYS.has(fieldKey) || fieldKey.startsWith("@")) {
        throw new HttpError(403, "path is outside the authenticated user's document.");
    }
    return { documentPath: expected.join("/"), fieldKey };
}

/**
 * Rethrow [HttpError] as-is and wrap anything else as a 500.
 *
 * [HttpError]はそのまま再送出し、それ以外は500でラップします。
 */
export function rethrowAsHttpError(err: unknown): never {
    if (err instanceof HttpError) {
        throw err;
    }
    console.error(err);
    throw new HttpError(500, "Unknown error.");
}
