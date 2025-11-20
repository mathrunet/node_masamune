import * as functions from "firebase-functions/v2";
import { SchedulerFunctionsOptions } from "../lib/src/functions_base";
import { firestoreLoader } from "../lib/src/firebase_loader";
import * as admin from "firebase-admin";

/**
 * Periodically check and start asset creation.
 * 
 * 定期的にアセット作成をチェックし開始します。
 */
module.exports = (
    regions: string[],
    options: SchedulerFunctionsOptions,
    data: { [key: string]: any }
) => functions.scheduler.onSchedule(
    {
        schedule: options.schedule ?? "every 1 hours",
        region: options.region ?? regions[0],
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
        serviceAccount: options.serviceAccount ?? undefined,
    },
    async (event) => {
        try {
            const firestoreDatabaseIds = options.firestoreDatabaseIds ?? ["(default)"];
            for (const databaseId of firestoreDatabaseIds) {
                try {
                    const firestoreInstance = firestoreLoader(databaseId);
                    // Example logic: Find channels that haven't had assets created in a while
                    // This is a placeholder implementation.
                    // In a real scenario, you would query a 'channels' collection.

                    console.log(`Checking for asset creation tasks in database: ${databaseId || "(default)"}`);

                    // Placeholder: Query for pending requests that might have been missed
                    const requestsRef = firestoreInstance.collection("plugins/asset/request");
                    const snapshot = await requestsRef.where("status", "==", "pending").limit(10).get();

                    if (snapshot.empty) {
                        console.log("No pending asset creation requests found.");
                        continue;
                    }

                    for (const doc of snapshot.docs) {
                        console.log(`Processing pending request: ${doc.id}`);
                        // TODO: Trigger the broad research function here

                        // Mark as processing to avoid double processing
                        await doc.ref.update({
                            status: "processing",
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    }

                } catch (err) {
                    console.error(`Error processing database ${databaseId}:`, err);
                }
            }
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
