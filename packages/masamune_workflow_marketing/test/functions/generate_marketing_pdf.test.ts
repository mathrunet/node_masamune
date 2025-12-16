/**
 * GenerateMarketingPdf Integration Tests
 *
 * Tests using firebase-functions-test with actual Firebase/Firestore.
 * This test runs the FULL pipeline:
 * 1. Google Play Console data collection
 * 2. App Store data collection
 * 3. Firebase Analytics data collection
 * 4. GitHub Repository Analysis (init → process × N → summary)
 * 5. AI Analysis (with GitHub-aware improvements)
 * 6. PDF Generation (including code improvement suggestions)
 *
 * Required:
 * - Service account: test/mathru-net-39425d37638c.json
 * - Environment variables in test/.env
 * - GITHUB_TOKEN and GITHUB_REPO for GitHub analysis
 */

import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { ModelTimestamp } from "@mathrunet/masamune";
import "@mathrunet/masamune";
import { Action } from "@mathrunet/masamune_workflow";

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
        storageBucket: "mathru-net.appspot.com",
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

// GitHub configuration
const githubToken = process.env.GITHUB_TOKEN;
const githubRepo = process.env.GITHUB_REPO || "mathrunet/flutter_masamune";

// Generate unique IDs for test data
const testTimestamp = Date.now();
const testOrganizationId = `test-org-pdf-${testTimestamp}`;
const testProjectId = `test-project-pdf-${testTimestamp}`;

// Firestore paths
const organizationPath = `plugins/workflow/organization/${testOrganizationId}`;
const projectPath = `plugins/workflow/project/${testProjectId}`;

