import {
    GoogleServiceAccount,
    HttpError,
    parseGoogleServiceAccount,
} from "@mathrunet/masamune_cloudflare";
import { FirebaseStorageClient, FirebaseStorageClientOptions } from "./client";

/**
 * Worker environment variables used by [createFirebaseStorageClient].
 *
 * [createFirebaseStorageClient]が使用するWorkerの環境変数。
 */
export interface FirebaseStorageEnvironment {
    /**
     * Service account JSON string (Worker secret).
     *
     * サービスアカウントのJSON文字列（Workerのsecret）。
     */
    GOOGLE_SERVICE_ACCOUNT?: string | undefined;

    /**
     * Firebase project ID (Worker var). Used when the service account does not contain `project_id`.
     *
     * FirebaseのプロジェクトID（Workerのvar）。サービスアカウントに`project_id`がない場合に使用します。
     */
    FIREBASE_PROJECT_ID?: string | undefined;

    /**
     * Firebase Storage bucket name (Worker var). Defaults to `<project_id>.firebasestorage.app`.
     *
     * Firebase Storageのバケット名（Workerのvar）。デフォルトは`<project_id>.firebasestorage.app`。
     */
    FIREBASE_STORAGE_BUCKET?: string | undefined;
}

/**
 * Options for [createFirebaseStorageClient].
 *
 * [createFirebaseStorageClient]のオプション。
 */
export interface FirebaseStorageEnvironmentOptions
    extends Partial<Omit<FirebaseStorageClientOptions, "serviceAccount">> {
    /**
     * Service account (object or JSON string). Takes precedence over `GOOGLE_SERVICE_ACCOUNT`.
     *
     * サービスアカウント（オブジェクトまたはJSON文字列）。`GOOGLE_SERVICE_ACCOUNT`より優先されます。
     */
    serviceAccount?: GoogleServiceAccount | string | undefined;

    /**
     * Firebase project ID. Takes precedence over the service account and `FIREBASE_PROJECT_ID`.
     *
     * FirebaseのプロジェクトID。サービスアカウントと`FIREBASE_PROJECT_ID`より優先されます。
     */
    projectId?: string | undefined;
}

/**
 * Create a [FirebaseStorageClient] from the Worker environment.
 *
 * - Service account: `options.serviceAccount` -> `env.GOOGLE_SERVICE_ACCOUNT`.
 * - Bucket: `options.bucket` -> `env.FIREBASE_STORAGE_BUCKET` -> `<project_id>.firebasestorage.app`.
 * - Project ID: `options.projectId` -> `project_id` of the service account -> `env.FIREBASE_PROJECT_ID`.
 *
 * Throws when the service account or the bucket cannot be resolved.
 *
 * Workerの環境変数から[FirebaseStorageClient]を作成します。
 */
export function createFirebaseStorageClient(
    env: FirebaseStorageEnvironment | undefined | null,
    options?: FirebaseStorageEnvironmentOptions,
): FirebaseStorageClient {
    const rawServiceAccount = options?.serviceAccount ?? env?.GOOGLE_SERVICE_ACCOUNT?.trim();
    if (!rawServiceAccount) {
        throw new HttpError(500, "GOOGLE_SERVICE_ACCOUNT is not set.");
    }
    const serviceAccount = typeof rawServiceAccount === "string"
        ? parseGoogleServiceAccount(rawServiceAccount)
        : rawServiceAccount;
    const bucket = nonEmpty(options?.bucket) ?? nonEmpty(env?.FIREBASE_STORAGE_BUCKET);
    const projectId = nonEmpty(options?.projectId)
        ?? nonEmpty(serviceAccount.project_id)
        ?? nonEmpty(env?.FIREBASE_PROJECT_ID);
    const resolvedBucket = bucket ?? (projectId ? `${projectId}.firebasestorage.app` : undefined);
    if (!resolvedBucket) {
        throw new HttpError(
            500,
            "Firebase Storage bucket is not found. Set FIREBASE_STORAGE_BUCKET or FIREBASE_PROJECT_ID.",
        );
    }
    return new FirebaseStorageClient({
        ...options,
        serviceAccount,
        bucket: resolvedBucket,
    });
}

function nonEmpty(value: string | undefined | null): string | undefined {
    if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
    }
    return undefined;
}
