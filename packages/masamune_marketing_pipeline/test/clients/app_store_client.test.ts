/**
 * App Store Connect API Client Tests
 *
 * TDD: Write tests first, then implement the client.
 *
 * Required environment variables in test/.env:
 * - APP_STORE_KEY_ID: API Key ID
 * - APP_STORE_ISSUER_ID: Issuer ID
 * - APP_STORE_PRIVATE_KEY_PATH: Path to .p8 private key file
 * - APP_STORE_APP_ID: App's Apple ID
 * - APP_STORE_VENDOR_NUMBER: Vendor number for sales reports
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load test environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

import { AppStoreClient } from "../../src/clients/app_store_client";
import { DateRange } from "../../src/models/marketing_data";

describe("AppStoreClient", () => {
    let client: AppStoreClient;
    const keyId = process.env.APP_STORE_KEY_ID || "";
    const issuerId = process.env.APP_STORE_ISSUER_ID || "";
    const privateKeyPath = process.env.APP_STORE_PRIVATE_KEY_PATH || "";
    const appId = process.env.APP_STORE_APP_ID || "";
    const vendorNumber = process.env.APP_STORE_VENDOR_NUMBER || "";

    // Date range for testing (last 7 days)
    const dateRange: DateRange = {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    };

    beforeAll(() => {
        if (!keyId || !issuerId || !privateKeyPath || !appId) {
            console.warn("Skipping App Store tests: Missing environment variables");
            return;
        }

        // Handle path resolution:
        // - Paths starting with "./" are relative to test/ directory
        // - Other paths are relative to project root
        const testDir = path.join(__dirname, "..");
        const projectRoot = path.join(__dirname, "..", "..");
        const absolutePrivateKeyPath = privateKeyPath.startsWith("./")
            ? path.join(testDir, privateKeyPath.substring(2))
            : path.join(projectRoot, privateKeyPath);

        client = new AppStoreClient({
            keyId: keyId,
            issuerId: issuerId,
            privateKeyPath: absolutePrivateKeyPath,
            appId: appId,
            vendorNumber: vendorNumber,
        });
    });

    describe("initialization", () => {
        it("should create client with valid config", () => {
            if (!keyId || !issuerId || !privateKeyPath || !appId) {
                return;
            }
            expect(client).toBeDefined();
        });

        it("should throw error with invalid private key path", () => {
            expect(() => {
                new AppStoreClient({
                    keyId: "TESTKEY123",
                    issuerId: "test-issuer-id",
                    privateKeyPath: "/nonexistent/path.p8",
                    appId: "123456789",
                });
            }).toThrow();
        });
    });

    describe("getAppInfo", () => {
        it("should fetch app basic information", async () => {
            if (!keyId || !issuerId || !privateKeyPath || !appId) {
                return;
            }

            const appInfo = await client.getAppInfo();

            expect(appInfo).toBeDefined();
            expect(appInfo.appId).toBe(appId);
            expect(appInfo.name).toBeDefined();
        }, 30000);
    });

    describe("getRatings", () => {
        it("should fetch app ratings", async () => {
            if (!keyId || !issuerId || !privateKeyPath || !appId) {
                return;
            }

            const ratings = await client.getRatings();

            expect(ratings).toBeDefined();
            expect(typeof ratings.averageRating).toBe("number");
            expect(typeof ratings.totalRatings).toBe("number");
            expect(ratings.ratingDistribution).toBeDefined();
        }, 30000);
    });

    describe("getReviews", () => {
        it("should fetch recent reviews", async () => {
            if (!keyId || !issuerId || !privateKeyPath || !appId) {
                return;
            }

            const reviews = await client.getReviews({ limit: 10 });

            expect(reviews).toBeDefined();
            expect(Array.isArray(reviews.reviews)).toBe(true);
        }, 30000);
    });

    describe("collectAllData", () => {
        it("should collect all App Store data", async () => {
            if (!keyId || !issuerId || !privateKeyPath || !appId) {
                return;
            }

            const data = await client.collectAllData(dateRange);

            expect(data).toBeDefined();
            expect(data.appId).toBe(appId);
            expect(data.dateRange).toEqual(dateRange);
            expect(typeof data.averageRating).toBe("number");
            expect(data.collectedAt).toBeInstanceOf(Date);
        }, 60000);
    });
});
