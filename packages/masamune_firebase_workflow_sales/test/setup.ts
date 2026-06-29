/**
 * Jest test setup.
 */
import * as dotenv from "dotenv";
import * as path from "path";
import * as admin from "firebase-admin";
import "@mathrunet/masamune";

// Project root directory
const projectRoot = path.resolve(__dirname, "..");

// Load environment variables from test/.env file
dotenv.config({ path: path.resolve(__dirname, ".env") });

// Set GOOGLE_APPLICATION_CREDENTIALS from service account path if available
const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
if (serviceAccountPath && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Resolve relative paths from test directory
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, serviceAccountPath);
}

// Initialize Firebase Admin
if (admin.apps.length === 0) {
    const resolvedServiceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
        || (serviceAccountPath ? path.resolve(__dirname, serviceAccountPath) : null);

    if (resolvedServiceAccountPath) {
        admin.initializeApp({
            credential: admin.credential.cert(resolvedServiceAccountPath),
        });
        console.log("Firebase Admin initialized with service account");
    } else {
        console.warn("No service account path configured. Firebase tests may fail.");
    }
}
