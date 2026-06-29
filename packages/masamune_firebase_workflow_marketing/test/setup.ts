/**
 * Jest test setup.
 */
import * as dotenv from "dotenv";
import * as path from "path";

// Project root directory
const projectRoot = path.resolve(__dirname, "..");

// Load environment variables from test/.env file
dotenv.config({ path: path.resolve(__dirname, ".env") });

// Set GOOGLE_APPLICATION_CREDENTIALS from service account path if available
const serviceAccountPath = process.env.VERTEXAI_SERVICE_ACCOUNT_PATH
    || process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
if (serviceAccountPath && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Resolve relative paths from project root
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(projectRoot, serviceAccountPath);
}
