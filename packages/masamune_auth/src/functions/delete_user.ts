import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions } from "@mathrunet/masamune";
import * as admin from "firebase-admin";

/**
 * Make sure to delete the FirebaseAuthentication user.
 * 
 * FirebaseAuthenticationのユーザーを削除するようにします。
 * 
 * @param userId
 * The ID of the user to be deleted.
 * 
 * 削除するユーザーのID。
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
            const userId = query.data.userId as string | undefined;
            if (!userId) {
                throw new functions.https.HttpsError("invalid-argument", "No user ID specified in `userId`.");
            }
            const authInstance = admin.auth();
            await authInstance.deleteUser(userId);
            return {
                success: true,
            };
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
);
