import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions } from "../lib/src/functions_base";
import { GoogleAuth } from "google-auth-library";

/**
 * A function to get a Google Cloud Platform authentication token.
 * 
 * Google Cloud Platformの認証トークンを取得するためのFunction。
 * 
 * @param {string} process.env.FIRESTORE_SERVICE_ACCOUNT
 * Service account JSON.
 * 
 * サービスアカウントJSON。
 */
module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => functions.https.onCall(
    {
        region: options.region ?? regions,
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
        serviceAccount: options?.serviceAccount ?? undefined,
        enforceAppCheck: options.enforceAppCheck ?? undefined,
        consumeAppCheckToken: options.consumeAppCheckToken ?? undefined,
    },
    async (query) => {
        try {
            // Firebase Auth で認証チェック
            if (!query.auth) {
                throw new Error("Unauthenticated");
            }
            const serviceAccount = query.data.serviceAccount as string | null | undefined;
            if (!serviceAccount) {
                throw new Error("Service account is required");
            }

            const auth = new GoogleAuth({
                credentials: JSON.parse(serviceAccount),
                scopes: ["https://www.googleapis.com/auth/cloud-platform"],
            });
  
            const client = await auth.getClient();
            const token = await client.getAccessToken();
  
            return {
                accessToken: token.token,
                expiresAt: Date.now() + (token.res?.data.expires_in * 1000),
            };
        } catch (err) {
            console.error(err);
            if (err instanceof functions.https.HttpsError) {
                throw err;
            }
            throw new functions.https.HttpsError("internal", "An error occurred while processing the request.");
        }
    }
);
