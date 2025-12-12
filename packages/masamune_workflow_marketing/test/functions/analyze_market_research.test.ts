/**
 * AnalyzeMarketResearch Integration Tests
 *
 * Tests using firebase-functions-test with actual Firebase/Firestore.
 * This test validates market research analysis functionality using Gemini.
 *
 * Required:
 * - Service account: test/mathru-net-39425d37638c.json
 * - Environment variables in test/.env
 */

import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";
import { ModelTimestamp } from "@mathrunet/masamune";
import "@mathrunet/masamune";
import { MarketResearch, MarketResearchData } from "../../src/models";

// Load test environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

// Service account path for authentication
const serviceAccountPath = "test/mathru-net-39425d37638c.json";

// Initialize firebase-functions-test with actual project
const config = require("firebase-functions-test")({
    storageBucket: "mathru-net.appspot.com",
    projectId: "mathru-net",
}, serviceAccountPath);

// Initialize Firebase Admin with service account credentials
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        projectId: "mathru-net",
    });
}

// Helper to create Firestore Timestamp from Date
const toTimestamp = (date: Date) => admin.firestore.Timestamp.fromDate(date);

// Generate unique IDs for test data
const testTimestamp = Date.now();
const testOrganizationId = `test-org-analyze-research-${testTimestamp}`;
const testProjectId = `test-project-analyze-research-${testTimestamp}`;

// Firestore paths
const organizationPath = `plugins/workflow/organization/${testOrganizationId}`;
const projectPath = `plugins/workflow/project/${testProjectId}`;

// Sample market research data for testing
const sampleMarketResearchData: MarketResearchData = {
    marketPotential: {
        summary: "健康管理アプリ市場は急速に成長しており、2025年には世界で500億ドル規模に達すると予測されています。",
        tam: "500億ドル（世界市場）",
        sam: "50億ドル（日本市場）",
        som: "5億ドル（ターゲットセグメント）",
        marketDrivers: [
            "健康意識の高まり",
            "リモートワークの普及",
            "スマートウォッチの普及",
        ],
        marketBarriers: [
            "データプライバシーへの懸念",
            "競合の激化",
            "ユーザー定着率の課題",
        ],
        targetSegments: [
            "20-40代のビジネスパーソン",
            "フィットネス愛好家",
            "慢性疾患予防を意識する層",
        ],
    },
    competitorAnalysis: {
        competitors: [
            {
                name: "FitBit Premium",
                description: "ウェアラブルデバイスと連携した総合健康管理サービス",
                marketShare: "15%",
                strengths: ["ブランド認知度", "ハードウェア連携"],
                weaknesses: ["高価格", "デバイス依存"],
                pricing: "月額980円",
                targetAudience: "フィットネス愛好家",
            },
            {
                name: "あすけん",
                description: "AI栄養士による食事管理アプリ",
                marketShare: "10%",
                strengths: ["日本語対応", "食事記録の簡便さ"],
                weaknesses: ["睡眠・運動機能が弱い", "UIの古さ"],
                pricing: "月額480円",
                targetAudience: "ダイエット層",
            },
        ],
        marketLandscape: "国内健康管理アプリ市場は成熟期に入りつつあるが、AIを活用した総合的な健康管理ソリューションはまだ少ない。",
        competitiveAdvantages: [
            "AIによるパーソナライズ",
            "睡眠・運動・食事の統合管理",
        ],
        differentiationOpportunities: [
            "リアルタイムのAIコーチング",
            "企業向けB2Bソリューション",
        ],
        marketGaps: [
            "メンタルヘルスとの連携",
            "シニア向けUI/UX",
        ],
    },
    businessOpportunities: [
        {
            title: "企業向け福利厚生サービス",
            description: "企業の健康経営支援として、従業員向け健康管理サービスを提供",
            type: "market_gap",
            potentialImpact: "high",
            timeframe: "medium_term",
            requirements: ["B2B営業チーム", "企業向けダッシュボード"],
            risks: ["長い営業サイクル", "カスタマイズ要求"],
        },
    ],
    dataSources: [
        "https://example.com/health-app-market-report-2024",
        "https://example.com/japan-digital-health-trends",
    ],
    generatedAt: new Date().toISOString(),
};

