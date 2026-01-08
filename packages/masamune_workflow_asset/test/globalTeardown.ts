/**
 * Jest global teardown.
 * Cleans up test files from Firebase Storage after tests complete.
 * テスト完了後にFirebase Storageのテストファイルをクリーンアップ。
 */
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, ".env") });

// Set GOOGLE_APPLICATION_CREDENTIALS
const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
if (serviceAccountPath && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const absolutePath = path.isAbsolute(serviceAccountPath)
        ? serviceAccountPath
        : path.resolve(__dirname, serviceAccountPath);

    if (fs.existsSync(absolutePath)) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = absolutePath;
    }
}

/**
 * Global teardown function called after all tests complete.
 */
export default async function globalTeardown(): Promise<void> {
    console.log("\n[GlobalTeardown] Starting cleanup...");

    try {
        // Initialize Firebase Admin if not already initialized
        if (!admin.apps.length) {
            admin.initializeApp();
        }

        const storage = admin.storage();
        const bucketName = process.env.STORAGE_BUCKET ||
            `${process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT_ID}.appspot.com`;
        const bucket = storage.bucket(bucketName);

        // Delete test-generated image files
        const imagePrefix = "test-generated-images/";
        const [imageFiles] = await bucket.getFiles({ prefix: imagePrefix });

        if (imageFiles.length > 0) {
            console.log(`[GlobalTeardown] Deleting ${imageFiles.length} test image files from Storage...`);
            await Promise.all(imageFiles.map((file) => file.delete().catch(() => { })));
            console.log(`[GlobalTeardown] Deleted ${imageFiles.length} test image files`);
        } else {
            console.log("[GlobalTeardown] No test image files to clean up");
        }

        // Delete test-generated audio files
        const audioPrefix = "test-generated-audio/";
        const [audioFiles] = await bucket.getFiles({ prefix: audioPrefix });

        if (audioFiles.length > 0) {
            console.log(`[GlobalTeardown] Deleting ${audioFiles.length} test audio files from Storage...`);
            await Promise.all(audioFiles.map((file) => file.delete().catch(() => { })));
            console.log(`[GlobalTeardown] Deleted ${audioFiles.length} test audio files`);
        } else {
            console.log("[GlobalTeardown] No test audio files to clean up");
        }
    } catch (error: any) {
        // Don't fail tests if cleanup fails
        console.warn(`[GlobalTeardown] Cleanup warning: ${error.message}`);
    }

    console.log("[GlobalTeardown] Cleanup complete\n");
}
