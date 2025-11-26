/**
 * Firebase Analytics Data API Client Tests
 *
 * TDD: Write tests first, then implement the client.
 *
 * Required environment variables in test/.env:
 * - GOOGLE_SERVICE_ACCOUNT_PATH: Path to service account JSON
 * - FIREBASE_ANALYTICS_PROPERTY_ID: GA4 property ID (e.g., properties/123456789)
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load test environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

import { FirebaseAnalyticsClient } from "../../src/clients/firebase_analytics_client";
import { DateRange } from "../../src/models/marketing_data";

describe("FirebaseAnalyticsClient", () => {
    let client: FirebaseAnalyticsClient;
    const propertyId = process.env.FIREBASE_ANALYTICS_PROPERTY_ID || "";
    const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || "";

    // Date range for testing (last 7 days)
    const dateRange: DateRange = {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    };

    beforeAll(() => {
        if (!propertyId || !serviceAccountPath) {
            console.warn("Skipping Firebase Analytics tests: Missing environment variables");
            return;
        }

        // serviceAccountPath in .env is relative to project root
        const projectRoot = path.join(__dirname, "..", "..");
        const absoluteServiceAccountPath = path.join(projectRoot, serviceAccountPath);

        client = new FirebaseAnalyticsClient({
            serviceAccountPath: absoluteServiceAccountPath,
            propertyId: propertyId,
        });
    });

    describe("initialization", () => {
        it("should create client with valid config", () => {
            if (!propertyId || !serviceAccountPath) {
                return;
            }
            expect(client).toBeDefined();
        });

        it("should throw error with invalid service account path", () => {
            expect(() => {
                new FirebaseAnalyticsClient({
                    serviceAccountPath: "/nonexistent/path.json",
                    propertyId: "properties/123456",
                });
            }).toThrow();
        });
    });

    describe("getActiveUsers", () => {
        it("should fetch DAU, WAU, MAU metrics", async () => {
            if (!propertyId || !serviceAccountPath) {
                return;
            }

            const activeUsers = await client.getActiveUsers(dateRange);

            expect(activeUsers).toBeDefined();
            expect(typeof activeUsers.dau).toBe("number");
            expect(typeof activeUsers.wau).toBe("number");
            expect(typeof activeUsers.mau).toBe("number");
            expect(activeUsers.dau).toBeGreaterThanOrEqual(0);
        }, 30000);
    });

    describe("getUserDemographics", () => {
        it("should fetch age, gender, country distribution", async () => {
            if (!propertyId || !serviceAccountPath) {
                return;
            }

            const demographics = await client.getUserDemographics(dateRange);

            expect(demographics).toBeDefined();
            expect(demographics.ageGroups).toBeDefined();
            expect(demographics.genderDistribution).toBeDefined();
            expect(demographics.countryDistribution).toBeDefined();
            expect(demographics.languageDistribution).toBeDefined();
        }, 30000);
    });

    describe("getDeviceInfo", () => {
        it("should fetch device types and OS versions", async () => {
            if (!propertyId || !serviceAccountPath) {
                return;
            }

            const deviceInfo = await client.getDeviceInfo(dateRange);

            expect(deviceInfo).toBeDefined();
            expect(deviceInfo.deviceTypes).toBeDefined();
            expect(deviceInfo.osVersions).toBeDefined();
        }, 30000);
    });

    describe("getEngagementMetrics", () => {
        it("should fetch session duration and page views", async () => {
            if (!propertyId || !serviceAccountPath) {
                return;
            }

            const engagement = await client.getEngagementMetrics(dateRange);

            expect(engagement).toBeDefined();
            expect(typeof engagement.averageSessionDuration).toBe("number");
            expect(typeof engagement.sessionsPerUser).toBe("number");
            expect(typeof engagement.screenPageViews).toBe("number");
        }, 30000);
    });

    describe("collectAllData", () => {
        it("should collect all Firebase Analytics data", async () => {
            if (!propertyId || !serviceAccountPath) {
                return;
            }

            const data = await client.collectAllData(dateRange);

            expect(data).toBeDefined();
            expect(data.propertyId).toBe(propertyId);
            expect(data.dateRange).toEqual(dateRange);
            expect(typeof data.dau).toBe("number");
            expect(typeof data.wau).toBe("number");
            expect(typeof data.mau).toBe("number");
            expect(data.demographics).toBeDefined();
            expect(data.collectedAt).toBeInstanceOf(Date);
        }, 60000);
    });
});