describe("GenerateMarketingPdf Integration Tests", () => {
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
            google_service_account: googlePlayServiceAccount,
            appstore_issuer_id: appStoreIssuerId,
            appstore_auth_key_id: appStoreKeyId,
            appstore_auth_key: appStorePrivateKey,
            github_personal_access_token: githubToken,
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
        const actionData = actionDoc.data() as Action;
        const taskDoc = await actionData?.task?.load();
        const taskData = taskDoc?.data();

        return taskData?.results || {};
    }

    /**
     * Helper: Copy PDF from Storage to local tmp directory
     */
    async function copyPdfToLocal(storagePath: string): Promise<string | null> {
        try {
            const storage = admin.storage().bucket("mathru-net.appspot.com");
            const file = storage.file(storagePath);
            const [buffer] = await file.download();

            const tmpDir = path.join(__dirname, "..", "tmp");
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }
            const localPath = path.join(tmpDir, "marketing_report.pdf");
            fs.writeFileSync(localPath, buffer);
            console.log(`PDF saved to: ${localPath}`);
            return localPath;
        } catch (error) {
            console.error("Failed to copy PDF to local:", error);
            return null;
        }
    }

    describe("Full Pipeline Test with Live Data", () => {
        it("should generate PDF after collecting from all sources and AI analysis", async () => {
            if (!googlePlayServiceAccount) {
                console.warn("Skipping: Google Play service account not found");
                return;
            }

            const pipelineTaskId = `test-pipeline-pdf-${Date.now()}`;
            const token = `test-token-pipeline-pdf-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const dateRange = {
                startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            };

            // Define the full pipeline actions
            // Note: analyze_github_init will dynamically add process and summary actions
            const actions: any[] = [
                {
                    command: "collect_from_google_play_console",
                    index: 0,
                    packageName: googlePlayPackageName,
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
                },
                {
                    command: "collect_from_app_store",
                    index: 1,
                    appId: appStoreAppId,
                    vendorNumber: appStoreVendorNumber,
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
                },
                {
                    command: "collect_from_firebase_analytics",
                    index: 2,
                    propertyId: firebaseAnalyticsPropertyId,
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
                },
                // GitHub Analysis (init only - process/summary are dynamically added by init)
                {
                    command: "analyze_github_init",
                    index: 3,
                    githubRepository: githubRepo,
                },
                {
                    command: "analyze_marketing_data",
                    index: 4,
                },
                {
                    command: "generate_marketing_pdf",
                    index: 5,
                    reportType: "weekly",
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
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

                await firestore.doc(gpRefs.actionPath).delete().catch(() => { });

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

                await firestore.doc(asRefs.taskPath).update({
                    results: accumulatedResults,
                });

                accumulatedResults = await runDataCollectionFunction(
                    "../../src/functions/collect_from_app_store",
                    asRefs.actionPath,
                    token
                );
                console.log("App Store data collected:", Object.keys(accumulatedResults));

                await firestore.doc(asRefs.actionPath).delete().catch(() => { });

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

                await firestore.doc(faRefs.taskPath).update({
                    results: accumulatedResults,
                });

                accumulatedResults = await runDataCollectionFunction(
                    "../../src/functions/collect_from_firebase_analytics",
                    faRefs.actionPath,
                    token
                );
                console.log("Firebase Analytics data collected:", Object.keys(accumulatedResults));

                await firestore.doc(faRefs.actionPath).delete().catch(() => { });

                // Step 4: Analyze GitHub Repository
                let currentActions = actions;
                if (githubToken) {
                    console.log("Step 4: Analyzing GitHub repository...");

                    // 4a: Run analyze_github_init
                    const ghInitActionId = `${pipelineTaskId}-gh-init`;
                    const ghInitRefs = await createTestDataWithResults({
                        taskId: pipelineTaskId,
                        actionId: ghInitActionId,
                        actions,
                        token,
                        tokenExpiredTime,
                        accumulatedResults,
                        actionIndex: 3,
                    });

                    await firestore.doc(ghInitRefs.taskPath).update({
                        results: accumulatedResults,
                    });

                    accumulatedResults = await runDataCollectionFunction(
                        "../../src/functions/analyze_github_init",
                        ghInitRefs.actionPath,
                        token
                    );
                    console.log("  GitHub Init completed:", Object.keys(accumulatedResults));
                    await firestore.doc(ghInitRefs.actionPath).delete().catch(() => { });

                    // 4b: Run analyze_github_process for each batch
                    // Use batchCount from init result to build process actions
                    const initResult = accumulatedResults.githubAnalysisInit;
                    const batchCount = initResult?.batchCount || 0;
                    console.log("  Batch count from init result:", batchCount);

                    // Build updated actions array manually (since Firestore may have caching issues)
                    // Limit batches for testing to prevent timeout (process only first 10 batches)
                    const maxBatchesForTest = 10;
                    const actualBatchCount = Math.min(batchCount, maxBatchesForTest);
                    if (batchCount > maxBatchesForTest) {
                        console.log(`  Limiting batches from ${batchCount} to ${maxBatchesForTest} for test performance`);
                    }
                    const processActionsToRun: any[] = [];
                    const initIndex = 3;
                    for (let i = 0; i < actualBatchCount; i++) {
                        processActionsToRun.push({
                            command: "analyze_github_process",
                            index: initIndex + 1 + i,
                            githubRepository: githubRepo,
                            batchIndex: i,
                        });
                    }
                    const summaryActionToRun = {
                        command: "analyze_github_summary",
                        index: initIndex + 1 + actualBatchCount,
                        githubRepository: githubRepo,
                    };

                    // Build full updated actions array
                    const updatedActions = [
                        ...actions.slice(0, initIndex + 1), // original actions up to and including init
                        ...processActionsToRun,
                        summaryActionToRun,
                        { command: "analyze_marketing_data", index: initIndex + 2 + actualBatchCount },
                        { command: "generate_marketing_pdf", index: initIndex + 3 + actualBatchCount, reportType: "weekly" },
                    ];
                    currentActions = updatedActions;

                    console.log("  Updated actions count:", updatedActions.length);
                    console.log("  Process actions count:", processActionsToRun.length);

                    for (let i = 0; i < processActionsToRun.length; i++) {
                        const processAction = processActionsToRun[i];
                        console.log(`  Processing batch ${i + 1}/${processActionsToRun.length}...`);

                        const ghProcessActionId = `${pipelineTaskId}-gh-process-${i}`;
                        const ghProcessRefs = await createTestDataWithResults({
                            taskId: pipelineTaskId,
                            actionId: ghProcessActionId,
                            actions: updatedActions,
                            token,
                            tokenExpiredTime,
                            accumulatedResults,
                            actionIndex: processAction.index,
                        });

                        await firestore.doc(ghProcessRefs.taskPath).update({
                            results: accumulatedResults,
                        });

                        accumulatedResults = await runDataCollectionFunction(
                            "../../src/functions/analyze_github_process",
                            ghProcessRefs.actionPath,
                            token
                        );
                        await firestore.doc(ghProcessRefs.actionPath).delete().catch(() => { });
                    }

                    // 4c: Run analyze_github_summary
                    if (actualBatchCount > 0) {
                        console.log("  Generating GitHub summary...");
                        const ghSummaryActionId = `${pipelineTaskId}-gh-summary`;
                        const ghSummaryRefs = await createTestDataWithResults({
                            taskId: pipelineTaskId,
                            actionId: ghSummaryActionId,
                            actions: updatedActions,
                            token,
                            tokenExpiredTime,
                            accumulatedResults,
                            actionIndex: summaryActionToRun.index,
                        });

                        await firestore.doc(ghSummaryRefs.taskPath).update({
                            results: accumulatedResults,
                        });

                        accumulatedResults = await runDataCollectionFunction(
                            "../../src/functions/analyze_github_summary",
                            ghSummaryRefs.actionPath,
                            token
                        );
                        console.log("  GitHub Analysis completed:", Object.keys(accumulatedResults));
                        await firestore.doc(ghSummaryRefs.actionPath).delete().catch(() => { });
                    }
                } else {
                    console.warn("Step 4: Skipping GitHub analysis - No GITHUB_TOKEN");
                }

                // Step 4.5: Add Market Research Data (mock data for Nansuru)
                console.log("Step 4.5: Adding market research data...");
                accumulatedResults.marketResearchData = {
                    marketPotential: {
                        summary: "日本の家計簿・資産管理アプリ市場は成長を続けており、特に若年層とデジタルネイティブ世代での利用が拡大している。Nansuruは家族での共有機能に強みを持ち、競合との差別化が可能。",
                        tam: "約500億円（日本の個人向け資産管理ソフトウェア市場）",
                        sam: "約150億円（スマートフォン向け家計簿アプリ市場）",
                        som: "約15億円（家族向け家計簿共有アプリセグメント）",
                        marketDrivers: [
                            "キャッシュレス決済の普及による支出管理ニーズの増加",
                            "物価上昇による家計管理意識の高まり",
                            "共働き世帯の増加による家計共有ニーズ",
                            "新NISA制度導入による資産運用への関心増加",
                        ],
                        marketBarriers: [
                            "無料アプリとの競争激化",
                            "銀行公式アプリの機能強化",
                            "セキュリティ・プライバシー懸念",
                        ],
                        targetSegments: [
                            "20-40代の共働き夫婦",
                            "子育て世代の家族",
                            "資産形成に関心のある若年層",
                        ],
                    },
                    competitorAnalysis: {
                        competitors: [
                            {
                                name: "マネーフォワード ME",
                                description: "日本最大の個人向け資産管理アプリ。銀行口座やクレジットカードとの連携が強み。",
                                marketShare: "約35%",
                                strengths: ["豊富な金融機関連携", "ブランド認知度", "法人向けサービスとのシナジー"],
                                weaknesses: ["プレミアム機能の価格が高い", "UIが複雑"],
                                pricing: "基本無料、プレミアム月額500円",
                                targetAudience: "資産管理に関心の高い個人",
                            },
                            {
                                name: "Zaim",
                                description: "シンプルな操作性を特徴とする家計簿アプリ。レシート読み取り機能が人気。",
                                marketShare: "約25%",
                                strengths: ["シンプルなUI", "レシート読み取り精度", "長年の実績"],
                                weaknesses: ["家族共有機能が弱い", "資産運用機能が限定的"],
                                pricing: "基本無料、プレミアム月額480円",
                                targetAudience: "手軽に家計管理したい個人",
                            },
                            {
                                name: "OsidOri",
                                description: "カップル・家族向けの家計共有アプリ。共同管理機能に特化。",
                                marketShare: "約5%",
                                strengths: ["カップル向け機能", "モダンなUI"],
                                weaknesses: ["ユーザー基盤が小さい", "金融機関連携が少ない"],
                                pricing: "基本無料、プレミアム月額480円",
                                targetAudience: "カップル、新婚夫婦",
                            },
                        ],
                        marketLandscape: "日本の家計簿アプリ市場は成熟期に入っており、上位2社（マネーフォワード、Zaim）が市場の大部分を占有。しかし、家族向け・共有機能に特化したニッチ市場には成長余地がある。",
                        competitiveAdvantages: [
                            "家族間での柔軟な共有設定",
                            "子供の金銭教育サポート機能",
                            "シンプルで直感的なUI",
                        ],
                        differentiationOpportunities: [
                            "家族向け予算管理・貯金目標共有機能の強化",
                            "子供向け金銭教育コンテンツの追加",
                            "家族イベント（旅行、大型購入）の共同貯金機能",
                        ],
                        marketGaps: [
                            "家族全員で使えるシンプルな共有機能",
                            "子供の金銭感覚を育てる教育的要素",
                            "世代間での資産情報共有（相続対策）",
                        ],
                    },
                    businessOpportunities: [
                        {
                            title: "家族向けプレミアムプラン",
                            description: "家族複数人での利用を前提としたプレミアムプランを導入。世帯単位での課金モデルにより、1人あたりの価格を抑えつつARPUを向上。",
                            type: "monetization",
                            potentialImpact: "high",
                            timeframe: "short_term",
                            requirements: ["課金システムの改修", "家族プラン専用機能の開発"],
                            risks: ["既存ユーザーの反発", "競合の追随"],
                        },
                        {
                            title: "金融機関とのAPI連携拡大",
                            description: "主要銀行・証券会社とのAPI連携を拡大し、自動的な資産状況の更新を実現。ユーザーの手間を削減し、継続利用率を向上。",
                            type: "product",
                            potentialImpact: "high",
                            timeframe: "medium_term",
                            requirements: ["API連携開発", "セキュリティ認証取得", "金融機関との交渉"],
                            risks: ["開発コスト", "金融機関の協力獲得の難しさ"],
                        },
                        {
                            title: "子供向け金融教育機能",
                            description: "子供にお小遣い管理や貯金の概念を教える教育機能を追加。家族利用の促進と差別化を同時に実現。",
                            type: "market_gap",
                            potentialImpact: "medium",
                            timeframe: "short_term",
                            requirements: ["子供向けUIの開発", "教育コンテンツの作成"],
                            risks: ["子供のプライバシー保護", "開発リソース"],
                        },
                    ],
                    dataSources: [
                        "App Annie 2024年日本アプリ市場レポート",
                        "総務省 家計調査年報",
                        "日本FP協会 家計管理実態調査",
                    ],
                    generatedAt: new Date().toISOString(),
                };
                console.log("Market research data added:", Object.keys(accumulatedResults.marketResearchData));

                // Step 5: Analyze Marketing Data
                console.log("Step 5: Analyzing marketing data with AI...");

                // Find analyze_marketing_data action in current actions
                const analyzeAction = currentActions.find(
                    (a: any) => a.command === "analyze_marketing_data"
                );
                const analyzeActionIndex = analyzeAction?.index ?? 4;

                const analyzeActionId = `${pipelineTaskId}-analyze`;
                const analyzeRefs = await createTestDataWithResults({
                    taskId: pipelineTaskId,
                    actionId: analyzeActionId,
                    actions: currentActions,
                    token,
                    tokenExpiredTime,
                    accumulatedResults,
                    actionIndex: analyzeActionIndex,
                });

                await firestore.doc(analyzeRefs.taskPath).update({
                    results: accumulatedResults,
                });

                accumulatedResults = await runDataCollectionFunction(
                    "../../src/functions/analyze_marketing_data",
                    analyzeRefs.actionPath,
                    token
                );
                console.log("AI Analysis completed:", Object.keys(accumulatedResults));

                await firestore.doc(analyzeRefs.actionPath).delete().catch(() => { });

                // Step 6: Generate Marketing PDF
                console.log("Step 6: Generating marketing PDF...");

                // Find generate_marketing_pdf action in current actions
                const pdfAction = currentActions.find(
                    (a: any) => a.command === "generate_marketing_pdf"
                );
                const pdfActionIndex = pdfAction?.index ?? 5;

                const pdfActionId = `${pipelineTaskId}-pdf`;
                const pdfRefs = await createTestDataWithResults({
                    taskId: pipelineTaskId,
                    actionId: pdfActionId,
                    actions: currentActions,
                    token,
                    tokenExpiredTime,
                    accumulatedResults,
                    actionIndex: pdfActionIndex,
                });

                await firestore.doc(pdfRefs.taskPath).update({
                    results: accumulatedResults,
                });

                const pdfFunc = require("../../src/functions/generate_marketing_pdf");
                const pdfWrapped = config.wrap(pdfFunc([], {}, {}));

                await pdfWrapped({
                    data: {
                        path: pdfRefs.actionPath,
                        token: token,
                    },
                    params: {},
                });

                // Verify results
                const taskDoc = await firestore.doc(pdfRefs.taskPath).load();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("completed");

                // Check for GitHub improvements in results
                console.log("\n=== GitHub Integration Results ===");
                console.log("githubRepository present:", !!accumulatedResults.githubRepository);
                console.log("githubImprovements present:", !!accumulatedResults.githubImprovements);

                // Detailed githubRepository logging
                if (accumulatedResults.githubRepository) {
                    const ghRepo = accumulatedResults.githubRepository;
                    console.log("\n--- GitHub Repository Analysis ---");
                    console.log("Repository:", ghRepo.repository || "N/A");
                    console.log("Framework:", ghRepo.framework || "N/A");
                    console.log("Platforms:", ghRepo.platforms?.join(", ") || "N/A");
                    console.log("Overview:", ghRepo.overview || "N/A");
                    console.log("Architecture:", ghRepo.architecture || "N/A");
                    if (ghRepo.features?.length) {
                        console.log(`Features (${ghRepo.features.length}):`);
                        ghRepo.features.slice(0, 5).forEach((f: any, i: number) => {
                            console.log(`  ${i + 1}. ${f.name}: ${f.description?.substring(0, 100)}...`);
                        });
                        if (ghRepo.features.length > 5) {
                            console.log(`  ... and ${ghRepo.features.length - 5} more features`);
                        }
                    }
                    if (ghRepo.folderStructure?.length) {
                        console.log(`Folder Structure (${ghRepo.folderStructure.length}):`);
                        ghRepo.folderStructure.slice(0, 5).forEach((f: any, i: number) => {
                            console.log(`  ${i + 1}. ${f.path}: ${f.summary?.substring(0, 80)}...`);
                        });
                        if (ghRepo.folderStructure.length > 5) {
                            console.log(`  ... and ${ghRepo.folderStructure.length - 5} more folders`);
                        }
                    }
                }

                // Detailed githubImprovements logging
                if (accumulatedResults.githubImprovements) {
                    const ghImprov = accumulatedResults.githubImprovements;
                    console.log("\n--- GitHub Improvement Suggestions ---");
                    console.log("Total Improvements:", ghImprov.improvements?.length || 0);
                    if (ghImprov.improvements?.length) {
                        ghImprov.improvements.forEach((imp: any, i: number) => {
                            console.log(`\n  [Improvement ${i + 1}]`);
                            console.log(`    Category: ${imp.category || "N/A"}`);
                            console.log(`    Priority: ${imp.priority || "N/A"}`);
                            console.log(`    Title: ${imp.title || "N/A"}`);
                            console.log(`    Description: ${imp.description?.substring(0, 150)}...`);
                            if (imp.codeReferences?.length) {
                                console.log(`    Code References (${imp.codeReferences.length}):`);
                                imp.codeReferences.slice(0, 3).forEach((ref: any, j: number) => {
                                    console.log(`      ${j + 1}. ${ref.filePath}:${ref.lineNumber || "?"} - ${ref.description?.substring(0, 60)}...`);
                                });
                                if (imp.codeReferences.length > 3) {
                                    console.log(`      ... and ${imp.codeReferences.length - 3} more references`);
                                }
                            }
                        });
                    }
                }

                // Check for PDF asset
                const actionDoc = await firestore.doc(pdfRefs.actionPath).load();
                const actionData = actionDoc.data();
                console.log("\n=== PDF Generation Results ===");
                console.log("Action assets:", actionData?.assets);

                const pdfPath = actionData?.assets?.marketingAnalyticsPdf;
                expect(pdfPath).toBeDefined();
                expect(pdfPath).not.toBe("");
                console.log("PDF Storage path:", pdfPath);

                // Copy PDF to local tmp directory for verification
                if (pdfPath) {
                    const localPath = await copyPdfToLocal(pdfPath);
                    if (localPath) {
                        console.log(`\nPDF copied to local: ${localPath}`);
                        console.log("You can open this file to verify the PDF content.");
                    }
                }

                // Clean up
                await firestore.doc(pdfRefs.actionPath).delete().catch(() => { });
                await firestore.doc(pdfRefs.taskPath).delete().catch(() => { });

                // Optionally clean up the uploaded PDF from Storage
                // (Comment out if you want to keep it for manual inspection)
                // if (pdfPath) {
                //     const storage = admin.storage().bucket("mathru-net.appspot.com");
                //     await storage.file(pdfPath).delete().catch(() => {});
                // }

            } catch (error) {
                console.error("Pipeline test error:", error);
                throw error;
            }
        }, 600000); // 10 minutes timeout (batches limited to 10 for test performance)
    });

    describe("Empty Data Test", () => {
        it("should return empty path when no data exists", async () => {
            const emptyTaskId = `test-empty-pdf-${Date.now()}`;
            const emptyActionId = `test-action-empty-pdf-${Date.now()}`;
            const token = `test-token-empty-pdf-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "generate_marketing_pdf",
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
                const func = require("../../src/functions/generate_marketing_pdf");
                const wrapped = config.wrap(func([], {}, {}));

                await wrapped({
                    data: {
                        path: refs.actionPath,
                        token: token,
                    },
                    params: {},
                });

                // Verify results
                const actionDoc = await firestore.doc(refs.actionPath).load();
                const actionData = actionDoc.data();

                expect(actionData).toBeDefined();
                expect(actionData?.assets?.marketingAnalyticsPdf).toBeDefined();
                expect(actionData?.assets?.marketingAnalyticsPdf).toBe("");

                console.log("Empty data test completed successfully!");
                console.log("marketingAnalyticsPdf:", actionData?.assets?.marketingAnalyticsPdf);
            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => { });
                await firestore.doc(refs.taskPath).delete().catch(() => { });
            }
        }, 60000);
    });

    describe("Token Expired Error", () => {
        it("should fail with token-expired when tokenExpiredTime is in the past", async () => {
            const expiredTaskId = `test-expired-pdf-${Date.now()}`;
            const expiredActionId = `test-action-expired-pdf-${Date.now()}`;
            const token = `test-token-expired-pdf-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

            const actions = [{
                command: "generate_marketing_pdf",
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
                const func = require("../../src/functions/generate_marketing_pdf");
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
            const invalidTaskId = `test-invalid-pdf-${Date.now()}`;
            const invalidActionId = `test-action-invalid-pdf-${Date.now()}`;
            const storedToken = `stored-token-pdf-${Date.now()}`;
            const wrongToken = `wrong-token-pdf-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "generate_marketing_pdf",
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
                const func = require("../../src/functions/generate_marketing_pdf");
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
        }, 1800000);
    });

    // describe("Market Research Data Tests", () => {
    //     it("should generate PDF with competitive positioning page", async () => {
    //         const taskId = `test-competitive-pdf-${Date.now()}`;
    //         const actionId = `test-action-competitive-pdf-${Date.now()}`;
    //         const token = `test-token-competitive-pdf-${Date.now()}`;
    //         const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

    //         const actions = [{
    //             command: "generate_marketing_pdf",
    //             index: 0,
    //         }];

    //         // Mock data with competitive positioning
    //         const accumulatedResults = {
    //             marketingAnalytics: {
    //                 overallAnalysis: {
    //                     healthScore: 75,
    //                     summary: "Test summary for competitive positioning PDF",
    //                     keyInsights: ["Insight 1", "Insight 2"],
    //                     criticalIssues: ["Issue 1"],
    //                 },
    //                 competitivePositioning: {
    //                     marketPosition: "The app is positioned as a mid-tier solution with strong feature differentiation.",
    //                     competitorComparison: [
    //                         {
    //                             competitor: "Competitor A",
    //                             ourStrengths: ["Better UI", "Faster performance"],
    //                             ourWeaknesses: ["Less features", "Higher price"],
    //                             battleStrategy: "Focus on user experience and speed",
    //                         },
    //                         {
    //                             competitor: "Competitor B",
    //                             ourStrengths: ["More integrations", "Better support"],
    //                             ourWeaknesses: ["Less brand recognition"],
    //                             battleStrategy: "Leverage integrations and customer success stories",
    //                         },
    //                     ],
    //                     differentiationStrategy: "Focus on unique AI-powered features and seamless integrations.",
    //                     quickWins: [
    //                         "Add comparison page highlighting advantages",
    //                         "Create case studies showcasing integration benefits",
    //                         "Implement free trial period",
    //                     ],
    //                 },
    //                 marketDataIntegrated: true,
    //                 generatedAt: new Date().toISOString(),
    //             },
    //         };

    //         const refs = await createTestDataWithResults({
    //             taskId,
    //             actionId,
    //             actions,
    //             token,
    //             tokenExpiredTime,
    //             accumulatedResults,
    //             actionIndex: 0,
    //         });

    //         try {
    //             const func = require("../../src/functions/generate_marketing_pdf");
    //             const wrapped = config.wrap(func([], {}, {}));

    //             await wrapped({
    //                 data: {
    //                     path: refs.actionPath,
    //                     token: token,
    //                 },
    //                 params: {},
    //             });

    //             // Verify results
    //             const actionDoc = await firestore.doc(refs.actionPath).load();
    //             const actionData = actionDoc.data();

    //             expect(actionData).toBeDefined();
    //             const pdfPath = actionData?.assets?.marketingAnalyticsPdf;
    //             expect(pdfPath).toBeDefined();
    //             expect(pdfPath).not.toBe("");

    //             console.log("Competitive positioning PDF test completed successfully!");
    //             console.log("PDF Storage path:", pdfPath);

    //             // Copy PDF to local for manual inspection
    //             if (pdfPath) {
    //                 const localPath = await copyPdfToLocal(pdfPath);
    //                 if (localPath) {
    //                     console.log(`\nPDF saved to: ${localPath}`);
    //                     console.log("Open this file to verify competitive positioning page is present.");
    //                 }
    //             }
    //         } finally {
    //             await firestore.doc(refs.actionPath).delete().catch(() => { });
    //             await firestore.doc(refs.taskPath).delete().catch(() => { });
    //         }
    //     }, 120000);

    //     it("should generate PDF with market opportunity priority page", async () => {
    //         const taskId = `test-opportunity-pdf-${Date.now()}`;
    //         const actionId = `test-action-opportunity-pdf-${Date.now()}`;
    //         const token = `test-token-opportunity-pdf-${Date.now()}`;
    //         const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

    //         const actions = [{
    //             command: "generate_marketing_pdf",
    //             index: 0,
    //         }];

    //         // Mock data with market opportunity priority
    //         const accumulatedResults = {
    //             marketingAnalytics: {
    //                 overallAnalysis: {
    //                     healthScore: 80,
    //                     summary: "Test summary for market opportunity PDF",
    //                     keyInsights: ["Insight 1"],
    //                     criticalIssues: [],
    //                 },
    //                 marketOpportunityPriority: {
    //                     prioritizedOpportunities: [
    //                         {
    //                             opportunity: "Enterprise market expansion",
    //                             fitScore: "excellent",
    //                             fitReason: "Current features align well with enterprise needs",
    //                             estimatedEffort: "medium",
    //                             requiredChanges: ["Add SSO support", "Implement audit logs", "Create admin dashboard"],
    //                             recommendedAction: "Prioritize SSO implementation and begin enterprise sales outreach",
    //                         },
    //                         {
    //                             opportunity: "API monetization",
    //                             fitScore: "good",
    //                             fitReason: "Strong API foundation exists but needs documentation",
    //                             estimatedEffort: "low",
    //                             requiredChanges: ["Improve API documentation", "Add usage metering"],
    //                             recommendedAction: "Create developer portal and implement usage-based pricing",
    //                         },
    //                         {
    //                             opportunity: "Mobile-first strategy",
    //                             fitScore: "moderate",
    //                             fitReason: "Current architecture is desktop-focused",
    //                             estimatedEffort: "high",
    //                             requiredChanges: ["Redesign responsive layouts", "Optimize for mobile performance"],
    //                             recommendedAction: "Consider in next major version planning",
    //                         },
    //                     ],
    //                     strategicRecommendation: "Focus on enterprise market expansion as the primary growth opportunity, followed by API monetization for additional revenue stream.",
    //                 },
    //                 marketDataIntegrated: true,
    //                 generatedAt: new Date().toISOString(),
    //             },
    //         };

    //         const refs = await createTestDataWithResults({
    //             taskId,
    //             actionId,
    //             actions,
    //             token,
    //             tokenExpiredTime,
    //             accumulatedResults,
    //             actionIndex: 0,
    //         });

    //         try {
    //             const func = require("../../src/functions/generate_marketing_pdf");
    //             const wrapped = config.wrap(func([], {}, {}));

    //             await wrapped({
    //                 data: {
    //                     path: refs.actionPath,
    //                     token: token,
    //                 },
    //                 params: {},
    //             });

    //             // Verify results
    //             const actionDoc = await firestore.doc(refs.actionPath).load();
    //             const actionData = actionDoc.data();

    //             expect(actionData).toBeDefined();
    //             const pdfPath = actionData?.assets?.marketingAnalyticsPdf;
    //             expect(pdfPath).toBeDefined();
    //             expect(pdfPath).not.toBe("");

    //             console.log("Market opportunity priority PDF test completed successfully!");
    //             console.log("PDF Storage path:", pdfPath);

    //             // Copy PDF to local for manual inspection
    //             if (pdfPath) {
    //                 const localPath = await copyPdfToLocal(pdfPath);
    //                 if (localPath) {
    //                     console.log(`\nPDF saved to: ${localPath}`);
    //                     console.log("Open this file to verify market opportunity priority page is present.");
    //                 }
    //             }
    //         } finally {
    //             await firestore.doc(refs.actionPath).delete().catch(() => { });
    //             await firestore.doc(refs.taskPath).delete().catch(() => { });
    //         }
    //     }, 120000);

    //     it("should generate PDF with both competitive positioning and market opportunity pages", async () => {
    //         const taskId = `test-both-pdf-${Date.now()}`;
    //         const actionId = `test-action-both-pdf-${Date.now()}`;
    //         const token = `test-token-both-pdf-${Date.now()}`;
    //         const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

    //         const actions = [{
    //             command: "generate_marketing_pdf",
    //             index: 0,
    //         }];

    //         // Mock data with both competitive positioning and market opportunity priority
    //         const accumulatedResults = {
    //             marketingAnalytics: {
    //                 overallAnalysis: {
    //                     healthScore: 85,
    //                     summary: "Test summary with full market research data",
    //                     keyInsights: ["Insight 1", "Insight 2"],
    //                     criticalIssues: [],
    //                 },
    //                 competitivePositioning: {
    //                     marketPosition: "Market leader in the niche segment.",
    //                     competitorComparison: [
    //                         {
    //                             competitor: "Main Rival",
    //                             ourStrengths: ["Better pricing", "More features"],
    //                             ourWeaknesses: ["Smaller community"],
    //                             battleStrategy: "Build community and showcase value",
    //                         },
    //                     ],
    //                     differentiationStrategy: "Focus on AI-driven automation.",
    //                     quickWins: ["Launch community forum", "Create tutorial videos"],
    //                 },
    //                 marketOpportunityPriority: {
    //                     prioritizedOpportunities: [
    //                         {
    //                             opportunity: "Global expansion",
    //                             fitScore: "excellent",
    //                             fitReason: "Product is already localized",
    //                             estimatedEffort: "medium",
    //                             requiredChanges: ["Add payment gateways", "Local marketing"],
    //                             recommendedAction: "Start with APAC region",
    //                         },
    //                     ],
    //                     strategicRecommendation: "Pursue global expansion while maintaining competitive advantage.",
    //                 },
    //                 marketDataIntegrated: true,
    //                 generatedAt: new Date().toISOString(),
    //             },
    //         };

    //         const refs = await createTestDataWithResults({
    //             taskId,
    //             actionId,
    //             actions,
    //             token,
    //             tokenExpiredTime,
    //             accumulatedResults,
    //             actionIndex: 0,
    //         });

    //         try {
    //             const func = require("../../src/functions/generate_marketing_pdf");
    //             const wrapped = config.wrap(func([], {}, {}));

    //             await wrapped({
    //                 data: {
    //                     path: refs.actionPath,
    //                     token: token,
    //                 },
    //                 params: {},
    //             });

    //             // Verify results
    //             const actionDoc = await firestore.doc(refs.actionPath).load();
    //             const actionData = actionDoc.data();

    //             expect(actionData).toBeDefined();
    //             const pdfPath = actionData?.assets?.marketingAnalyticsPdf;
    //             expect(pdfPath).toBeDefined();
    //             expect(pdfPath).not.toBe("");

    //             console.log("Both market research sections PDF test completed successfully!");
    //             console.log("PDF Storage path:", pdfPath);

    //             // Copy PDF to local for manual inspection
    //             // if (pdfPath) {
    //             //     const localPath = await copyPdfToLocal(pdfPath);
    //             //     if (localPath) {
    //             //         console.log(`\nPDF saved to: ${localPath}`);
    //             //         console.log("Open this file to verify both pages are present:");
    //             //         console.log("  - Competitive Positioning page");
    //             //         console.log("  - Market Opportunity Priority page");
    //             //     }
    //             // }
    //         } finally {
    //             await firestore.doc(refs.actionPath).delete().catch(() => { });
    //             await firestore.doc(refs.taskPath).delete().catch(() => { });
    //         }
    //     }, 120000);
    // });
});
