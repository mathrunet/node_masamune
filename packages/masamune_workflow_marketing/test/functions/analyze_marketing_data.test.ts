/**
 * AnalyzeMarketingData Integration Tests
 *
 * Tests using firebase-functions-test with actual Firebase/Firestore.
 * This test runs AFTER data collection tests to use accumulated live data.
 *
 * Required:
 * - Service account: test/mathru-net-39425d37638c.json
 * - Environment variables in test/.env
 * - Live data from previous data collection tests
 */

import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { ModelTimestamp } from "@mathrunet/masamune";
import "@mathrunet/masamune";

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

// Test configuration from .env
const googlePlayPackageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || "net.mathru.nansuru";
const googlePlayServiceAccountPath = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH || "test/mathru-net-27ae75a92bc7.json";
const firebaseAnalyticsPropertyId = process.env.FIREBASE_ANALYTICS_PROPERTY_ID || "properties/459007991";
const appStoreKeyId = process.env.APP_STORE_KEY_ID || "48T4WJHF5B";
const appStoreIssuerId = process.env.APP_STORE_ISSUER_ID || "69a6de82-60ca-47e3-e053-5b8c7c11a4d1";
const appStorePrivateKeyPath = process.env.APP_STORE_PRIVATE_KEY_PATH || "./AuthKey_48T4WJHF5B.p8";
const appStoreAppId = process.env.APP_STORE_APP_ID || "6692619607";
const appStoreVendorNumber = process.env.APP_STORE_VENDOR_NUMBER || "93702699";

// Generate unique IDs for test data
const testTimestamp = Date.now();
const testOrganizationId = `test-org-analyze-${testTimestamp}`;
const testProjectId = `test-project-analyze-${testTimestamp}`;

// Firestore paths
const organizationPath = `plugins/workflow/organization/${testOrganizationId}`;
const projectPath = `plugins/workflow/project/${testProjectId}`;

