import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions, firestoreLoader } from "@mathrunet/masamune";
import * as admin from "firebase-admin";

/**
 * Start the asset creation process.
 * 
 * アセット作成プロセスを開始します。
 * 
 * @param channelTheme
 * Theme of the channel.
 * 
 * チャンネルのテーマ。
 * 
 * @param assets
 * Assets to be used.
 * 
 * 使用するアセット。
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
            const channelTheme = query.data.channelTheme as string | undefined;
            const assets = query.data.assets as { [key: string]: any } | undefined;
            const databaseId = query.data.databaseId as string | undefined;

            if (!channelTheme) {
                throw new functions.https.HttpsError("invalid-argument", "No channel theme specified in `channelTheme`.");
            }

            const firestoreInstance = firestoreLoader(databaseId);
            const collectionPath = "plugins/asset/request";

            const docRef = firestoreInstance.collection(collectionPath).doc();
            await docRef.set({
                channelTheme: channelTheme,
                assets: assets ?? {},
                status: "pending",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // TODO: Trigger the next step (e.g., broad research) or set a flag for the scheduler.
            // For now, we just acknowledge the request.

            return {
                success: true,
                requestId: docRef.id,
            };
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