describe("AnalyzeMarketResearch Integration Tests", () => {
    let firestore: admin.firestore.Firestore;

    beforeAll(() => {
        firestore = admin.firestore();
    });

    afterAll(async () => {
        // Cleanup base test data
        try {
            await firestore.doc(projectPath).delete();
            await firestore.doc(organizationPath).delete();
        } catch (e) {
            // Ignore cleanup errors
        }
        config.cleanup();
    });

    /**
     * Helper: Create test data with market research results
     */
    async function createTestDataWithResearchResults(options: {
        taskId: string;
        actionId: string;
        actions: any[];
        token: string;
        tokenExpiredTime: Date;
        projectData?: {
            description?: string;
            concept?: string;
            goal?: string;
            target?: string;
            kpi?: { [key: string]: any };
        };
        marketResearchData?: MarketResearchData | null;
        actionIndex?: number;
    }) {
        const now = new Date();
        const nowTs = toTimestamp(now);
        const tokenExpiredTs = toTimestamp(options.tokenExpiredTime);
        const organizationRef = firestore.doc(organizationPath);
        const projectRef = firestore.doc(projectPath);
        const taskPath = `plugins/workflow/task/${options.taskId}`;
        const actionPath = `plugins/workflow/action/${options.actionId}`;
        const taskRef = firestore.doc(taskPath);
        const actionRef = firestore.doc(actionPath);

        // Create Organization
        await organizationRef.save({
            "@uid": testOrganizationId,
            "@time": nowTs,
            name: "Test Organization",
            "createdTime": new ModelTimestamp(nowTs.toDate()),
            "updatedTime": new ModelTimestamp(nowTs.toDate()),
        });

        // Create Project with market research target data
        const projectSaveData: { [key: string]: any } = {
            "@uid": testProjectId,
            "@time": nowTs,
            name: "Test Project",
            organization: organizationRef,
            "createdTime": new ModelTimestamp(nowTs.toDate()),
            "updatedTime": new ModelTimestamp(nowTs.toDate()),
        };
        if (options.projectData?.description !== undefined) {
            projectSaveData.description = options.projectData.description;
        }
        if (options.projectData?.concept !== undefined) {
            projectSaveData.concept = options.projectData.concept;
        }
        if (options.projectData?.goal !== undefined) {
            projectSaveData.goal = options.projectData.goal;
        }
        if (options.projectData?.target !== undefined) {
            projectSaveData.target = options.projectData.target;
        }
        if (options.projectData?.kpi !== undefined) {
            projectSaveData.kpi = options.projectData.kpi;
        }
        await projectRef.save(projectSaveData);

        // Create Task with results (including marketResearchData)
        const taskResults: { [key: string]: any } = {};
        if (options.marketResearchData !== null && options.marketResearchData !== undefined) {
            taskResults.marketResearchData = options.marketResearchData;
        }

        await taskRef.save({
            "@uid": options.taskId,
            "@time": nowTs,
            organization: organizationRef,
            project: projectRef,
            status: "running",
            actions: options.actions,
            usage: 0,
            results: taskResults,
            "createdTime": new ModelTimestamp(nowTs.toDate()),
            "updatedTime": new ModelTimestamp(nowTs.toDate()),
        });

        // Create Action
        const actionIndex = options.actionIndex ?? 0;
        await actionRef.save({
            "@uid": options.actionId,
            "@time": nowTs,
            command: options.actions[actionIndex],
            task: taskRef,
            organization: organizationRef,
            project: projectRef,
            status: "running",
            token: options.token,
            "tokenExpiredTime": new ModelTimestamp(tokenExpiredTs.toDate()),
            usage: 0,
            "createdTime": new ModelTimestamp(nowTs.toDate()),
            "updatedTime": new ModelTimestamp(nowTs.toDate()),
        });

        return { organizationRef, projectRef, taskRef, actionRef, taskPath, actionPath };
    }

    describe("Analysis with Valid Research Data", () => {
        it("should analyze with valid marketResearchData", async () => {
            const taskId = `test-analyze-valid-${Date.now()}`;
            const actionId = `test-action-analyze-valid-${Date.now()}`;
            const token = `test-token-analyze-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "analyze_market_research",
                index: 0,
            }];

            const projectData = {
                description: "AIを活用した個人向け健康管理アプリ。睡眠、運動、食事を総合的に分析し、パーソナライズされた健康アドバイスを提供する。",
                concept: "健康管理の民主化",
                goal: "2025年末までに月間アクティブユーザー100万人を達成",
                target: "20-40代の健康意識の高いビジネスパーソン",
                kpi: { mau: 1000000, retention_30d: 0.4 },
            };

            const refs = await createTestDataWithResearchResults({
                taskId,
                actionId,
                actions,
                token,
                tokenExpiredTime,
                projectData,
                marketResearchData: sampleMarketResearchData,
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/analyze_market_research");
                const wrapped = config.wrap(func([], {}, {}));

                await wrapped({
                    data: {
                        path: refs.actionPath,
                        token: token,
                    },
                    params: {},
                });

                // Verify results
                const taskDoc = await firestore.doc(refs.taskPath).load();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("completed");
                expect(taskData?.results).toBeDefined();
                expect(taskData?.results?.marketResearch).toBeDefined();

                const research: MarketResearch = taskData?.results?.marketResearch;

                // Verify structure
                expect(research.summary).toBeDefined();
                expect(research.demandForecast).toBeDefined();
                expect(research.demandForecast.currentDemand).toBeDefined();
                expect(research.demandForecast.threeMonthForecast).toBeDefined();
                expect(research.demandForecast.oneYearForecast).toBeDefined();
                expect(research.demandForecast.threeYearForecast).toBeDefined();
                expect(research.demandForecast.fiveYearForecast).toBeDefined();

                expect(research.revenueStrategies).toBeInstanceOf(Array);
                expect(research.trafficStrategies).toBeInstanceOf(Array);
                expect(research.keyInsights).toBeInstanceOf(Array);
                expect(research.researchData).toBeDefined();
                expect(research.generatedAt).toBeDefined();

                console.log("\n=== Market Research Analysis Results ===");
                console.log("Summary:", research.summary?.substring(0, 200) + "...");
                console.log("\n--- Demand Forecast ---");
                console.log("Current:", research.demandForecast?.currentDemand?.demandLevel);
                console.log("3 Months:", research.demandForecast?.threeMonthForecast?.demandLevel);
                console.log("1 Year:", research.demandForecast?.oneYearForecast?.demandLevel);
                console.log("Overall Trend:", research.demandForecast?.overallTrend);
                console.log("\n--- Revenue Strategies ---");
                console.log("Count:", research.revenueStrategies?.length);
                research.revenueStrategies?.slice(0, 2).forEach((s, i) => {
                    console.log(`  ${i + 1}. [${s.priority}] ${s.name}`);
                });
                console.log("\n--- Traffic Strategies ---");
                console.log("Count:", research.trafficStrategies?.length);
                console.log("\n--- Key Insights ---");
                console.log("Count:", research.keyInsights?.length);

                // Output full JSON for debugging
                console.log("\n========== FULL JSON: task.results.marketResearch ==========");
                console.log(JSON.stringify(research, null, 2));
                console.log("========== END JSON ==========\n");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => { });
                await firestore.doc(refs.taskPath).delete().catch(() => { });
            }
        }, 180000); // 3 minutes timeout
    });

    describe("Analysis without Research Data", () => {
        it("should fail when marketResearchData is missing", async () => {
            const taskId = `test-analyze-missing-${Date.now()}`;
            const actionId = `test-action-analyze-missing-${Date.now()}`;
            const token = `test-token-missing-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "analyze_market_research",
                index: 0,
            }];

            const projectData = {
                description: "テスト用プロジェクト",
            };

            const refs = await createTestDataWithResearchResults({
                taskId,
                actionId,
                actions,
                token,
                tokenExpiredTime,
                projectData,
                marketResearchData: null, // No research data
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/analyze_market_research");
                const wrapped = config.wrap(func([], {}, {}));

                await wrapped({
                    data: {
                        path: refs.actionPath,
                        token: token,
                    },
                    params: {},
                });

                // Verify results - should complete but with error in results
                const taskDoc = await firestore.doc(refs.taskPath).load();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("completed");
                expect(taskData?.results?.marketResearch).toBeDefined();
                expect(taskData?.results?.marketResearch?.error).toBeDefined();

                console.log("Missing data test completed successfully!");
                console.log("Error:", taskData?.results?.marketResearch?.error);

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => { });
                await firestore.doc(refs.taskPath).delete().catch(() => { });
            }
        }, 60000);
    });

    describe("Token Expired Error", () => {
        it("should fail with token-expired when tokenExpiredTime is in the past", async () => {
            const taskId = `test-analyze-expired-${Date.now()}`;
            const actionId = `test-action-analyze-expired-${Date.now()}`;
            const token = `test-token-expired-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

            const actions = [{
                command: "analyze_market_research",
                index: 0,
            }];

            const projectData = {
                description: "テスト用プロジェクト",
            };

            const refs = await createTestDataWithResearchResults({
                taskId,
                actionId,
                actions,
                token,
                tokenExpiredTime,
                projectData,
                marketResearchData: sampleMarketResearchData,
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/analyze_market_research");
                const wrapped = config.wrap(func([], {}, {}));

                await wrapped({
                    data: {
                        path: refs.actionPath,
                        token: token,
                    },
                    params: {},
                });

                // Verify Task - should be failed
                const taskDoc = await firestore.doc(refs.taskPath).load();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("failed");
                expect(taskData?.error?.message).toBe("token-expired");

                console.log("Token expired test completed successfully!");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => { });
                await firestore.doc(refs.taskPath).delete().catch(() => { });
            }
        }, 60000);
    });

    describe("Invalid Token Error", () => {
        it("should fail with invalid-token when token does not match", async () => {
            const taskId = `test-analyze-invalid-${Date.now()}`;
            const actionId = `test-action-analyze-invalid-${Date.now()}`;
            const storedToken = `stored-token-${Date.now()}`;
            const wrongToken = `wrong-token-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "analyze_market_research",
                index: 0,
            }];

            const projectData = {
                description: "テスト用プロジェクト",
            };

            const refs = await createTestDataWithResearchResults({
                taskId,
                actionId,
                actions,
                token: storedToken,
                tokenExpiredTime,
                projectData,
                marketResearchData: sampleMarketResearchData,
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/analyze_market_research");
                const wrapped = config.wrap(func([], {}, {}));

                await wrapped({
                    data: {
                        path: refs.actionPath,
                        token: wrongToken, // Wrong token
                    },
                    params: {},
                });

                // Verify Task - should be failed
                const taskDoc = await firestore.doc(refs.taskPath).load();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("failed");
                expect(taskData?.error?.message).toBe("invalid-token");

                console.log("Invalid token test completed successfully!");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => { });
                await firestore.doc(refs.taskPath).delete().catch(() => { });
            }
        }, 60000);
    });
});
