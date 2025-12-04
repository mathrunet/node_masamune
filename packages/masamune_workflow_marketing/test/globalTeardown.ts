/**
 * Jest Global Teardown
 *
 * Cleans up all test data from Firestore and Storage after all tests complete.
 * This ensures no orphaned test data remains in the database.
 */

import * as admin from "firebase-admin";
import * as path from "path";

// Service account path for authentication
// Note: __dirname in Jest globalTeardown refers to test/ directory
const serviceAccountPath = path.resolve(__dirname, "mathru-net-39425d37638c.json");

/**
 * Recursively delete all documents in a collection and their subcollections.
 */
async function deleteCollection(
    firestore: admin.firestore.Firestore,
    collectionPath: string,
    batchSize: number = 100
): Promise<number> {
    const collectionRef = firestore.collection(collectionPath);
    let deletedCount = 0;

    // Process in batches to avoid memory issues
    let query = collectionRef.limit(batchSize);
    let snapshot = await query.get();

    while (!snapshot.empty) {
        const batch = firestore.batch();
        const docsToDelete: admin.firestore.DocumentSnapshot[] = [];

        for (const doc of snapshot.docs) {
            // First, recursively delete subcollections
            const subcollections = await doc.ref.listCollections();
            for (const subcollection of subcollections) {
                deletedCount += await deleteCollection(
                    firestore,
                    `${collectionPath}/${doc.id}/${subcollection.id}`,
                    batchSize
                );
            }
            docsToDelete.push(doc);
            batch.delete(doc.ref);
        }

        await batch.commit();
        deletedCount += docsToDelete.length;

        // Get next batch
        snapshot = await query.get();
    }

    return deletedCount;
}

/**
 * Delete test documents from a collection (those with IDs starting with 'test-').
 */
async function deleteTestDocuments(
    firestore: admin.firestore.Firestore,
    collectionPath: string
): Promise<number> {
    const collectionRef = firestore.collection(collectionPath);
    let deletedCount = 0;

    // Query documents with IDs starting with 'test-'
    const snapshot = await collectionRef
        .where(admin.firestore.FieldPath.documentId(), ">=", "test-")
        .where(admin.firestore.FieldPath.documentId(), "<", "test-\uf8ff")
        .get();

    if (snapshot.empty) {
        return 0;
    }

    console.log(`  Found ${snapshot.size} test documents in ${collectionPath}`);

    for (const doc of snapshot.docs) {
        // First, recursively delete subcollections
        const subcollections = await doc.ref.listCollections();
        for (const subcollection of subcollections) {
            const subPath = `${collectionPath}/${doc.id}/${subcollection.id}`;
            const subDeleted = await deleteCollection(firestore, subPath);
            console.log(`    Deleted ${subDeleted} documents from subcollection: ${subPath}`);
            deletedCount += subDeleted;
        }

        // Then delete the document itself
        await doc.ref.delete();
        deletedCount++;
    }

    return deletedCount;
}

/**
 * Delete orphaned subcollections under test documents.
 * This handles the case where parent documents don't exist but subcollections do.
 */
async function deleteOrphanedTestSubcollections(
    firestore: admin.firestore.Firestore,
    collectionPath: string,
    subcollectionName: string
): Promise<number> {
    let deletedCount = 0;

    // Query using collection group to find all subcollections with the given name
    const collectionGroup = firestore.collectionGroup(subcollectionName);
    const snapshot = await collectionGroup.get();

    if (snapshot.empty) {
        return 0;
    }

    // Filter to only those under test documents in the specified collection
    const prefix = `${collectionPath}/test-`;
    const testDocs = snapshot.docs.filter(doc => doc.ref.path.startsWith(prefix));

    if (testDocs.length === 0) {
        return 0;
    }

    console.log(`  Found ${testDocs.length} orphaned ${subcollectionName} documents`);

    // Group by parent document to delete efficiently
    const parentPaths = new Set<string>();
    for (const doc of testDocs) {
        const parentPath = doc.ref.parent.parent?.path;
        if (parentPath && parentPath.startsWith(prefix.slice(0, -1))) {
            parentPaths.add(parentPath);
        }
        await doc.ref.delete();
        deletedCount++;
    }

    // Try to delete parent documents (they might be virtual)
    for (const parentPath of parentPaths) {
        try {
            await firestore.doc(parentPath).delete();
        } catch (e) {
            // Ignore errors
        }
    }

    return deletedCount;
}

