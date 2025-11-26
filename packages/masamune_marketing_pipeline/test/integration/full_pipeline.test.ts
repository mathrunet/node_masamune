/**
 * Full Pipeline Integration Test
 *
 * End-to-end test that:
 * 1. Collects real data from APIs (Google Play, Firebase, GitHub, App Store)
 * 2. Generates AI analysis using Vertex AI
 * 3. Creates charts using QuickChart
 * 4. Generates PDF report
 * 5. Saves everything to test/tmp/ for review
 *
 * Run with: npm test -- test/integration/full_pipeline.test.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { Timestamp } from "firebase-admin/firestore";

// Load test environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

import { GooglePlayClient } from "../../src/clients/google_play_client";
import { FirebaseAnalyticsClient } from "../../src/clients/firebase_analytics_client";
import { GitHubClient } from "../../src/clients/github_client";
import { AppStoreClient } from "../../src/clients/app_store_client";
import { AIAnalysisService, AIAnalysisReport } from "../../src/services/ai_analysis_service";
import { ChartService, GeneratedCharts } from "../../src/services/chart_service";
import { PDFService } from "../../src/services/pdf_service";
import {
    CombinedMarketingData,
    GooglePlayData,
    FirebaseAnalyticsData,
    GitHubData,
    AppStoreData,
    DateRange,
} from "../../src/models/marketing_data";
import { MarketingReport } from "../../src/models/report_data";

describe("Full Pipeline Integration", () => {
    const tmpDir = path.join(__dirname, "../tmp");
    const projectRoot = path.join(__dirname, "../..");

    // Environment variables
    const googlePlayPackage = process.env.GOOGLE_PLAY_PACKAGE_NAME;
    const googlePlayServiceAccount = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH;
    const firebasePropertyId = process.env.FIREBASE_ANALYTICS_PROPERTY_ID;
    const firebaseServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO;
    const appStoreKeyId = process.env.APP_STORE_KEY_ID;
    const appStoreIssuerId = process.env.APP_STORE_ISSUER_ID;
    const appStorePrivateKeyPath = process.env.APP_STORE_PRIVATE_KEY_PATH;
    const appStoreAppId = process.env.APP_STORE_APP_ID;
    const appStoreVendorNumber = process.env.APP_STORE_VENDOR_NUMBER;
    const vertexAIProjectId = process.env.VERTEXAI_PROJECT_ID || process.env.GCP_PROJECT_ID;
    const vertexAIServiceAccount = process.env.VERTEXAI_SERVICE_ACCOUNT_PATH;

    // Calculate date range (last 7 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const dateRange: DateRange = {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
    };

    beforeAll(() => {
        // Ensure tmp directory exists
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
    });

    it("should generate a complete marketing report from real API data", async () => {
        console.log("\n========================================");
        console.log("FULL PIPELINE INTEGRATION TEST");
        console.log("========================================\n");
        console.log(`Date Range: ${dateRange.startDate} to ${dateRange.endDate}\n`);

        // ======================================
        // Step 1: Collect data from all APIs
        // ======================================
        console.log("📊 Step 1: Collecting data from APIs...\n");

        const combinedData: CombinedMarketingData = {
            appId: googlePlayPackage || appStoreAppId || "unknown",
            dateRange,
            collectedAt: new Date(),
        };

        // Google Play data
        if (googlePlayPackage && googlePlayServiceAccount) {
            try {
                console.log("  → Google Play...");
                const absolutePath = path.join(projectRoot, googlePlayServiceAccount);
                if (fs.existsSync(absolutePath)) {
                    process.env.GOOGLE_APPLICATION_CREDENTIALS = absolutePath;
                }

                const googlePlayClient = new GooglePlayClient({
                    packageName: googlePlayPackage,
                    serviceAccountPath: googlePlayServiceAccount,
                });

                const [ratings, reviews] = await Promise.all([
                    googlePlayClient.getRatings(),
                    googlePlayClient.getReviews({ maxResults: 10 }),
                ]);

                combinedData.googlePlay = {
                    packageName: googlePlayPackage,
                    dateRange,
                    averageRating: ratings.averageRating,
                    totalRatings: ratings.totalRatings,
                    ratingDistribution: {
                        star1: ratings.ratingDistribution[1],
                        star2: ratings.ratingDistribution[2],
                        star3: ratings.ratingDistribution[3],
                        star4: ratings.ratingDistribution[4],
                        star5: ratings.ratingDistribution[5],
                    },
                    recentReviews: reviews.reviews.map((r) => ({
                        id: r.reviewId,
                        rating: r.rating,
                        text: r.text,
                        authorName: r.authorName,
                        date: r.timestamp.toISOString().split("T")[0],
                        language: r.language,
                    })),
                    collectedAt: new Date(),
                };
                console.log(`    ✓ Google Play: Rating ${ratings.averageRating.toFixed(2)}, ${ratings.totalRatings} ratings`);
            } catch (error) {
                console.log(`    ✗ Google Play: ${(error as Error).message}`);
            }
        } else {
            console.log("  ⊘ Google Play: Skipped (missing config)");
        }

        // Firebase Analytics data
        if (firebasePropertyId && firebaseServiceAccount) {
            try {
                console.log("  → Firebase Analytics...");
                const absolutePath = path.join(projectRoot, firebaseServiceAccount);
                if (fs.existsSync(absolutePath)) {
                    process.env.GOOGLE_APPLICATION_CREDENTIALS = absolutePath;
                }

                const firebaseClient = new FirebaseAnalyticsClient({
                    propertyId: firebasePropertyId,
                    serviceAccountPath: firebaseServiceAccount,
                });

                const [activeUsers, demographics] = await Promise.all([
                    firebaseClient.getActiveUsers(dateRange),
                    firebaseClient.getUserDemographics(dateRange),
                ]);

                combinedData.firebaseAnalytics = {
                    projectId: process.env.GCP_PROJECT_ID || "",
                    propertyId: firebasePropertyId,
                    dateRange,
                    dau: activeUsers.dau,
                    wau: activeUsers.wau,
                    mau: activeUsers.mau,
                    newUsers: activeUsers.newUsers,
                    demographics: {
                        ageGroups: demographics.ageGroups as any,
                        genderDistribution: demographics.genderDistribution as any,
                        countryDistribution: demographics.countryDistribution,
                    },
                    collectedAt: new Date(),
                };
                console.log(`    ✓ Firebase: DAU ${activeUsers.dau}, WAU ${activeUsers.wau}, MAU ${activeUsers.mau}`);
            } catch (error) {
                console.log(`    ✗ Firebase: ${(error as Error).message}`);
            }
        } else {
            console.log("  ⊘ Firebase Analytics: Skipped (missing config)");
        }

        // GitHub data
        if (githubToken && githubRepo) {
            try {
                console.log("  → GitHub...");
                const githubClient = new GitHubClient({
                    token: githubToken,
                    repo: githubRepo,
                });

                const [repoInfo, issueStats, codeAnalysis] = await Promise.all([
                    githubClient.getRepositoryInfo(),
                    githubClient.getIssueStats(dateRange),
                    githubClient.getCodeAnalysisData(),
                ]);

                combinedData.github = {
                    repoFullName: githubRepo,
                    dateRange,
                    stars: repoInfo.stars,
                    forks: repoInfo.forks,
                    watchers: repoInfo.watchers,
                    openIssuesCount: repoInfo.openIssuesCount,
                    openIssues: issueStats.openIssues,
                    closedIssuesInPeriod: issueStats.closedIssuesInPeriod,
                    newIssuesInPeriod: issueStats.newIssuesInPeriod,
                    codeAnalysis: {
                        readme: codeAnalysis.readme,
                        projectConfig: codeAnalysis.projectConfig,
                        projectType: codeAnalysis.projectType,
                        recentIssues: codeAnalysis.recentIssues?.map((i) => ({
                            number: i.number,
                            title: i.title,
                            body: i.body,
                            state: i.state,
                            labels: i.labels,
                            createdAt: i.createdAt,
                        })),
                    },
                    collectedAt: new Date(),
                };
                console.log(`    ✓ GitHub: ${repoInfo.stars} stars, ${repoInfo.openIssuesCount} open issues`);
                console.log(`    ✓ GitHub Code Analysis: ${codeAnalysis.projectType} project, ${codeAnalysis.recentIssues?.length || 0} issues`);
            } catch (error) {
                console.log(`    ✗ GitHub: ${(error as Error).message}`);
            }
        } else {
            console.log("  ⊘ GitHub: Skipped (missing config)");
        }

        // App Store data
        if (appStoreKeyId && appStoreIssuerId && appStorePrivateKeyPath && appStoreAppId) {
            try {
                console.log("  → App Store...");
                const privateKeyFullPath = path.join(__dirname, "..", appStorePrivateKeyPath);

                if (fs.existsSync(privateKeyFullPath)) {
                    const appStoreClient = new AppStoreClient({
                        keyId: appStoreKeyId,
                        issuerId: appStoreIssuerId,
                        privateKeyPath: privateKeyFullPath,
                        appId: appStoreAppId,
                        vendorNumber: appStoreVendorNumber,
                    });

                    const ratings = await appStoreClient.getRatings();

                    combinedData.appStore = {
                        appId: appStoreAppId,
                        dateRange,
                        averageRating: ratings.averageRating,
                        totalRatings: ratings.totalRatings,
                        collectedAt: new Date(),
                    };
                    console.log(`    ✓ App Store: Rating ${ratings.averageRating?.toFixed(2) || "N/A"}`);
                } else {
                    console.log(`    ✗ App Store: Private key file not found`);
                }
            } catch (error) {
                console.log(`    ✗ App Store: ${(error as Error).message}`);
            }
        } else {
            console.log("  ⊘ App Store: Skipped (missing config)");
        }

        // Save collected data
        const collectedDataPath = path.join(tmpDir, "collected_data.json");
        fs.writeFileSync(collectedDataPath, JSON.stringify(combinedData, null, 2));
        console.log(`\n  📁 Collected data saved: ${collectedDataPath}\n`);

        // ======================================
        // Step 2: Generate AI Analysis
        // ======================================
        console.log("🤖 Step 2: Generating AI analysis...\n");

        let aiAnalysis: AIAnalysisReport | undefined;

        if (vertexAIProjectId && vertexAIServiceAccount) {
            try {
                const absolutePath = path.join(projectRoot, vertexAIServiceAccount);
                if (fs.existsSync(absolutePath)) {
                    process.env.GOOGLE_APPLICATION_CREDENTIALS = absolutePath;
                }

                const aiService = new AIAnalysisService({
                    projectId: vertexAIProjectId,
                    textModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
                });

                aiAnalysis = await aiService.generateFullReport(combinedData);

                console.log(`  ✓ AI Analysis generated`);
                console.log(`    Summary: ${aiAnalysis.overallAnalysis.summary.substring(0, 100)}...`);
                console.log(`    Highlights: ${aiAnalysis.overallAnalysis.highlights.length} items`);
                console.log(`    Improvements: ${aiAnalysis.improvementSuggestions.length} suggestions`);

                // Save AI analysis
                const aiAnalysisPath = path.join(tmpDir, "ai_analysis.json");
                fs.writeFileSync(aiAnalysisPath, JSON.stringify(aiAnalysis, null, 2));
                console.log(`  📁 AI analysis saved: ${aiAnalysisPath}\n`);
            } catch (error) {
                console.log(`  ✗ AI Analysis: ${(error as Error).message}\n`);
            }
        } else {
            console.log("  ⊘ AI Analysis: Skipped (missing config)\n");
        }

        // If AI analysis failed, create mock data
        if (!aiAnalysis) {
            console.log("  → Creating mock AI analysis for PDF generation...\n");
            aiAnalysis = createMockAIAnalysis(combinedData);
        }

        // ======================================
        // Step 3: Generate Charts
        // ======================================
        console.log("📈 Step 3: Generating charts...\n");

        const chartService = new ChartService({ width: 600, height: 400 });
        const charts: GeneratedCharts = {};

        // Rating distribution chart
        if (combinedData.googlePlay?.ratingDistribution || combinedData.appStore?.ratingDistribution) {
            try {
                const dist = combinedData.googlePlay?.ratingDistribution || combinedData.appStore?.ratingDistribution!;
                charts.ratingDistribution = await chartService.generateRatingDistributionChart(dist);
                fs.writeFileSync(path.join(tmpDir, "chart_rating_distribution.png"), charts.ratingDistribution);
                console.log("  ✓ Rating distribution chart");
            } catch (error) {
                console.log(`  ✗ Rating chart: ${(error as Error).message}`);
            }
        }

        // Engagement chart
        if (combinedData.firebaseAnalytics) {
            try {
                charts.engagement = await chartService.generateEngagementChart({
                    dau: combinedData.firebaseAnalytics.dau || 0,
                    wau: combinedData.firebaseAnalytics.wau || 0,
                    mau: combinedData.firebaseAnalytics.mau || 0,
                });
                fs.writeFileSync(path.join(tmpDir, "chart_engagement.png"), charts.engagement);
                console.log("  ✓ Engagement chart");
            } catch (error) {
                console.log(`  ✗ Engagement chart: ${(error as Error).message}`);
            }
        }

        // Demographics chart
        if (combinedData.firebaseAnalytics?.demographics?.ageGroups) {
            try {
                const ageGroups = combinedData.firebaseAnalytics.demographics.ageGroups;
                charts.demographics = await chartService.generateUserDemographicsChart({
                    labels: Object.keys(ageGroups),
                    values: Object.values(ageGroups) as number[],
                });
                if (charts.demographics) {
                    fs.writeFileSync(path.join(tmpDir, "chart_demographics.png"), charts.demographics);
                }
                console.log("  ✓ Demographics chart");
            } catch (error) {
                console.log(`  ✗ Demographics chart: ${(error as Error).message}`);
            }
        }

        // Country distribution chart
        if (combinedData.firebaseAnalytics?.demographics?.countryDistribution) {
            try {
                const countries = combinedData.firebaseAnalytics.demographics.countryDistribution;
                const sortedCountries = Object.entries(countries)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10);
                charts.countryDistribution = await chartService.generateCountryDistributionChart({
                    labels: sortedCountries.map(([k]) => k),
                    values: sortedCountries.map(([, v]) => v),
                });
                fs.writeFileSync(path.join(tmpDir, "chart_country_distribution.png"), charts.countryDistribution);
                console.log("  ✓ Country distribution chart");
            } catch (error) {
                console.log(`  ✗ Country chart: ${(error as Error).message}`);
            }
        }

        console.log();

        // ======================================
        // Step 4: Generate PDF Report
        // ======================================
        console.log("📄 Step 4: Generating PDF report...\n");

        const pdfService = new PDFService();

        // Create MarketingReport object
        const marketingReport: MarketingReport = {
            reportId: `integration-test-${Date.now()}`,
            appId: combinedData.appId,
            appName: getAppName(combinedData),
            reportType: "weekly",
            dateRange,
            rawData: {
                googlePlay: combinedData.googlePlay,
                appStore: combinedData.appStore,
                firebaseAnalytics: combinedData.firebaseAnalytics,
                github: combinedData.github,
            },
            status: "completed",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };

        const pdfBuffer = await pdfService.generateReport({
            report: marketingReport,
            aiAnalysis,
            charts,
        });

        const pdfPath = path.join(tmpDir, "full_pipeline_report.pdf");
        fs.writeFileSync(pdfPath, pdfBuffer);
        console.log(`  ✓ PDF generated: ${pdfPath}`);
        console.log(`  📊 PDF size: ${(pdfBuffer.length / 1024).toFixed(2)} KB\n`);

        // ======================================
        // Summary
        // ======================================
        console.log("========================================");
        console.log("INTEGRATION TEST COMPLETED");
        console.log("========================================");
        console.log(`\nOutput files in ${tmpDir}:`);
        console.log("  - collected_data.json    (Raw API data)");
        console.log("  - ai_analysis.json       (AI analysis results)");
        console.log("  - chart_*.png            (Generated charts)");
        console.log("  - full_pipeline_report.pdf (Final report)");
        console.log("\n✨ Please review the PDF and provide feedback!\n");

        // Assertions
        expect(pdfBuffer).toBeDefined();
        expect(pdfBuffer.length).toBeGreaterThan(0);
    }, 180000); // 3 minute timeout
});

/**
 * Get app name from combined data.
 */
