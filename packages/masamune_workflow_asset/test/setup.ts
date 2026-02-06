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

// Test execution counter for progressive delays
let testExecutionCount = 0;

// Add delay helper for rate limiting with progressive delays
(global as any).delayForRateLimit = async (ms: number = 45000): Promise<void> => {
    // For mocked tests, use minimal delay
    const totalDelay = 100; // 100ms for mocked tests

    testExecutionCount++;

    return new Promise(resolve => setTimeout(resolve, totalDelay));
};

// Add delay helper for after successful requests
(global as any).delayAfterSuccess = async (ms: number = 30000): Promise<void> => {
    console.log(`✅ Request completed. Waiting ${ms / 1000}s before next operation...`);
    return new Promise(resolve => setTimeout(resolve, ms));
};

// Reset test counter
(global as any).resetTestCounter = (): void => {
    testExecutionCount = 0;
    console.log('🔄 Test counter reset');
};

// Declare global types
declare global {
    var delayForRateLimit: (ms?: number) => Promise<void>;
    var delayAfterSuccess: (ms?: number) => Promise<void>;
    var resetTestCounter: () => void;
}