/**
 * Delete test files from Storage (reports).
 */
async function deleteTestStorageFiles(bucket: any): Promise<number> {
    let deletedCount = 0;

    try {
        // List all files under reports/ prefix
        const [files] = await bucket.getFiles({ prefix: "reports/" });

        // Filter files that are in test task folders (test-*)
        const testFiles = files.filter((file: any) => {
            const parts = file.name.split("/");
            // Path format: reports/{taskId}/{timestamp}_marketing_report.pdf
            return parts.length >= 2 && parts[1].startsWith("test-");
        });

        if (testFiles.length === 0) {
            return 0;
        }

        console.log(`  Found ${testFiles.length} test files in Storage (reports)`);

        for (const file of testFiles) {
            await file.delete();
            deletedCount++;
            console.log(`    Deleted: ${file.name}`);
        }
    } catch (error: any) {
        console.warn(`  Warning: Could not delete Storage files: ${error.message}`);
    }

    return deletedCount;
}

/**
 * Delete test GitHub analysis files from Storage.
 * Path format: assets/{projectId}/github_analysis.json
 */
async function deleteTestGitHubAnalysisFiles(bucket: any): Promise<number> {
    let deletedCount = 0;

    try {
        // List all files under assets/ prefix
        const [files] = await bucket.getFiles({ prefix: "assets/" });

        // Filter files that are in test project folders (test-*)
        const testFiles = files.filter((file: any) => {
            const parts = file.name.split("/");
            // Path format: assets/{projectId}/github_analysis.json
            return parts.length >= 2 && parts[1].startsWith("test-");
        });

        if (testFiles.length === 0) {
            return 0;
        }

        console.log(`  Found ${testFiles.length} test files in Storage (assets)`);

        for (const file of testFiles) {
            await file.delete();
            deletedCount++;
            console.log(`    Deleted: ${file.name}`);
        }
    } catch (error: any) {
        console.warn(`  Warning: Could not delete GitHub analysis files: ${error.message}`);
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

    // Initialize Firebase Admin if not already initialized
    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
            projectId: "mathru-net",
            storageBucket: "mathru-net.appspot.com",
        });
    }

    const firestore = admin.firestore();
    const storage = admin.storage().bucket("mathru-net.appspot.com");

    let totalDeleted = 0;

    // Collections to clean up
    const collections = [
        "plugins/workflow/action",
        "plugins/workflow/task",
        "plugins/workflow/project",
        "plugins/workflow/organization",
    ];

    // Clean up Firestore test documents
    console.log("Cleaning up Firestore test documents...");
    for (const collectionPath of collections) {
        const deleted = await deleteTestDocuments(firestore, collectionPath);
        if (deleted > 0) {
            console.log(`  Deleted ${deleted} documents from ${collectionPath}`);
        }
        totalDeleted += deleted;
    }

    // Clean up orphaned subcollections (usage under organization)
    console.log("\nCleaning up orphaned subcollections...");
    const orphanedUsageDeleted = await deleteOrphanedTestSubcollections(
        firestore,
        "plugins/workflow/organization",
        "usage"
    );
    if (orphanedUsageDeleted > 0) {
        console.log(`  Deleted ${orphanedUsageDeleted} orphaned usage documents`);
    }
    totalDeleted += orphanedUsageDeleted;

    // Clean up Storage test files (reports)
    console.log("\nCleaning up Storage test files (reports)...");
    const storageDeleted = await deleteTestStorageFiles(storage);
    totalDeleted += storageDeleted;

    // Clean up Storage test files (GitHub analysis)
    console.log("\nCleaning up Storage test files (assets)...");
    const githubAnalysisDeleted = await deleteTestGitHubAnalysisFiles(storage);
    totalDeleted += githubAnalysisDeleted;

    console.log("\n========================================");
    console.log(`Global Teardown: Total deleted: ${totalDeleted} items`);
    console.log("========================================\n");

    // Cleanup Firebase Admin
    await admin.app().delete();
}
