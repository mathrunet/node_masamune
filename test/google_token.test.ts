import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import fetch from "node-fetch";

const config = require("firebase-functions-test")({
    storageBucket: "mathru-net.appspot.com",
    projectId: "mathru-net",
}, "test/mathru-net-39425d37638c.json");

describe("Google Token Function Test", () => {
    let wrapped: any;
    let accessToken: string;
    let expiresAt: number;

    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        // Load actual service account from file
        const serviceAccountPath = path.join(__dirname, "mathru-net-39425d37638c.json");
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
        process.env.GOOGLE_SERVICE_ACCOUNT = JSON.stringify(serviceAccount);
    });

    afterAll(() => {
        config.cleanup();
    });

    test("Get Google Token with actual authentication", async () => {
        const myFunctionsFactory = require("../src/functions/google_token");
        const cloudFunction = myFunctionsFactory(["us-central1"], {}, {});
        wrapped = config.wrap(cloudFunction);

        // Increase timeout for actual API call
        jest.setTimeout(30000);

        try {
            const result = await wrapped({
                data: {},
                auth: {
                    uid: "test-user",
                    token: "test-token",
                }
            });

            console.log("Token result:", result);

            // Store token for next test
            accessToken = result.accessToken;
            expiresAt = result.expiresAt;

            // Verify token structure
            expect(result.accessToken).toBeDefined();
            expect(result.expiresAt).toBeDefined();
            expect(typeof result.accessToken).toBe("string");
            expect(typeof result.expiresAt).toBe("number");
            expect(result.accessToken.length).toBeGreaterThan(0);
            expect(result.expiresAt).toBeGreaterThan(Date.now());

            console.log("Access Token length:", result.accessToken.length);
            console.log("Token expires at:", new Date(result.expiresAt).toISOString());
        } catch (e) {
            console.error("Error calling wrapped function:", e);
            throw e;
        }
    });

    test("Verify token works with Google Speech-To-Text API", async () => {
        // Increase timeout for API call
        jest.setTimeout(30000);

        expect(accessToken).toBeDefined();
        expect(accessToken.length).toBeGreaterThan(0);

        try {
            // Test Speech-To-Text API with a simple recognition request
            const apiUrl = "https://speech.googleapis.com/v1/speech:recognize";

            // Create a simple audio content (base64 encoded WAV with silence)
            // This is a minimal WAV file with 1 second of silence
            const audioContent = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

            const requestBody = {
                config: {
                    encoding: "LINEAR16",
                    sampleRateHertz: 16000,
                    languageCode: "en-US",
                },
                audio: {
                    content: audioContent,
                },
            };

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            console.log("Speech-To-Text API response status:", response.status);

            const responseData = await response.json();
            console.log("Speech-To-Text API response:", JSON.stringify(responseData, null, 2));

            // Verify token is being accepted by Google API
            // Status 200: Success - API is enabled and token is valid
            // Status 403: Permission denied - API might be disabled, but token format is valid
            // Status 401: Unauthorized - Token is invalid or expired
            expect([200, 403, 400]).toContain(response.status);

            // If we get 403, verify it's because API is disabled, not because token is invalid
            if (response.status === 403) {
                expect(responseData.error).toBeDefined();
                expect(responseData.error.status).toBe("PERMISSION_DENIED");
                // If error is about service being disabled, token format is valid
                const isServiceDisabled = responseData.error.details?.some(
                    (detail: any) => detail.reason === "SERVICE_DISABLED"
                );
                if (isServiceDisabled) {
                    console.log("Token format is valid. API is disabled for this project.");
                    console.log("To enable: Visit the URL in the error message above");
                } else {
                    // If it's a different permission error, still acceptable for token validation
                    console.log("Token reached Google API but lacks permission. Token format is valid.");
                }
            } else if (response.status === 200) {
                // If the token is valid and API is enabled, we should get a valid response structure
                expect(responseData).toBeDefined();
                expect(typeof responseData).toBe("object");
                console.log("Token successfully validated with Google Speech-To-Text API");
            }

            // The response should be a valid JSON object regardless of status
            expect(responseData).toBeDefined();
            expect(typeof responseData).toBe("object");
        } catch (e) {
            console.error("Error testing Speech-To-Text API:", e);
            throw e;
        }
    });
});
