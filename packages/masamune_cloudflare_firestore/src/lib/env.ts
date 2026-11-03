import { HttpError, parseGoogleServiceAccount } from "@mathrunet/masamune_cloudflare";
import { FirestoreDatabaseAdapter } from "./adapter";
import { FirestoreRestClient, FirestoreRestClientOptions } from "./client";

/**
 * Worker environment variables used by [createFirestoreClient].
 */
export interface FirestoreEnvironment {
    /**
     * Service account JSON string (Worker secret).
     */
    GOOGLE_SERVICE_ACCOUNT?: string | undefined;

    /**
     * Firebase project ID (Worker var). Used when the service account does not contain `project_id`.
     */
    FIREBASE_PROJECT_ID?: string | undefined;

    /**
     * Firestore database ID (Worker var). Defaults to `(default)`.
     */
    FIRESTORE_DATABASE_ID?: string | undefined;
}

/**
 * Options for [createFirestoreClient].
 */
export type FirestoreEnvironmentOptions = Partial<FirestoreRestClientOptions>;

/**
 * Create a [FirestoreRestClient] from the Worker environment.
 *
 * - Service account: `options.serviceAccount` -> `env.GOOGLE_SERVICE_ACCOUNT`.
 * - Project ID: `options.projectId` -> `project_id` of the service account -> `env.FIREBASE_PROJECT_ID`.
 * - Database ID: `options.databaseId` -> `env.FIRESTORE_DATABASE_ID` -> `(default)`.
 *
 * Throws when the service account or the project ID is missing.
 */
export function createFirestoreClient(
    env: FirestoreEnvironment | undefined | null,
    options?: FirestoreEnvironmentOptions,
): FirestoreRestClient {
    const rawServiceAccount = options?.serviceAccount ?? env?.GOOGLE_SERVICE_ACCOUNT?.trim();
    if (!rawServiceAccount) {
        throw new HttpError(500, "GOOGLE_SERVICE_ACCOUNT is not set.");
    }
    const serviceAccount = typeof rawServiceAccount === "string"
        ? parseGoogleServiceAccount(rawServiceAccount)
        : rawServiceAccount;
    const projectId = nonEmpty(options?.projectId)
        ?? nonEmpty(serviceAccount.project_id)
        ?? nonEmpty(env?.FIREBASE_PROJECT_ID);
    if (!projectId) {
        throw new HttpError(500, "Firestore project ID is not found. Set FIREBASE_PROJECT_ID.");
    }
    return new FirestoreRestClient({
        ...options,
        serviceAccount,
        projectId,
        databaseId: nonEmpty(options?.databaseId) ?? nonEmpty(env?.FIRESTORE_DATABASE_ID),
    });
}

/**
 * Create a [FirestoreDatabaseAdapter] from the Worker environment.
 *
 * See [createFirestoreClient] for the resolution order.
 */
export function createFirestoreDatabaseAdapter(
    env: FirestoreEnvironment | undefined | null,
    options?: FirestoreEnvironmentOptions,
): FirestoreDatabaseAdapter {
    return new FirestoreDatabaseAdapter({ client: createFirestoreClient(env, options) });
}

function nonEmpty(value: string | undefined | null): string | undefined {
    if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
    }
    return undefined;
}
