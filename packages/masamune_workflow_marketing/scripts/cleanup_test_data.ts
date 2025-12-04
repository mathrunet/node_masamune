#!/usr/bin/env ts-node
/**
 * Cleanup Test Data Script
 *
 * Deletes all test data from Firestore and Storage.
 * This includes:
 * - All documents with IDs starting with 'test-' in workflow collections
 * - All subcollections (like 'usage') under those documents
 * - All Storage files under reports/test-*
 *
 * Usage:
 *   npx ts-node scripts/cleanup_test_data.ts
 *
 * Or add to package.json scripts:
 *   "cleanup": "ts-node scripts/cleanup_test_data.ts"
 */

import * as admin from "firebase-admin";
import * as path from "path";

// Service account path
const serviceAccountPath = path.resolve(__dirname, "../test/mathru-net-39425d37638c.json");

/**
 * Recursively delete all documents in a collection.
 */
async function deleteCollection(
    firestore: admin.firestore.Firestore,
    collectionPath: string,
    batchSize: number = 100
): Promise<number> {
    const collectionRef = firestore.collection(collectionPath);
    let deletedCount = 0;

    let query = collectionRef.limit(batchSize);
    let snapshot = await query.get();

    while (!snapshot.empty) {
        const batch = firestore.batch();

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
            batch.delete(doc.ref);
        }

        await batch.commit();
        deletedCount += snapshot.size;
        snapshot = await query.get();
    }

    return deletedCount;
}

/**
 * Delete test documents from a collection (IDs starting with 'test-').
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
            console.log(`    Deleting subcollection: ${subPath}`);
            const subDeleted = await deleteCollection(firestore, subPath);
            console.log(`      Deleted ${subDeleted} documents`);
            deletedCount += subDeleted;
        }

        // Then delete the document itself
        await doc.ref.delete();
        console.log(`    Deleted document: ${doc.id}`);
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
        // Get parent document path
        const parentPath = doc.ref.parent.parent?.path;
        if (parentPath && parentPath.startsWith(prefix.slice(0, -1))) {
            parentPaths.add(parentPath);
        }

        // Delete the document
        await doc.ref.delete();
        deletedCount++;
        console.log(`    Deleted: ${doc.ref.path}`);
    }

    // Try to delete parent documents (they might be virtual)
    for (const parentPath of parentPaths) {
        try {
            await firestore.doc(parentPath).delete();
            console.log(`    Deleted parent: ${parentPath}`);
        } catch (e) {
            // Ignore errors (parent might not exist)
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
        const [files] = await bucket.getFiles({ prefix: "reports/" });

        const testFiles = files.filter((file: any) => {
            const parts = file.name.split("/");
            return parts.length >= 2 && parts[1].startsWith("test-");
        });

        if (testFiles.length === 0) {
            console.log("  No test files found in Storage (reports)");
            return 0;
        }

        console.log(`  Found ${testFiles.length} test files in Storage (reports)`);

        for (const file of testFiles) {
            await file.delete();
            console.log(`    Deleted: ${file.name}`);
            deletedCount++;
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
        const [files] = await bucket.getFiles({ prefix: "assets/" });

        const testFiles = files.filter((file: any) => {
            const parts = file.name.split("/");
            // Path format: assets/{projectId}/github_analysis.json
            return parts.length >= 2 && parts[1].startsWith("test-");
        });

        if (testFiles.length === 0) {
            console.log("  No test files found in Storage (assets)");
            return 0;
        }

        console.log(`  Found ${testFiles.length} test files in Storage (assets)`);

        for (const file of testFiles) {
            await file.delete();
            console.log(`    Deleted: ${file.name}`);
            deletedCount++;
        }
    } catch (error: any) {
        console.warn(`  Warning: Could not delete GitHub analysis files: ${error.message}`);
    }

    return deletedCount;
}

/**
 * Main cleanup function.
 */
async function main(): Promise<void> {
    console.log("========================================");
    console.log("Test Data Cleanup Script");
    console.log("========================================\n");

    // Initialize Firebase Admin
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

    // Collections to clean up (in order of dependency)
    const collections = [
        "plugins/workflow/action",
        "plugins/workflow/task",
        "plugins/workflow/project",
        "plugins/workflow/organization",
    ];

    // Clean up Firestore test documents
    console.log("Cleaning up Firestore test documents...\n");
    for (const collectionPath of collections) {
        console.log(`Processing: ${collectionPath}`);
        const deleted = await deleteTestDocuments(firestore, collectionPath);
        console.log(`  Total deleted: ${deleted}\n`);
        totalDeleted += deleted;
    }

    // Clean up orphaned subcollections (usage under organization)
    console.log("Cleaning up orphaned subcollections...\n");
    console.log("Processing: plugins/workflow/organization/*/usage");
    const orphanedUsageDeleted = await deleteOrphanedTestSubcollections(
        firestore,
        "plugins/workflow/organization",
        "usage"
    );
    console.log(`  Total deleted: ${orphanedUsageDeleted}\n`);
    totalDeleted += orphanedUsageDeleted;

    // Clean up Storage test files (reports)
    console.log("Cleaning up Storage test files (reports)...");
    const storageDeleted = await deleteTestStorageFiles(storage);
    console.log(`  Total deleted: ${storageDeleted}\n`);
    totalDeleted += storageDeleted;

    // Clean up Storage test files (GitHub analysis)
    console.log("Cleaning up Storage test files (assets)...");
    const githubAnalysisDeleted = await deleteTestGitHubAnalysisFiles(storage);
    console.log(`  Total deleted: ${githubAnalysisDeleted}\n`);
    totalDeleted += githubAnalysisDeleted;

    console.log("========================================");
    console.log(`Cleanup Complete! Total deleted: ${totalDeleted} items`);
    console.log("========================================\n");

    // Exit
    process.exit(0);
}

// Run the script
main().catch((error) => {
    console.error("Cleanup failed:", error);
    process.exit(1);
});
