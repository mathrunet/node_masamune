import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions, firestoreLoader, storageLoader } from "@mathrunet/masamune";
import { Asset } from "../lib/interfaces";

/**
 * Get asset data and return signed URL if necessary.
 * 
 * アセットデータを取得し、必要であれば署名付きURLを返します。
 * 
 * @param process.env.STORAGE_BUCKET_ID
 * The ID of the storage bucket.
 * 
 * StorageのバケットID。
 * 
 * @param options.firestoreDatabaseIds
 * The IDs of the Firestore databases.
 * 
 * FirestoreのデータベースID。
 * 
 * @param query.data.id
 * The ID of the asset.
 * 
 * アセットのID。
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
            const firestoreInstance = firestoreLoader(
                options.firestoreDatabaseIds?.[0] ?? "",
            );
            const storageInstance = storageLoader(
                process.env.STORAGE_BUCKET_ID ?? "",
            );
            const assetId = query.data.id;
            if (!assetId) {
                throw new functions.https.HttpsError(
                    "invalid-argument", "The id is not set.",
                );
            }
            const asset = await firestoreInstance.collection("plugins/workflow/asset").doc(assetId).get();
            if (!asset.exists) {
                throw new functions.https.HttpsError("not-found", "The asset is not found.");
            }
            const assetData = asset.data() as Asset;
            const path = assetData.path;
            if (!path) {
                return assetData;
            }
            const file = storageInstance.file(path);
            const signedUrl = await file.getSignedUrl({
                version: "v4",
                action: 'read',
                expires: Date.now() + 1000 * 60 * 60 * 1,
            });
            return {
                ...assetData,
                "signedUri": signedUrl,
            };
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
