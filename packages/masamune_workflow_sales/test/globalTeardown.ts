/**
 * Jest Global Teardown
 *
 * Cleans up all test data from Firestore after all tests complete.
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as dotenv from "dotenv";
import "@mathrunet/masamune";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, ".env") });

// Service account path from environment variable
const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH
    ? path.resolve(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_PATH)
    : null;

/**
 * Delete test documents from a collection (those with IDs starting with 'test-' or 'googlePlay_').
 */
async function deleteTestDocuments(
    firestore: admin.firestore.Firestore,
    collectionPath: string,
    prefixes: string[] = ["test-"]
): Promise<number> {
    let deletedCount = 0;

    for (const prefix of prefixes) {
        const collectionRef = firestore.collection(collectionPath);
        const snapshot = await collectionRef
            .where(admin.firestore.FieldPath.documentId(), ">=", prefix)
            .where(admin.firestore.FieldPath.documentId(), "<", prefix + "\uf8ff")
            .get();

        if (snapshot.empty) {
            continue;
        }

        console.log(`  Found ${snapshot.size} ${prefix}* documents in ${collectionPath}`);

        for (const doc of snapshot.docs) {
            await doc.ref.delete();
            deletedCount++;
        }
    }

    return deletedCount;
}

/**
 * Main teardown function.
 */
export default async function globalTeardown(): Promise<void> {
    console.log("\n========================================");
    console.log("Global Teardown: Cleaning up test data...");
    console.log("========================================\n");

    if (!serviceAccountPath) {
        console.log("No service account path configured. Skipping cleanup.");
        return;
    }

    // Initialize Firebase Admin if not already initialized
    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
        });
    }

    const firestore = admin.firestore();
    let totalDeleted = 0;

    // Collections to clean up
    const collections = [
        { path: "plugins/workflow/action", prefixes: ["test-"] },
        { path: "plugins/workflow/task", prefixes: ["test-"] },
        { path: "plugins/workflow/address", prefixes: ["test-", "googlePlay_"] },
    ];

    // Clean up Firestore test documents
    console.log("Cleaning up Firestore test documents...");
    try {
        for (const { path, prefixes } of collections) {
            const deleted = await deleteTestDocuments(firestore, path, prefixes);
            if (deleted > 0) {
                console.log(`  Deleted ${deleted} documents from ${path}`);
            }
            totalDeleted += deleted;
        }
    } catch (error: any) {
        console.log(`Cleanup skipped due to permission error: ${error.message}`);
    }

    console.log("\n========================================");
    console.log(`Global Teardown: Total deleted: ${totalDeleted} items`);
    console.log("========================================\n");

    // Cleanup Firebase Admin
    await admin.app().delete();
}
