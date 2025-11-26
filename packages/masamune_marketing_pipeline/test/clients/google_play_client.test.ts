/**
 * Google Play Developer API Client Tests
 *
 * TDD: Write tests first, then implement the client.
 *
 * Required environment variables in test/.env:
 * - GOOGLE_PLAY_SERVICE_ACCOUNT_PATH: Path to service account JSON
 * - GOOGLE_PLAY_PACKAGE_NAME: App package name (e.g., com.example.app)
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load test environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

import { GooglePlayClient } from "../../src/clients/google_play_client";
import { DateRange } from "../../src/models/marketing_data";

describe("GooglePlayClient", () => {
    let client: GooglePlayClient;
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || "";
    const serviceAccountPath = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH || "";

    // Date range for testing (last 7 days)
    const dateRange: DateRange = {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    };

    beforeAll(() => {
        if (!packageName || !serviceAccountPath) {
            console.warn("Skipping Google Play tests: Missing environment variables");
            return;
        }

        // serviceAccountPath in .env is relative to project root (e.g., test/mathru-net-xxx.json)
        // __dirname is test/clients/, project root is 2 levels up
        const projectRoot = path.join(__dirname, "..", "..");
        const absoluteServiceAccountPath = path.join(projectRoot, serviceAccountPath);

        client = new GooglePlayClient({
            serviceAccountPath: absoluteServiceAccountPath,
            packageName: packageName,
        });
    });

    describe("initialization", () => {
        it("should create client with valid config", () => {
            if (!packageName || !serviceAccountPath) {
                return;
            }
            expect(client).toBeDefined();
        });

        it("should throw error with invalid service account path", () => {
            expect(() => {
                new GooglePlayClient({
                    serviceAccountPath: "/nonexistent/path.json",
                    packageName: "com.example.app",
                });
            }).toThrow();
        });
    });

    describe("getAppInfo", () => {
        it("should fetch app information", async () => {
            if (!packageName || !serviceAccountPath) {
                return;
            }

            const appInfo = await client.getAppInfo();

            expect(appInfo).toBeDefined();
            expect(appInfo.packageName).toBe(packageName);
            expect(appInfo.title).toBeDefined();
        }, 30000);
    });

    describe("getInstallStats", () => {
        it("should fetch install statistics for date range", async () => {
            if (!packageName || !serviceAccountPath) {
                return;
            }

            const stats = await client.getInstallStats(dateRange);

            expect(stats).toBeDefined();
            expect(typeof stats.totalInstalls).toBe("number");
            expect(typeof stats.totalUninstalls).toBe("number");
            expect(typeof stats.activeInstalls).toBe("number");
            expect(Array.isArray(stats.dailyStats)).toBe(true);
        }, 30000);
    });

    describe("getRatingsAndReviews", () => {
        it("should fetch ratings summary", async () => {
            if (!packageName || !serviceAccountPath) {
                return;
            }

            const ratings = await client.getRatings();

            expect(ratings).toBeDefined();
            expect(typeof ratings.averageRating).toBe("number");
            expect(ratings.averageRating).toBeGreaterThanOrEqual(0);
            expect(ratings.averageRating).toBeLessThanOrEqual(5);
            expect(typeof ratings.totalRatings).toBe("number");
            expect(ratings.ratingDistribution).toBeDefined();
            expect(ratings.ratingDistribution).toHaveProperty("1");
            expect(ratings.ratingDistribution).toHaveProperty("5");
        }, 30000);

        it("should fetch recent reviews", async () => {
            if (!packageName || !serviceAccountPath) {
                return;
            }

            const reviews = await client.getReviews({ maxResults: 10 });

            expect(reviews).toBeDefined();
            expect(Array.isArray(reviews.reviews)).toBe(true);
            if (reviews.reviews.length > 0) {
                const review = reviews.reviews[0];
                expect(review.reviewId).toBeDefined();
                expect(typeof review.rating).toBe("number");
                expect(review.text).toBeDefined();
            }
        }, 30000);
    });

    describe("getRevenueStats", () => {
        it("should fetch revenue statistics for date range", async () => {
            if (!packageName || !serviceAccountPath) {
                return;
            }

            const revenue = await client.getRevenueStats(dateRange);

            expect(revenue).toBeDefined();
            expect(typeof revenue.totalRevenue).toBe("number");
            expect(revenue.currency).toBeDefined();
            expect(Array.isArray(revenue.dailyRevenue)).toBe(true);
        }, 30000);
    });

    describe("collectAllData", () => {
        it("should collect all Google Play data", async () => {
            if (!packageName || !serviceAccountPath) {
                return;
            }

            const data = await client.collectAllData(dateRange);

            expect(data).toBeDefined();
            expect(data.packageName).toBe(packageName);
            expect(data.dateRange).toEqual(dateRange);
            expect(typeof data.totalInstalls).toBe("number");
            expect(typeof data.averageRating).toBe("number");
            expect(data.ratingDistribution).toBeDefined();
            expect(Array.isArray(data.recentReviews)).toBe(true);
            expect(data.collectedAt).toBeInstanceOf(Date);
        }, 60000);
    });
});