function getAppName(data: CombinedMarketingData): string {
    if (data.googlePlay?.packageName) {
        const parts = data.googlePlay.packageName.split(".");
        return parts[parts.length - 1] || data.googlePlay.packageName;
    }
    if (data.appStore?.appId) {
        return `App ${data.appStore.appId}`;
    }
    return "Marketing Report";
}

/**
 * Create mock AI analysis for testing when Vertex AI is not available.
 */
function createMockAIAnalysis(data: CombinedMarketingData): AIAnalysisReport {
    const highlights: string[] = [];
    const concerns: string[] = [];
    const keyMetrics: { metric: string; value: string; trend: "up" | "down" | "stable" }[] = [];

    if (data.googlePlay) {
        if (data.googlePlay.averageRating && data.googlePlay.averageRating >= 4.0) {
            highlights.push(`高評価を維持: ${data.googlePlay.averageRating.toFixed(1)}点`);
        }
        keyMetrics.push({
            metric: "Google Play 評価",
            value: `${data.googlePlay.averageRating?.toFixed(1) || "N/A"}`,
            trend: "stable",
        });
    }

    if (data.firebaseAnalytics) {
        if (data.firebaseAnalytics.dau) {
            keyMetrics.push({
                metric: "DAU",
                value: data.firebaseAnalytics.dau.toLocaleString(),
                trend: "stable",
            });
        }
        if (data.firebaseAnalytics.mau) {
            keyMetrics.push({
                metric: "MAU",
                value: data.firebaseAnalytics.mau.toLocaleString(),
                trend: "stable",
            });
        }
    }

    if (data.github) {
        keyMetrics.push({
            metric: "GitHub Stars",
            value: (data.github.stars || 0).toString(),
            trend: "up",
        });
        if (data.github.openIssuesCount && data.github.openIssuesCount > 10) {
            concerns.push(`未解決のIssueが${data.github.openIssuesCount}件あります`);
        }
    }

    if (highlights.length === 0) {
        highlights.push("データ収集が正常に完了しました");
    }

    return {
        overallAnalysis: {
            summary: `${data.dateRange.startDate}から${data.dateRange.endDate}までの期間のマーケティングデータレポートです。複数のデータソースからメトリクスを収集し、アプリのパフォーマンスを分析しました。`,
            highlights,
            concerns: concerns.length > 0 ? concerns : ["特に大きな懸念点はありません"],
            keyMetrics,
        },
        improvementSuggestions: [
            {
                title: "ユーザーエンゲージメントの向上",
                description: "プッシュ通知やアプリ内メッセージを活用して、ユーザーのアクティブ率を向上させましょう。",
                priority: "medium",
                category: "engagement",
                expectedImpact: "DAUの10-15%向上が期待できます",
            },
            {
                title: "レビュー返信の強化",
                description: "低評価レビューへの迅速な対応で、ユーザー満足度を改善できます。",
                priority: "high",
                category: "support",
                expectedImpact: "評価の改善とユーザーロイヤリティの向上",
            },
        ],
        trendAnalysis: {
            userGrowthTrend: "ユーザー数は安定しています。新規ユーザー獲得施策の検討をお勧めします。",
            engagementTrend: "エンゲージメント指標は平均的な水準を維持しています。",
            ratingTrend: "評価は安定しており、大きな変動はありません。",
            predictions: [
                "現在のトレンドが続けば、来月も同様のパフォーマンスが見込まれます",
                "マーケティング施策により、新規ユーザー数の増加が期待できます",
            ],
        },
        reviewAnalysis: {
            sentiment: {
                positive: 60,
                neutral: 25,
                negative: 15,
            },
            commonThemes: ["使いやすさ", "機能リクエスト", "パフォーマンス"],
            actionableInsights: [
                "ユーザーからの機能リクエストを優先度付けして対応",
                "パフォーマンス問題の調査と改善",
            ],
        },
        generatedAt: new Date(),
    };
}
