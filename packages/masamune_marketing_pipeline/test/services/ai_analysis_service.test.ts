/**
 * AI Analysis Service Tests
 *
 * TDD: Write tests first, then implement the service.
 *
 * Required environment variables in test/.env:
 * - VERTEXAI_SERVICE_ACCOUNT_PATH: Path to Vertex AI service account JSON
 * - VERTEXAI_PROJECT_ID: Google Cloud Project ID for Vertex AI
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load test environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

import { AIAnalysisService } from "../../src/services/ai_analysis_service";
import { CombinedMarketingData, DateRange } from "../../src/models/marketing_data";

describe("AIAnalysisService", () => {
    let service: AIAnalysisService;
    const projectId = process.env.VERTEXAI_PROJECT_ID || "";
    const serviceAccountPath = process.env.VERTEXAI_SERVICE_ACCOUNT_PATH || "";

    // Sample marketing data for testing
    const sampleDateRange: DateRange = {
        startDate: "2024-01-01",
        endDate: "2024-01-07",
    };

    const sampleMarketingData: CombinedMarketingData = {
        appId: "test-app-id",
        dateRange: sampleDateRange,
        googlePlay: {
            packageName: "com.example.app",
            dateRange: sampleDateRange,
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
            recentReviews: [
                {
                    id: "review1",
                    rating: 5,
                    text: "Great app! Love the new features.",
                    authorName: "User1",
                    date: "2024-01-05",
                },
                {
                    id: "review2",
                    rating: 2,
                    text: "App crashes frequently on my device.",
                    authorName: "User2",
                    date: "2024-01-04",
                },
            ],
            collectedAt: new Date(),
        },
        firebaseAnalytics: {
            projectId: "test-project",
            propertyId: "properties/123456",
            dateRange: sampleDateRange,
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
        github: {
            repoFullName: "owner/repo",
            dateRange: sampleDateRange,
            stars: 150,
            forks: 25,
            watchers: 45,
            openIssuesCount: 12,
            openIssues: 12,
            closedIssuesInPeriod: 5,
            newIssuesInPeriod: 3,
            openPRs: 4,
            mergedPRsInPeriod: 6,
            newPRsInPeriod: 2,
            recentCommits: 15,
            contributors: 5,
            latestRelease: {
                tagName: "v1.2.0",
                name: "Release 1.2.0",
                publishedAt: "2024-01-03",
                downloadCount: 500,
            },
            languages: { TypeScript: 80, JavaScript: 15, CSS: 5 },
            collectedAt: new Date(),
        },
        collectedAt: new Date(),
    };

    beforeAll(() => {
        if (!projectId || !serviceAccountPath) {
            console.warn("Skipping AI Analysis tests: Missing environment variables");
            return;
        }

        // Set up service account credentials for Vertex AI
        const projectRoot = path.join(__dirname, "..", "..");
        const absoluteServiceAccountPath = path.join(projectRoot, serviceAccountPath);

        if (fs.existsSync(absoluteServiceAccountPath)) {
            // Set GOOGLE_APPLICATION_CREDENTIALS for Vertex AI SDK
            process.env.GOOGLE_APPLICATION_CREDENTIALS = absoluteServiceAccountPath;
        } else {
            console.warn(`Service account file not found: ${absoluteServiceAccountPath}`);
            return;
        }

        service = new AIAnalysisService({
            projectId: projectId,
            region: "us-central1",
        });
    });

    describe("initialization", () => {
        it("should create service with valid config", () => {
            if (!projectId) {
                return;
            }
            expect(service).toBeDefined();
        });
    });

    describe("generateOverallAnalysis", () => {
        it("should generate overall analysis from marketing data", async () => {
            if (!projectId || !serviceAccountPath) {
                return;
            }

            const analysis = await service.generateOverallAnalysis(sampleMarketingData);

            expect(analysis).toBeDefined();
            expect(analysis.summary).toBeDefined();
            expect(typeof analysis.summary).toBe("string");
            expect(analysis.summary.length).toBeGreaterThan(50);
            expect(analysis.highlights).toBeDefined();
            expect(Array.isArray(analysis.highlights)).toBe(true);
            expect(analysis.concerns).toBeDefined();
            expect(Array.isArray(analysis.concerns)).toBe(true);
        }, 60000);
    });

    describe("generateImprovementSuggestions", () => {
        it("should generate actionable improvement suggestions", async () => {
            if (!projectId || !serviceAccountPath) {
                return;
            }

            const suggestions = await service.generateImprovementSuggestions(sampleMarketingData);

            expect(suggestions).toBeDefined();
            expect(Array.isArray(suggestions)).toBe(true);
            expect(suggestions.length).toBeGreaterThan(0);

            for (const suggestion of suggestions) {
                expect(suggestion.title).toBeDefined();
                expect(suggestion.description).toBeDefined();
                expect(suggestion.priority).toBeDefined();
                expect(["high", "medium", "low"]).toContain(suggestion.priority);
                expect(suggestion.category).toBeDefined();
            }
        }, 60000);
    });

    describe("generateTrendAnalysis", () => {
        it("should generate trend analysis from marketing data", async () => {
            if (!projectId || !serviceAccountPath) {
                return;
            }

            const trends = await service.generateTrendAnalysis(sampleMarketingData);

            expect(trends).toBeDefined();
            expect(trends.userGrowthTrend).toBeDefined();
            expect(trends.engagementTrend).toBeDefined();
            expect(trends.ratingTrend).toBeDefined();
            expect(trends.predictions).toBeDefined();
            expect(Array.isArray(trends.predictions)).toBe(true);
        }, 60000);
    });

    describe("generateCoverImage", () => {
        it("should generate a cover image for the report", async () => {
            if (!projectId || !serviceAccountPath) {
                return;
            }

            const imageBuffer = await service.generateCoverImage({
                appName: "Test App",
                period: "2024年1月1日 - 2024年1月7日",
                highlights: ["1500 new installs", "4.2 rating", "25000 MAU"],
            });

            expect(imageBuffer).toBeDefined();
            expect(imageBuffer).toBeInstanceOf(Buffer);
            expect(imageBuffer.length).toBeGreaterThan(1000);
        }, 90000);
    });

    describe("analyzeReviews", () => {
        it("should analyze reviews and extract insights", async () => {
            if (!projectId || !serviceAccountPath) {
                return;
            }

            const reviews = sampleMarketingData.googlePlay?.recentReviews || [];
            const reviewAnalysis = await service.analyzeReviews(reviews);

            expect(reviewAnalysis).toBeDefined();
            expect(reviewAnalysis.sentiment).toBeDefined();
            expect(reviewAnalysis.commonThemes).toBeDefined();
            expect(Array.isArray(reviewAnalysis.commonThemes)).toBe(true);
            expect(reviewAnalysis.actionableInsights).toBeDefined();
            expect(Array.isArray(reviewAnalysis.actionableInsights)).toBe(true);
        }, 90000);
    });

    describe("generateFullReport", () => {
        it("should generate a complete AI analysis report", async () => {
            if (!projectId || !serviceAccountPath) {
                return;
            }

            const report = await service.generateFullReport(sampleMarketingData);

            expect(report).toBeDefined();
            expect(report.overallAnalysis).toBeDefined();
            expect(report.improvementSuggestions).toBeDefined();
            expect(report.trendAnalysis).toBeDefined();
            expect(report.reviewAnalysis).toBeDefined();
            expect(report.generatedAt).toBeInstanceOf(Date);
        }, 180000);
    });
});
