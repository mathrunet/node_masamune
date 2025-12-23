/**
 * Jest test setup.
 * テスト用のセットアップ。
 */
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Project root directory
const projectRoot = path.resolve(__dirname, "..");

// Load environment variables from test/.env file
dotenv.config({ path: path.resolve(__dirname, ".env") });

// Set GOOGLE_APPLICATION_CREDENTIALS from service account path if available
const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
if (serviceAccountPath && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Resolve relative paths from test directory
    const absolutePath = path.isAbsolute(serviceAccountPath)
        ? serviceAccountPath
        : path.resolve(__dirname, serviceAccountPath);

    if (fs.existsSync(absolutePath)) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = absolutePath;
    } else {
        console.warn(`Service account file not found: ${absolutePath}`);
    }
}

// Ensure test/tmp directory exists
const tmpDir = path.resolve(__dirname, "tmp");
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
}
