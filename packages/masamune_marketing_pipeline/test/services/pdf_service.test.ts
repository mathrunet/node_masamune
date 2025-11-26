/**
 * PDF Service Tests
 *
 * TDD: Write tests first, then implement the service.
 * Uses pdfkit for PDF generation.
 */

import * as fs from "fs";
import * as path from "path";
import { PDFService } from "../../src/services/pdf_service";
import { ChartService } from "../../src/services/chart_service";
import { MarketingReport } from "../../src/models/report_data";
import { AIAnalysisReport } from "../../src/services/ai_analysis_service";
import { Timestamp } from "firebase-admin/firestore";

describe("PDFService", () => {
    let pdfService: PDFService;
    let chartService: ChartService;
    const tmpDir = path.join(__dirname, "../tmp");

    // Sample AI analysis report
    const sampleAIReport: AIAnalysisReport = {
        overallAnalysis: {
            summary:
                "このアプリは全体的に好調なパフォーマンスを示しています。新規インストール数は安定しており、ユーザー評価も高水準を維持しています。特にDAU（日次アクティブユーザー）の伸びが顕著で、ユーザーエンゲージメントの向上が見られます。",
            highlights: [
                "新規インストール数が前期比15%増加",
                "平均評価4.2を維持",
                "DAUが2,500人に到達",
                "アンインストール率が低下傾向",
            ],
            concerns: [
                "一部ユーザーからクラッシュ報告あり",
                "特定地域でのダウンロード数が伸び悩み",
            ],
            keyMetrics: [
                { metric: "新規インストール", value: "1,500", trend: "up" as const },
                { metric: "平均評価", value: "4.2", trend: "stable" as const },
                { metric: "DAU", value: "2,500", trend: "up" as const },
                { metric: "アンインストール", value: "200", trend: "down" as const },
            ],
        },
        improvementSuggestions: [
            {
                title: "クラッシュ問題の優先対応",
                description: "ユーザーレビューで報告されているクラッシュ問題を調査し、次回アップデートで修正する",
                priority: "high" as const,
                category: "quality",
                expectedImpact: "評価向上とアンインストール率の低下",
            },
            {
                title: "ASO最適化",
                description: "アプリストアの説明文とスクリーンショットを最適化し、コンバージョン率を向上させる",
                priority: "medium" as const,
                category: "user_acquisition",
                expectedImpact: "インストール数10%増加",
            },
            {
                title: "プッシュ通知の最適化",
                description: "ユーザーの行動パターンに基づいたパーソナライズされたプッシュ通知を実装",
                priority: "medium" as const,
                category: "engagement",
                expectedImpact: "リテンション率5%向上",
            },
        ],
        trendAnalysis: {
            userGrowthTrend: "新規ユーザー獲得は堅調に推移しており、特に週末のインストール数が増加傾向にあります。",
            engagementTrend:
                "ユーザーエンゲージメントは向上しており、1ユーザーあたりのセッション数が増加しています。",
            ratingTrend: "評価は安定しており、5つ星レビューの割合が増加傾向にあります。",
            predictions: [
                "来月のDAUは3,000人に到達する見込み",
                "現在のトレンドが続けば、月間インストール数は7,000件を超える可能性",
                "評価は4.3以上に向上する見込み",
            ],
        },
        reviewAnalysis: {
            sentiment: { positive: 65, neutral: 25, negative: 10 },
            commonThemes: ["使いやすい", "便利", "デザインが良い", "時々クラッシュする"],
            actionableInsights: [
                "クラッシュ問題の早急な対応が必要",
                "新機能リクエストへの対応を検討",
                "ポジティブなレビューに返信してエンゲージメント向上",
            ],
        },
        generatedAt: new Date(),
    };

    // Sample marketing report
    const sampleMarketingReport: MarketingReport = {
        reportId: "test-report-001",
        appId: "com.example.app",
        appName: "テストアプリ",
        reportType: "weekly",
        dateRange: {
            startDate: "2024-01-01",
            endDate: "2024-01-07",
        },
        rawData: {
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
                recentReviews: [
                    {
                        id: "review1",
                        rating: 5,
                        text: "Great app!",
                        authorName: "User1",
                        date: "2024-01-05",
                    },
                ],
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
        },
        status: "completed",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    };

    beforeAll(async () => {
        pdfService = new PDFService();
        chartService = new ChartService();

        // Ensure tmp directory exists
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
    });

    describe("initialization", () => {
        it("should create service", () => {
            expect(pdfService).toBeDefined();
        });
    });

    describe("generateReport", () => {
        it("should generate a complete PDF report", async () => {
            // Generate charts first
            const charts = await chartService.generateAllCharts({
                appId: sampleMarketingReport.appId,
                dateRange: sampleMarketingReport.dateRange,
                googlePlay: sampleMarketingReport.rawData.googlePlay,
                firebaseAnalytics: sampleMarketingReport.rawData.firebaseAnalytics,
                collectedAt: new Date(),
            });

            const pdfBuffer = await pdfService.generateReport({
                report: sampleMarketingReport,
                aiAnalysis: sampleAIReport,
                charts: charts,
            });

            expect(pdfBuffer).toBeDefined();
            expect(pdfBuffer).toBeInstanceOf(Buffer);
            expect(pdfBuffer.length).toBeGreaterThan(1000);

            // Save to tmp for verification
            const outputPath = path.join(tmpDir, "marketing_report.pdf");
            fs.writeFileSync(outputPath, pdfBuffer);
            console.log(`PDF report saved to: ${outputPath}`);
        }, 60000);
    });

    describe("generateReportWithCoverImage", () => {
        it("should generate a PDF report with cover image", async () => {
            // Generate charts first
            const charts = await chartService.generateAllCharts({
                appId: sampleMarketingReport.appId,
                dateRange: sampleMarketingReport.dateRange,
                googlePlay: sampleMarketingReport.rawData.googlePlay,
                firebaseAnalytics: sampleMarketingReport.rawData.firebaseAnalytics,
                collectedAt: new Date(),
            });

            // Create a simple cover image (using chart service for testing)
            const coverImage = await chartService.generateEngagementChart({
                dau: 2500,
                wau: 8000,
                mau: 25000,
            });

            const pdfBuffer = await pdfService.generateReport({
                report: sampleMarketingReport,
                aiAnalysis: sampleAIReport,
                charts: charts,
                coverImage: coverImage,
            });

            expect(pdfBuffer).toBeDefined();
            expect(pdfBuffer).toBeInstanceOf(Buffer);
            expect(pdfBuffer.length).toBeGreaterThan(5000);

            // Save to tmp for verification
            const outputPath = path.join(tmpDir, "marketing_report_with_cover.pdf");
            fs.writeFileSync(outputPath, pdfBuffer);
            console.log(`PDF report with cover saved to: ${outputPath}`);
        }, 60000);
    });

    describe("generateSimpleReport", () => {
        it("should generate a simple summary PDF", async () => {
            const pdfBuffer = await pdfService.generateSimpleReport({
                appName: "テストアプリ",
                period: "2024年1月1日 〜 2024年1月7日",
                summary: sampleAIReport.overallAnalysis.summary,
                highlights: sampleAIReport.overallAnalysis.highlights,
                concerns: sampleAIReport.overallAnalysis.concerns,
                keyMetrics: sampleAIReport.overallAnalysis.keyMetrics,
            });

            expect(pdfBuffer).toBeDefined();
            expect(pdfBuffer).toBeInstanceOf(Buffer);
            expect(pdfBuffer.length).toBeGreaterThan(1000);

            // Save to tmp for verification
            const outputPath = path.join(tmpDir, "simple_report.pdf");
            fs.writeFileSync(outputPath, pdfBuffer);
            console.log(`Simple PDF report saved to: ${outputPath}`);
        }, 30000);
    });
});