describe("AnalyzeMarketingData Integration Tests", () => {
    let firestore: admin.firestore.Firestore;
    let googlePlayServiceAccount: string;
    let appStorePrivateKey: string;

    beforeAll(() => {
        firestore = admin.firestore();

        // Load Google Play service account JSON
        const projectRoot = path.join(__dirname, "..", "..");
        const saPath = path.join(projectRoot, googlePlayServiceAccountPath);
        if (fs.existsSync(saPath)) {
            googlePlayServiceAccount = fs.readFileSync(saPath, "utf-8");
        } else {
            console.warn(`Service account not found: ${saPath}`);
        }

        // Load App Store private key
        const testDir = path.join(__dirname, "..");
        const keyPath = path.join(testDir, appStorePrivateKeyPath.replace(/^\.\//, ""));
        if (fs.existsSync(keyPath)) {
            appStorePrivateKey = fs.readFileSync(keyPath, "utf-8");
        } else {
            console.warn(`App Store private key not found: ${keyPath}`);
        }
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
     * Helper: Create test data with accumulated results
     */
    async function createTestDataWithResults(options: {
        taskId: string;
        actionId: string;
        actions: any[];
        token: string;
        tokenExpiredTime: Date;
        accumulatedResults?: { [key: string]: any };
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

        // Create Project with all credentials
        await projectRef.save({
            "@uid": testProjectId,
            "@time": nowTs,
            name: "Test Project",
            organization: organizationRef,
            googleServiceAccount: googlePlayServiceAccount,
            appstoreIssuerId: appStoreIssuerId,
            appstoreAuthKeyId: appStoreKeyId,
            appstoreAuthKey: appStorePrivateKey,
            "createdTime": new ModelTimestamp(nowTs.toDate()),
            "updatedTime": new ModelTimestamp(nowTs.toDate()),
        });

        // Create Task with accumulated results
        await taskRef.save({
            "@uid": options.taskId,
            "@time": nowTs,
            organization: organizationRef,
            project: projectRef,
            status: "running",
            actions: options.actions,
            usage: 0,
            results: options.accumulatedResults || {},
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

    /**
     * Helper: Run a data collection function and return accumulated results
     */
    async function runDataCollectionFunction(
        funcPath: string,
        actionPath: string,
        token: string
    ): Promise<{ [key: string]: any }> {
        const func = require(funcPath);
        const wrapped = config.wrap(func([], {}, {}));

        await wrapped({
            data: {
                path: actionPath,
                token: token,
            },
            params: {},
        });

        // Get the task to retrieve accumulated results
        const actionDoc = await firestore.doc(actionPath).load();
        const actionData = actionDoc.data();
        const taskDoc = await actionData?.task?.load();
        const taskData = taskDoc?.data();

        return taskData?.results || {};
    }

    describe("Full Pipeline Test with Live Data", () => {
        it("should analyze data after collecting from all sources", async () => {
            if (!googlePlayServiceAccount) {
                console.warn("Skipping: Google Play service account not found");
                return;
            }

            const pipelineTaskId = `test-pipeline-${Date.now()}`;
            const token = `test-token-pipeline-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const dateRange = {
                startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            };

            // Define the full pipeline actions
            const actions = [
                {
                    command: "collect_from_google_play_console",
                    index: 0,
                    data: {
                        packageName: googlePlayPackageName,
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                    },
                },
                {
                    command: "collect_from_app_store",
                    index: 1,
                    data: {
                        appId: appStoreAppId,
                        vendorNumber: appStoreVendorNumber,
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                    },
                },
                {
                    command: "collect_from_firebase_analytics",
                    index: 2,
                    data: {
                        propertyId: firebaseAnalyticsPropertyId,
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                    },
                },
                {
                    command: "analyze_marketing_data",
                    index: 3,
                },
            ];

            let accumulatedResults: { [key: string]: any } = {};

            try {
                // Step 1: Collect from Google Play Console
                console.log("Step 1: Collecting from Google Play Console...");
                const gpActionId = `${pipelineTaskId}-gp`;
                const gpRefs = await createTestDataWithResults({
                    taskId: pipelineTaskId,
                    actionId: gpActionId,
                    actions,
                    token,
                    tokenExpiredTime,
                    accumulatedResults,
                    actionIndex: 0,
                });

                accumulatedResults = await runDataCollectionFunction(
                    "../../src/functions/collect_from_google_play_console",
                    gpRefs.actionPath,
                    token
                );
                console.log("Google Play Console data collected:", Object.keys(accumulatedResults));

                // Clean up action
                await firestore.doc(gpRefs.actionPath).delete().catch(() => {});

                // Step 2: Collect from App Store
                console.log("Step 2: Collecting from App Store...");
                const asActionId = `${pipelineTaskId}-as`;
                const asRefs = await createTestDataWithResults({
                    taskId: pipelineTaskId,
                    actionId: asActionId,
                    actions,
                    token,
                    tokenExpiredTime,
                    accumulatedResults,
                    actionIndex: 1,
                });

                // Update task with accumulated results
                await firestore.doc(asRefs.taskPath).update({
                    results: accumulatedResults,
                });

                accumulatedResults = await runDataCollectionFunction(
                    "../../src/functions/collect_from_app_store",
                    asRefs.actionPath,
                    token
                );
                console.log("App Store data collected:", Object.keys(accumulatedResults));

                // Clean up action
                await firestore.doc(asRefs.actionPath).delete().catch(() => {});

                // Step 3: Collect from Firebase Analytics
                console.log("Step 3: Collecting from Firebase Analytics...");
                const faActionId = `${pipelineTaskId}-fa`;
                const faRefs = await createTestDataWithResults({
                    taskId: pipelineTaskId,
                    actionId: faActionId,
                    actions,
                    token,
                    tokenExpiredTime,
                    accumulatedResults,
                    actionIndex: 2,
                });

                // Update task with accumulated results
                await firestore.doc(faRefs.taskPath).update({
                    results: accumulatedResults,
                });

                accumulatedResults = await runDataCollectionFunction(
                    "../../src/functions/collect_from_firebase_analytics",
                    faRefs.actionPath,
                    token
                );
                console.log("Firebase Analytics data collected:", Object.keys(accumulatedResults));

                // Clean up action
                await firestore.doc(faRefs.actionPath).delete().catch(() => {});

                // Step 4: Analyze Marketing Data
                console.log("Step 4: Analyzing marketing data with AI...");
                const analyzeActionId = `${pipelineTaskId}-analyze`;
                const analyzeRefs = await createTestDataWithResults({
                    taskId: pipelineTaskId,
                    actionId: analyzeActionId,
                    actions,
                    token,
                    tokenExpiredTime,
                    accumulatedResults,
                    actionIndex: 3,
                });

                // Update task with accumulated results
                await firestore.doc(analyzeRefs.taskPath).update({
                    results: accumulatedResults,
                });

                const analyzeFunc = require("../../src/functions/analyze_marketing_data");
                const analyzeWrapped = config.wrap(analyzeFunc([], {}, {}));

                await analyzeWrapped({
                    data: {
                        path: analyzeRefs.actionPath,
                        token: token,
                    },
                    params: {},
                });

                // Verify results
                const taskDoc = await firestore.doc(analyzeRefs.taskPath).load();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("completed");
                expect(taskData?.results).toBeDefined();
                expect(taskData?.results?.marketingAnalytics).toBeDefined();

                const analytics = taskData?.results?.marketingAnalytics;
                console.log("\n=== Marketing Analytics Results ===");
                console.log("\n--- Full JSON Output ---");
                console.log(JSON.stringify(analytics, null, 2));
                console.log("\n--- Summary ---");
                console.log("Generated at:", analytics?.generatedAt);

                if (analytics?.overallAnalysis) {
                    console.log("\n--- Overall Analysis ---");
                    console.log("Summary:", analytics.overallAnalysis.summary?.substring(0, 200) + "...");
                    console.log("Highlights:", analytics.overallAnalysis.highlights?.length || 0, "items");
                    console.log("Concerns:", analytics.overallAnalysis.concerns?.length || 0, "items");
                }

                if (analytics?.improvementSuggestions) {
                    console.log("\n--- Improvement Suggestions ---");
                    console.log("Count:", analytics.improvementSuggestions.length);
                    analytics.improvementSuggestions.slice(0, 3).forEach((s: any, i: number) => {
                        console.log(`  ${i + 1}. [${s.priority}] ${s.title}`);
                    });
                }

                if (analytics?.trendAnalysis) {
                    console.log("\n--- Trend Analysis ---");
                    console.log("Predictions:", analytics.trendAnalysis.predictions?.length || 0, "items");
                }

                if (analytics?.reviewAnalysis) {
                    console.log("\n--- Review Analysis ---");
                    console.log("Sentiment:", JSON.stringify(analytics.reviewAnalysis.sentiment));
                    console.log("Common Themes:", analytics.reviewAnalysis.commonThemes?.length || 0, "items");
                }

                // Clean up
                await firestore.doc(analyzeRefs.actionPath).delete().catch(() => {});
                await firestore.doc(analyzeRefs.taskPath).delete().catch(() => {});

            } catch (error) {
                console.error("Pipeline test error:", error);
                throw error;
            }
        }, 300000); // 5 minutes timeout for full pipeline
    });

    describe("Empty Data Test", () => {
        it("should return empty marketingAnalytics when no data exists", async () => {
            const emptyTaskId = `test-empty-${Date.now()}`;
            const emptyActionId = `test-action-empty-${Date.now()}`;
            const token = `test-token-empty-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "analyze_marketing_data",
                index: 0,
            }];

            const refs = await createTestDataWithResults({
                taskId: emptyTaskId,
                actionId: emptyActionId,
                actions,
                token,
                tokenExpiredTime,
                accumulatedResults: {}, // Empty results
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/analyze_marketing_data");
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
                expect(taskData?.results?.marketingAnalytics).toBeDefined();
                expect(Object.keys(taskData?.results?.marketingAnalytics || {}).length).toBe(0);

                console.log("Empty data test completed successfully!");
                console.log("marketingAnalytics:", taskData?.results?.marketingAnalytics);
            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 60000);
    });

    describe("Partial Data Test", () => {
        it("should analyze with only Firebase Analytics data", async () => {
            if (!googlePlayServiceAccount) {
                console.warn("Skipping: Service account not found");
                return;
            }

            const partialTaskId = `test-partial-${Date.now()}`;
            const token = `test-token-partial-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const dateRange = {
                startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            };

            const actions = [
                {
                    command: "collect_from_firebase_analytics",
                    index: 0,
                    data: {
                        propertyId: firebaseAnalyticsPropertyId,
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                    },
                },
                {
                    command: "analyze_marketing_data",
                    index: 1,
                },
            ];

            let accumulatedResults: { [key: string]: any } = {};

            try {
                // Step 1: Collect from Firebase Analytics only
                console.log("Collecting from Firebase Analytics...");
                const faActionId = `${partialTaskId}-fa`;
                const faRefs = await createTestDataWithResults({
                    taskId: partialTaskId,
                    actionId: faActionId,
                    actions,
                    token,
                    tokenExpiredTime,
                    accumulatedResults,
                    actionIndex: 0,
                });

                accumulatedResults = await runDataCollectionFunction(
                    "../../src/functions/collect_from_firebase_analytics",
                    faRefs.actionPath,
                    token
                );
                console.log("Firebase Analytics collected:", Object.keys(accumulatedResults));

                await firestore.doc(faRefs.actionPath).delete().catch(() => {});

                // Step 2: Analyze with partial data
                console.log("Analyzing with partial data...");
                const analyzeActionId = `${partialTaskId}-analyze`;
                const analyzeRefs = await createTestDataWithResults({
                    taskId: partialTaskId,
                    actionId: analyzeActionId,
                    actions,
                    token,
                    tokenExpiredTime,
                    accumulatedResults,
                    actionIndex: 1,
                });

                await firestore.doc(analyzeRefs.taskPath).update({
                    results: accumulatedResults,
                });

                const analyzeFunc = require("../../src/functions/analyze_marketing_data");
                const analyzeWrapped = config.wrap(analyzeFunc([], {}, {}));

                await analyzeWrapped({
                    data: {
                        path: analyzeRefs.actionPath,
                        token: token,
                    },
                    params: {},
                });

                // Verify results
                const taskDoc = await firestore.doc(analyzeRefs.taskPath).load();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("completed");
                expect(taskData?.results?.marketingAnalytics).toBeDefined();
                expect(taskData?.results?.marketingAnalytics?.generatedAt).toBeDefined();

                console.log("Partial data test completed successfully!");
                console.log("Analytics generated with only Firebase data");

                await firestore.doc(analyzeRefs.actionPath).delete().catch(() => {});
                await firestore.doc(analyzeRefs.taskPath).delete().catch(() => {});

            } catch (error) {
                console.error("Partial data test error:", error);
                throw error;
            }
        }, 180000); // 3 minutes timeout
    });

    describe("Token Expired Error", () => {
        it("should fail with token-expired when tokenExpiredTime is in the past", async () => {
            const expiredTaskId = `test-expired-analyze-${Date.now()}`;
            const expiredActionId = `test-action-expired-analyze-${Date.now()}`;
            const token = `test-token-expired-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

            const actions = [{
                command: "analyze_marketing_data",
                index: 0,
            }];

            const refs = await createTestDataWithResults({
                taskId: expiredTaskId,
                actionId: expiredActionId,
                actions,
                token,
                tokenExpiredTime,
                accumulatedResults: { firebaseAnalytics: { dau: 100 } },
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/analyze_marketing_data");
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
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 60000);
    });

    describe("Invalid Token Error", () => {
        it("should fail with invalid-token when token does not match", async () => {
            const invalidTaskId = `test-invalid-analyze-${Date.now()}`;
            const invalidActionId = `test-action-invalid-analyze-${Date.now()}`;
            const storedToken = `stored-token-${Date.now()}`;
            const wrongToken = `wrong-token-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "analyze_marketing_data",
                index: 0,
            }];

            const refs = await createTestDataWithResults({
                taskId: invalidTaskId,
                actionId: invalidActionId,
                actions,
                token: storedToken,
                tokenExpiredTime,
                accumulatedResults: { firebaseAnalytics: { dau: 100 } },
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/analyze_marketing_data");
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
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 60000);
    });

    describe("Market Research Data Integration Test", () => {
        /**
         * Mock market research data for testing
         */
        const mockMarketResearchData = {
            marketPotential: {
                summary: "モバイルアプリ市場は急成長中で、特に生産性向上ツールの需要が高まっています。",
                tam: "500億円",
                sam: "100億円",
                som: "10億円",
                marketDrivers: [
                    "リモートワークの普及",
                    "デジタルトランスフォーメーションの加速",
                    "スマートフォン普及率の向上",
                ],
                marketBarriers: [
                    "競合他社の多さ",
                    "ユーザー獲得コストの上昇",
                ],
                targetSegments: [
                    "20-40代のビジネスパーソン",
                    "フリーランス・個人事業主",
                ],
            },
            competitorAnalysis: {
                competitors: [
                    {
                        name: "競合A社",
                        description: "市場シェアトップの大手サービス",
                        marketShare: "35%",
                        strengths: ["ブランド認知度", "機能の豊富さ"],
                        weaknesses: ["価格が高い", "UIが複雑"],
                        pricing: "月額1,500円〜",
                        targetAudience: "大企業向け",
                    },
                    {
                        name: "競合B社",
                        description: "急成長中のスタートアップ",
                        marketShare: "15%",
                        strengths: ["シンプルなUI", "低価格"],
                        weaknesses: ["機能が限定的", "サポートが弱い"],
                        pricing: "月額500円〜",
                        targetAudience: "中小企業・個人向け",
                    },
                ],
                marketLandscape: "市場は成熟期に入りつつあるが、差別化されたニッチサービスには成長余地がある。",
                competitiveAdvantages: [
                    "独自のAI機能",
                    "日本市場に特化したローカライゼーション",
                ],
                differentiationOpportunities: [
                    "オフライン機能の強化",
                    "他サービスとの連携強化",
                ],
                marketGaps: [
                    "中小企業向けの手頃な価格帯",
                    "多言語サポート",
                ],
            },
            businessOpportunities: [
                {
                    title: "サブスクリプションモデルの導入",
                    description: "月額課金モデルを導入し、安定的な収益基盤を構築",
                    type: "monetization" as const,
                    potentialImpact: "high" as const,
                    timeframe: "short_term" as const,
                    requirements: ["決済システムの実装", "料金プランの設計"],
                    risks: ["既存ユーザーの離脱", "価格設定の難しさ"],
                },
                {
                    title: "企業向け機能の拡充",
                    description: "チーム管理機能やAPI連携を追加し、B2B市場を開拓",
                    type: "market_gap" as const,
                    potentialImpact: "high" as const,
                    timeframe: "medium_term" as const,
                    requirements: ["管理機能の開発", "セキュリティ強化"],
                    risks: ["開発コスト", "営業体制の構築"],
                },
            ],
            dataSources: [
                "https://example.com/market-report-2024",
                "https://example.com/competitor-analysis",
            ],
            generatedAt: new Date().toISOString(),
        };

        const mockMarketResearch = {
            summary: "市場調査の結果、当アプリは成長市場において良好なポジションにあり、戦略的な投資により大きな成長が見込めます。",
            demandForecast: {
                currentDemand: {
                    period: "現在",
                    demandLevel: "medium" as const,
                    estimatedMarketSize: "50億円",
                    growthRate: "15%",
                    keyFactors: ["リモートワーク需要", "デジタル化推進"],
                    confidence: "high" as const,
                },
                threeMonthForecast: {
                    period: "3ヶ月後",
                    demandLevel: "high" as const,
                    estimatedMarketSize: "55億円",
                    growthRate: "18%",
                    keyFactors: ["新年度開始", "企業のIT投資増加"],
                    confidence: "high" as const,
                },
                oneYearForecast: {
                    period: "1年後",
                    demandLevel: "high" as const,
                    estimatedMarketSize: "70億円",
                    growthRate: "20%",
                    keyFactors: ["市場成熟", "新規参入増加"],
                    confidence: "medium" as const,
                },
                threeYearForecast: {
                    period: "3年後",
                    demandLevel: "very_high" as const,
                    estimatedMarketSize: "120億円",
                    growthRate: "25%",
                    keyFactors: ["AI技術の進化", "ワークスタイル変革"],
                    confidence: "medium" as const,
                },
                fiveYearForecast: {
                    period: "5年後",
                    demandLevel: "very_high" as const,
                    estimatedMarketSize: "200億円",
                    growthRate: "20%",
                    keyFactors: ["市場飽和", "次世代技術"],
                    confidence: "low" as const,
                },
                overallTrend: "growing" as const,
                summary: "市場は今後5年間で約4倍に成長する見込み。特に企業向けソリューションの需要が高まる。",
            },
            revenueStrategies: [
                {
                    name: "プレミアムプランの導入",
                    description: "高度な機能を含むプレミアムプランを新設",
                    type: "monetization" as const,
                    priority: "high" as const,
                    expectedImpact: "月間収益20%増加",
                    implementationSteps: ["機能設計", "価格設定", "マーケティング"],
                    kpiMetrics: ["有料転換率", "ARPU", "解約率"],
                    timeline: "3ヶ月",
                },
            ],
            trafficStrategies: [
                {
                    name: "コンテンツマーケティング強化",
                    description: "ブログ・SNSでの情報発信を強化",
                    channel: "content_marketing" as const,
                    priority: "high" as const,
                    expectedImpact: "オーガニック流入50%増加",
                    implementationSteps: ["コンテンツ計画策定", "記事作成", "SEO最適化"],
                    estimatedCost: "月額30万円",
                    timeline: "6ヶ月",
                },
            ],
            keyInsights: [
                "市場は成長期にあり、早期参入のメリットが大きい",
                "競合との差別化にはAI機能の強化が有効",
                "B2B市場への展開が収益拡大の鍵",
            ],
            researchData: mockMarketResearchData,
            generatedAt: new Date().toISOString(),
        };

        it("should include competitive positioning and market opportunity analysis when market research data is present", async () => {
            const marketTestTaskId = `test-market-${Date.now()}`;
            const marketTestActionId = `test-action-market-${Date.now()}`;
            const token = `test-token-market-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "analyze_marketing_data",
                index: 0,
            }];

            // Create accumulated results with market research data and some app data
            const accumulatedResults = {
                firebaseAnalytics: {
                    dau: 1500,
                    mau: 15000,
                    retention: {
                        day1: 0.45,
                        day7: 0.25,
                        day30: 0.12,
                    },
                    sessions: 25000,
                    avgSessionDuration: 320,
                },
                marketResearchData: mockMarketResearchData,
                marketResearch: mockMarketResearch,
            };

            const refs = await createTestDataWithResults({
                taskId: marketTestTaskId,
                actionId: marketTestActionId,
                actions,
                token,
                tokenExpiredTime,
                accumulatedResults,
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/analyze_marketing_data");
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
                expect(taskData?.results?.marketingAnalytics).toBeDefined();

                const analytics = taskData?.results?.marketingAnalytics;

                // Verify market data integration flag
                expect(analytics?.marketDataIntegrated).toBe(true);

                // Verify competitive positioning analysis
                expect(analytics?.competitivePositioning).toBeDefined();
                expect(analytics?.competitivePositioning?.marketPosition).toBeDefined();
                expect(analytics?.competitivePositioning?.competitorComparison).toBeInstanceOf(Array);
                expect(analytics?.competitivePositioning?.differentiationStrategy).toBeDefined();
                expect(analytics?.competitivePositioning?.quickWins).toBeInstanceOf(Array);

                // Verify market opportunity priority analysis
                expect(analytics?.marketOpportunityPriority).toBeDefined();
                expect(analytics?.marketOpportunityPriority?.prioritizedOpportunities).toBeInstanceOf(Array);
                expect(analytics?.marketOpportunityPriority?.strategicRecommendation).toBeDefined();

                console.log("\n=== Market Research Integration Test Results ===");
                console.log("Market Data Integrated:", analytics?.marketDataIntegrated);

                if (analytics?.competitivePositioning) {
                    console.log("\n--- Competitive Positioning ---");
                    console.log("Market Position:", analytics.competitivePositioning.marketPosition?.substring(0, 150) + "...");
                    console.log("Competitor Comparisons:", analytics.competitivePositioning.competitorComparison?.length || 0, "items");
                    analytics.competitivePositioning.competitorComparison?.slice(0, 2).forEach((c: any, i: number) => {
                        console.log(`  ${i + 1}. ${c.competitor}`);
                        console.log(`     Strengths: ${c.ourStrengths?.slice(0, 2).join(", ")}`);
                        console.log(`     Weaknesses: ${c.ourWeaknesses?.slice(0, 2).join(", ")}`);
                    });
                    console.log("Quick Wins:", analytics.competitivePositioning.quickWins?.length || 0, "items");
                }

                if (analytics?.marketOpportunityPriority) {
                    console.log("\n--- Market Opportunity Priority ---");
                    console.log("Prioritized Opportunities:", analytics.marketOpportunityPriority.prioritizedOpportunities?.length || 0, "items");
                    analytics.marketOpportunityPriority.prioritizedOpportunities?.slice(0, 3).forEach((o: any, i: number) => {
                        console.log(`  ${i + 1}. [${o.fitScore}] ${o.opportunity}`);
                        console.log(`     Effort: ${o.estimatedEffort}, Action: ${o.recommendedAction?.substring(0, 50)}...`);
                    });
                    console.log("Strategic Recommendation:", analytics.marketOpportunityPriority.strategicRecommendation?.substring(0, 200) + "...");
                }

                console.log("\nMarket research integration test completed successfully!");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 180000); // 3 minutes timeout

        it("should work with only marketResearchData (without marketResearch)", async () => {
            const partialMarketTaskId = `test-partial-market-${Date.now()}`;
            const partialMarketActionId = `test-action-partial-market-${Date.now()}`;
            const token = `test-token-partial-market-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "analyze_marketing_data",
                index: 0,
            }];

            // Only marketResearchData, no marketResearch
            const accumulatedResults = {
                firebaseAnalytics: {
                    dau: 1000,
                    mau: 10000,
                },
                marketResearchData: mockMarketResearchData,
            };

            const refs = await createTestDataWithResults({
                taskId: partialMarketTaskId,
                actionId: partialMarketActionId,
                actions,
                token,
                tokenExpiredTime,
                accumulatedResults,
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/analyze_marketing_data");
                const wrapped = config.wrap(func([], {}, {}));

                await wrapped({
                    data: {
                        path: refs.actionPath,
                        token: token,
                    },
                    params: {},
                });

                const taskDoc = await firestore.doc(refs.taskPath).load();
                const taskData = taskDoc.data();

                expect(taskData?.status).toBe("completed");
                expect(taskData?.results?.marketingAnalytics?.marketDataIntegrated).toBe(true);
                expect(taskData?.results?.marketingAnalytics?.competitivePositioning).toBeDefined();
                expect(taskData?.results?.marketingAnalytics?.marketOpportunityPriority).toBeDefined();

                console.log("Partial market research data test completed successfully!");
                console.log("marketDataIntegrated:", taskData?.results?.marketingAnalytics?.marketDataIntegrated);

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 180000);

        it("should not include market analysis when market research data has error", async () => {
            const errorMarketTaskId = `test-error-market-${Date.now()}`;
            const errorMarketActionId = `test-action-error-market-${Date.now()}`;
            const token = `test-token-error-market-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "analyze_marketing_data",
                index: 0,
            }];

            // Market research data with error
            const accumulatedResults = {
                firebaseAnalytics: {
                    dau: 1000,
                    mau: 10000,
                },
                marketResearchData: {
                    error: "Failed to fetch market data",
                    generatedAt: new Date().toISOString(),
                },
            };

            const refs = await createTestDataWithResults({
                taskId: errorMarketTaskId,
                actionId: errorMarketActionId,
                actions,
                token,
                tokenExpiredTime,
                accumulatedResults,
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/analyze_marketing_data");
                const wrapped = config.wrap(func([], {}, {}));

                await wrapped({
                    data: {
                        path: refs.actionPath,
                        token: token,
                    },
                    params: {},
                });

                const taskDoc = await firestore.doc(refs.taskPath).load();
                const taskData = taskDoc.data();

                // デバッグ: タスクのステータスとエラーを確認
                console.log("Task status:", taskData?.status);
                if (taskData?.status === "failed") {
                    console.log("Task error:", JSON.stringify(taskData?.error, null, 2));
                }

                expect(taskData?.status).toBe("completed");
                expect(taskData?.results?.marketingAnalytics?.marketDataIntegrated).toBe(false);
                expect(taskData?.results?.marketingAnalytics?.competitivePositioning).toBeUndefined();
                expect(taskData?.results?.marketingAnalytics?.marketOpportunityPriority).toBeUndefined();

                console.log("Error market research data test completed successfully!");
                console.log("marketDataIntegrated:", taskData?.results?.marketingAnalytics?.marketDataIntegrated);

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 120000);
    });
});
