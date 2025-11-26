/**
 * Chart Service Tests
 *
 * TDD: Write tests first, then implement the service.
 * Uses QuickChart API for chart generation.
 */

import * as fs from "fs";
import * as path from "path";
import { ChartService } from "../../src/services/chart_service";
import { RatingDistribution } from "../../src/models/marketing_data";

describe("ChartService", () => {
    let service: ChartService;
    const tmpDir = path.join(__dirname, "../tmp");

    beforeAll(() => {
        service = new ChartService();

        // Ensure tmp directory exists
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
    });

    describe("initialization", () => {
        it("should create service", () => {
            expect(service).toBeDefined();
        });
    });

    describe("generateDownloadsChart", () => {
        it("should generate a downloads trend line chart", async () => {
            const data = {
                labels: ["1/1", "1/2", "1/3", "1/4", "1/5", "1/6", "1/7"],
                downloads: [150, 180, 120, 200, 175, 220, 190],
                uninstalls: [20, 25, 15, 30, 22, 28, 24],
            };

            const imageBuffer = await service.generateDownloadsChart(data);

            expect(imageBuffer).toBeDefined();
            expect(imageBuffer).toBeInstanceOf(Buffer);
            expect(imageBuffer.length).toBeGreaterThan(1000);

            // Save to tmp for verification
            const outputPath = path.join(tmpDir, "downloads_chart.png");
            fs.writeFileSync(outputPath, imageBuffer);
            console.log(`Chart saved to: ${outputPath}`);
        }, 30000);
    });

    describe("generateRatingDistributionChart", () => {
        it("should generate a rating distribution bar chart", async () => {
            const distribution: RatingDistribution = {
                star1: 10,
                star2: 15,
                star3: 30,
                star4: 95,
                star5: 200,
            };

            const imageBuffer = await service.generateRatingDistributionChart(distribution);

            expect(imageBuffer).toBeDefined();
            expect(imageBuffer).toBeInstanceOf(Buffer);
            expect(imageBuffer.length).toBeGreaterThan(1000);

            // Save to tmp for verification
            const outputPath = path.join(tmpDir, "rating_distribution_chart.png");
            fs.writeFileSync(outputPath, imageBuffer);
            console.log(`Chart saved to: ${outputPath}`);
        }, 30000);
    });

    describe("generateUserDemographicsChart", () => {
        it("should generate a user demographics pie chart", async () => {
            const demographics = {
                labels: ["25-34", "35-44", "18-24", "45-54", "55+"],
                values: [40, 30, 20, 7, 3],
            };

            const imageBuffer = await service.generateUserDemographicsChart(demographics);

            expect(imageBuffer).toBeDefined();
            expect(imageBuffer).toBeInstanceOf(Buffer);
            expect(imageBuffer.length).toBeGreaterThan(1000);

            // Save to tmp for verification
            const outputPath = path.join(tmpDir, "demographics_chart.png");
            fs.writeFileSync(outputPath, imageBuffer);
            console.log(`Chart saved to: ${outputPath}`);
        }, 30000);
    });

    describe("generateCountryDistributionChart", () => {
        it("should generate a country distribution doughnut chart", async () => {
            const distribution = {
                labels: ["Japan", "USA", "UK", "Germany", "Other"],
                values: [60, 20, 10, 5, 5],
            };

            const imageBuffer = await service.generateCountryDistributionChart(distribution);

            expect(imageBuffer).toBeDefined();
            expect(imageBuffer).toBeInstanceOf(Buffer);
            expect(imageBuffer.length).toBeGreaterThan(1000);

            // Save to tmp for verification
            const outputPath = path.join(tmpDir, "country_distribution_chart.png");
            fs.writeFileSync(outputPath, imageBuffer);
            console.log(`Chart saved to: ${outputPath}`);
        }, 30000);
    });

    describe("generateEngagementChart", () => {
        it("should generate an engagement metrics bar chart", async () => {
            const data = {
                dau: 2500,
                wau: 8000,
                mau: 25000,
                sessionsPerUser: 2.5,
                avgSessionDuration: 320,
            };

            const imageBuffer = await service.generateEngagementChart(data);

            expect(imageBuffer).toBeDefined();
            expect(imageBuffer).toBeInstanceOf(Buffer);
            expect(imageBuffer.length).toBeGreaterThan(1000);

            // Save to tmp for verification
            const outputPath = path.join(tmpDir, "engagement_chart.png");
            fs.writeFileSync(outputPath, imageBuffer);
            console.log(`Chart saved to: ${outputPath}`);
        }, 30000);
    });

    describe("generateAllCharts", () => {
        it("should generate all charts from marketing data", async () => {
            const marketingData = {
                googlePlay: {
                    packageName: "com.example.app",
                    dateRange: { startDate: "2024-01-01", endDate: "2024-01-07" },
                    totalInstalls: 1500,
                    activeInstalls: 12000,
                    newInstalls: 1500,
                    uninstalls: 200,
                    averageRating: 4.2,
                    totalRatings: 350,
                    ratingDistribution: {
                        star1: 10,
                        star2: 15,
                        star3: 30,
                        star4: 95,
                        star5: 200,
                    },
                    recentReviews: [],
                    collectedAt: new Date(),
                },
                firebaseAnalytics: {
                    projectId: "test-project",
                    propertyId: "properties/123456",
                    dateRange: { startDate: "2024-01-01", endDate: "2024-01-07" },
                    dau: 2500,
                    wau: 8000,
                    mau: 25000,
                    newUsers: 1200,
                    returningUsers: 1300,
                    demographics: {
                        ageGroups: { "25-34": 40, "35-44": 30, "18-24": 20, "45-54": 10 },
                        genderDistribution: { male: 55, female: 40, unknown: 5 },
                        countryDistribution: { JP: 60, US: 20, GB: 10, other: 10 },
                        languageDistribution: { ja: 60, en: 30, other: 10 },
                    },
                    deviceTypes: { phone: 75, tablet: 20, desktop: 5 },
                    averageSessionDuration: 320,
                    sessionsPerUser: 2.5,
                    screenPageViews: 15000,
                    collectedAt: new Date(),
                },
                appId: "test-app",
                dateRange: { startDate: "2024-01-01", endDate: "2024-01-07" },
                collectedAt: new Date(),
            };

            const charts = await service.generateAllCharts(marketingData);

            expect(charts).toBeDefined();
            expect(charts.ratingDistribution).toBeInstanceOf(Buffer);
            expect(charts.engagement).toBeInstanceOf(Buffer);

            // Save all charts
            if (charts.ratingDistribution) {
                fs.writeFileSync(path.join(tmpDir, "all_rating.png"), charts.ratingDistribution);
            }
            if (charts.engagement) {
                fs.writeFileSync(path.join(tmpDir, "all_engagement.png"), charts.engagement);
            }
            if (charts.demographics) {
                fs.writeFileSync(path.join(tmpDir, "all_demographics.png"), charts.demographics);
            }
            if (charts.countryDistribution) {
                fs.writeFileSync(path.join(tmpDir, "all_country.png"), charts.countryDistribution);
            }

            console.log("All charts saved to test/tmp/");
        }, 60000);
    });
});
