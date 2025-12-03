#!/usr/bin/env ts-node
/**
 * List Test Data Script
 *
 * Lists all documents in the workflow collections to check what test data exists.
 */

import * as admin from "firebase-admin";
import * as path from "path";

const serviceAccountPath = path.resolve(__dirname, "../test/mathru-net-39425d37638c.json");

async function main(): Promise<void> {
    console.log("========================================");
    console.log("List Test Data Script");
    console.log("========================================\n");

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
            projectId: "mathru-net",
            storageBucket: "mathru-net.appspot.com",
        });
    }

    const firestore = admin.firestore();

    const collections = [
        "plugins/workflow/organization",
        "plugins/workflow/project",
        "plugins/workflow/task",
        "plugins/workflow/action",
    ];

    for (const collectionPath of collections) {
        console.log(`\n=== ${collectionPath} ===`);
        const snapshot = await firestore.collection(collectionPath).get();
        console.log(`Total documents: ${snapshot.size}`);

        // List test documents
        const testDocs = snapshot.docs.filter(doc => doc.id.startsWith("test-"));
        console.log(`Test documents (starting with 'test-'): ${testDocs.length}`);

        if (testDocs.length > 0 && testDocs.length <= 20) {
            testDocs.forEach(doc => {
                console.log(`  - ${doc.id}`);
            });
        } else if (testDocs.length > 20) {
            testDocs.slice(0, 20).forEach(doc => {
                console.log(`  - ${doc.id}`);
            });
            console.log(`  ... and ${testDocs.length - 20} more`);
        }

        // Check for subcollections on test docs
        for (const doc of testDocs.slice(0, 5)) {
            const subcollections = await doc.ref.listCollections();
            if (subcollections.length > 0) {
                console.log(`  ${doc.id} has subcollections: ${subcollections.map(s => s.id).join(", ")}`);
            }
        }
    }

    // Check Storage
    console.log("\n=== Storage (reports/) ===");
    const storage = admin.storage().bucket("mathru-net.appspot.com");
    const [files] = await storage.getFiles({ prefix: "reports/" });
    console.log(`Total files: ${files.length}`);
    const testFiles = files.filter((f: any) => {
        const parts = f.name.split("/");
        return parts.length >= 2 && parts[1].startsWith("test-");
    });
    console.log(`Test files: ${testFiles.length}`);
    if (testFiles.length > 0 && testFiles.length <= 10) {
        testFiles.forEach((f: any) => console.log(`  - ${f.name}`));
    }

    process.exit(0);
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
