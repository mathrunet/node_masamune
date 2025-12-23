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
        locale?: string;
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
            githubPersonalAccessToken: githubToken,
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
        const actionData: any = {
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
        };
        if (options.locale) {
            actionData.locale = options.locale;
        }
        await actionRef.save(actionData);

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
    async function copyPdfToLocal(storagePath: string, locale?: string): Promise<string | null> {
        try {
            const storage = admin.storage().bucket("mathru-net.appspot.com");
            const file = storage.file(storagePath);
            const [buffer] = await file.download();

            const tmpDir = path.join(__dirname, "..", "tmp");
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }
            const filename = locale ? `marketing_report_${locale}.pdf` : "marketing_report.pdf";
            const localPath = path.join(tmpDir, filename);
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
                // GitHub Analysis (init only - process/summary are dynamically added by init)
                {
                    command: "analyze_github_init",
                    index: 3,
                    data: {
                        githubRepository: githubRepo,
                    },
                },
                {
                    command: "analyze_marketing_data",
                    index: 4,
                },
                {
                    command: "generate_marketing_pdf",
                    index: 5,
                    data: {
                        reportType: "weekly",
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                    },
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
                            data: {
                                githubRepository: githubRepo,
                                batchIndex: i,
                            },
                        });
                    }
                    const summaryActionToRun = {
                        command: "analyze_github_summary",
                        index: initIndex + 1 + actualBatchCount,
                        data: {
                            githubRepository: githubRepo,
                        },
                    };

                    // Build full updated actions array
                    const updatedActions = [
                        ...actions.slice(0, initIndex + 1), // original actions up to and including init
                        ...processActionsToRun,
                        summaryActionToRun,
                        { command: "analyze_marketing_data", index: initIndex + 2 + actualBatchCount },
                        { command: "generate_marketing_pdf", index: initIndex + 3 + actualBatchCount, data: { reportType: "weekly" } },
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
                        summary: "The Japanese household budget and asset management app market continues to grow, with expanding usage particularly among younger generations and digital natives. Nansuru has strengths in family sharing features and can differentiate from competitors.",
                        tam: "Approx. 50 billion yen (Japanese personal asset management software market)",
                        sam: "Approx. 15 billion yen (Smartphone household budget app market)",
                        som: "Approx. 1.5 billion yen (Family household budget sharing app segment)",
                        marketDrivers: [
                            "Increased demand for expense management due to cashless payment proliferation",
                            "Rising household budget awareness due to inflation",
                            "Growing need for household sharing due to dual-income families",
                            "Increased interest in asset management with new NISA system",
                        ],
                        marketBarriers: [
                            "Intensifying competition with free apps",
                            "Enhanced features in official bank apps",
                            "Security and privacy concerns",
                        ],
                        targetSegments: [
                            "Dual-income couples aged 20-40",
                            "Families with children",
                            "Young people interested in asset building",
                        ],
                    },
                    competitorAnalysis: {
                        competitors: [
                            {
                                name: "Money Forward ME",
                                description: "Japan's largest personal asset management app. Strong integration with bank accounts and credit cards.",
                                marketShare: "Approx. 35%",
                                strengths: ["Extensive financial institution integrations", "Brand recognition", "Synergy with B2B services"],
                                weaknesses: ["High premium feature pricing", "Complex UI"],
                                pricing: "Free basic, Premium 500 yen/month",
                                targetAudience: "Individuals interested in asset management",
                            },
                            {
                                name: "Zaim",
                                description: "A household budget app featuring simple operability. Receipt scanning feature is popular.",
                                marketShare: "Approx. 25%",
                                strengths: ["Simple UI", "Receipt scanning accuracy", "Long track record"],
                                weaknesses: ["Weak family sharing features", "Limited asset management features"],
                                pricing: "Free basic, Premium 480 yen/month",
                                targetAudience: "Individuals wanting easy household management",
                            },
                            {
                                name: "OsidOri",
                                description: "A household sharing app for couples and families. Specializes in joint management features.",
                                marketShare: "Approx. 5%",
                                strengths: ["Couple-focused features", "Modern UI"],
                                weaknesses: ["Small user base", "Limited financial institution integrations"],
                                pricing: "Free basic, Premium 480 yen/month",
                                targetAudience: "Couples, newlyweds",
                            },
                        ],
                        marketLandscape: "The Japanese household budget app market is maturing, with the top 2 companies (Money Forward, Zaim) dominating most of the market. However, there is room for growth in niche markets focusing on family-oriented sharing features.",
                        competitiveAdvantages: [
                            "Flexible sharing settings between family members",
                            "Children's financial education support features",
                            "Simple and intuitive UI",
                        ],
                        differentiationOpportunities: [
                            "Enhanced family budget management and savings goal sharing features",
                            "Addition of financial education content for children",
                            "Joint savings features for family events (travel, major purchases)",
                        ],
                        marketGaps: [
                            "Simple sharing features usable by the whole family",
                            "Educational elements to develop children's money sense",
                            "Intergenerational asset information sharing (inheritance planning)",
                        ],
                    },
                    businessOpportunities: [
                        {
                            title: "Family Premium Plan",
                            description: "Introduce a premium plan designed for multiple family members. Increase ARPU while keeping per-person pricing low through household-based billing model.",
                            type: "monetization",
                            potentialImpact: "high",
                            timeframe: "short_term",
                            requirements: ["Billing system modification", "Family plan exclusive feature development"],
                            risks: ["Existing user backlash", "Competitor follow-up"],
                        },
                        {
                            title: "Expanded Financial Institution API Integration",
                            description: "Expand API integration with major banks and securities firms to enable automatic asset status updates. Reduce user effort and improve retention rate.",
                            type: "product",
                            potentialImpact: "high",
                            timeframe: "medium_term",
                            requirements: ["API integration development", "Security certification acquisition", "Negotiation with financial institutions"],
                            risks: ["Development cost", "Difficulty obtaining financial institution cooperation"],
                        },
                        {
                            title: "Children's Financial Education Feature",
                            description: "Add educational features to teach children about allowance management and savings concepts. Achieve both family usage promotion and differentiation.",
                            type: "market_gap",
                            potentialImpact: "medium",
                            timeframe: "short_term",
                            requirements: ["Child-friendly UI development", "Educational content creation"],
                            risks: ["Children's privacy protection", "Development resources"],
                        },
                    ],
                    dataSources: [
                        "App Annie 2024 Japan App Market Report",
                        "Ministry of Internal Affairs and Communications Family Budget Survey",
                        "Japan FP Association Household Management Survey",
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

    describe("Multi-Locale Output Tests", () => {
        it("should generate PDF in both Japanese and English", async () => {
            // Mock data with all sections
            const mockResults = {
                marketingAnalytics: {
                    overallAnalysis: {
                        healthScore: 85,
                        summary: "Test summary for multi-locale PDF output",
                        keyInsights: ["Insight 1", "Insight 2"],
                        criticalIssues: ["Issue 1"],
                    },
                    competitivePositioning: {
                        marketPosition: "Market leader in the niche segment.",
                        competitorComparison: [
                            {
                                competitor: "Main Rival",
                                ourStrengths: ["Better pricing", "More features"],
                                ourWeaknesses: ["Smaller community"],
                                battleStrategy: "Build community and showcase value",
                            },
                        ],
                        differentiationStrategy: "Focus on AI-driven automation.",
                        quickWins: ["Launch community forum", "Create tutorial videos"],
                    },
                    marketOpportunityPriority: {
                        prioritizedOpportunities: [
                            {
                                opportunity: "Global expansion",
                                fitScore: "excellent",
                                fitReason: "Product is already localized",
                                estimatedEffort: "medium",
                                requiredChanges: ["Add payment gateways", "Local marketing"],
                                recommendedAction: "Start with APAC region",
                            },
                        ],
                        strategicRecommendation: "Pursue global expansion while maintaining competitive advantage.",
                    },
                    marketDataIntegrated: true,
                    generatedAt: new Date().toISOString(),
                },
            };

            const locales = ["ja", "en"];

            for (const locale of locales) {
                console.log(`\n=== Generating PDF for locale: ${locale} ===`);

                const taskId = `test-multi-locale-pdf-${locale}-${Date.now()}`;
                const actionId = `test-action-multi-locale-pdf-${locale}-${Date.now()}`;
                const token = `test-token-multi-locale-pdf-${locale}-${Date.now()}`;
                const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

                const actions = [{
                    command: "generate_marketing_pdf",
                    index: 0,
                }];

                const refs = await createTestDataWithResults({
                    taskId,
                    actionId,
                    actions,
                    token,
                    tokenExpiredTime,
                    accumulatedResults: mockResults,
                    actionIndex: 0,
                    locale: locale,
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
                    const pdfPath = actionData?.assets?.marketingAnalyticsPdf;
                    expect(pdfPath).toBeDefined();
                    expect(pdfPath).not.toBe("");

                    console.log(`[${locale}] PDF Storage path: ${pdfPath}`);

                    // Copy PDF to local tmp directory
                    if (pdfPath) {
                        const localPath = await copyPdfToLocal(pdfPath, locale);
                        if (localPath) {
                            console.log(`[${locale}] PDF saved to: ${localPath}`);
                        }
                    }
                } finally {
                    await firestore.doc(refs.actionPath).delete().catch(() => { });
                    await firestore.doc(refs.taskPath).delete().catch(() => { });
                }
            }

            console.log("\n=== Multi-Locale PDF Generation Complete ===");
            console.log("Output files:");
            console.log("  - test/tmp/marketing_report_ja.pdf");
            console.log("  - test/tmp/marketing_report_en.pdf");
        }, 180000);
    });

    describe("Dark Theme PDF Test", () => {
        it("should generate PDF with dark theme and custom branding", async () => {
            const taskId = `test-dark-theme-pdf-${Date.now()}`;
            const actionId = `test-action-dark-theme-pdf-${Date.now()}`;
            const token = `test-token-dark-theme-pdf-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            // Define action with dark theme style options
            const actions = [{
                command: "generate_marketing_pdf",
                index: 0,
                data: {
                    reportType: "weekly",
                    colorScheme: "dark",
                    headerIconUrl: "https://raw.githubusercontent.com/mathrunet/flutter_masamune/master/.github/images/icon.png",
                    organizationTitle: "mathru.net",
                    copyright: "mathru.net",
                },
            }];

            // Mock data with multiple sections to verify dark theme across pages
            const mockResults = {
                googlePlayConsole: {
                    packageName: "net.mathru.test",
                    averageRating: 4.5,
                    totalRatings: 1000,
                    ratingDistribution: { "5": 600, "4": 250, "3": 100, "2": 30, "1": 20 },
                },
                appStore: {
                    appId: "123456789",
                    appName: "Dark Theme Test App",
                    averageRating: 4.7,
                    totalRatings: 500,
                    ratingDistribution: { "5": 350, "4": 100, "3": 30, "2": 10, "1": 10 },
                },
                firebaseAnalytics: {
                    dau: 5000,
                    wau: 15000,
                    mau: 50000,
                    newUsers: 1000,
                    totalUsers: 100000,
                    averageSessionDuration: 300,
                    sessionsPerUser: 2.5,
                },
                marketingAnalytics: {
                    overallAnalysis: {
                        healthScore: 85,
                        summary: "アプリは全体的に良好な状態です。ユーザー満足度が高く、継続的な成長を示しています。",
                        keyInsights: [
                            "ユーザーエンゲージメントが前月比15%向上",
                            "新規ユーザー獲得が安定的に推移",
                            "両ストアでの評価が4.5以上を維持",
                        ],
                        criticalIssues: [
                            "Android版での一部クラッシュ報告",
                        ],
                    },
                    improvementSuggestions: [
                        {
                            category: "UX改善",
                            priority: "high",
                            title: "オンボーディングフローの最適化",
                            description: "新規ユーザーの離脱率を下げるためにオンボーディングを改善",
                            impact: "新規ユーザーのリテンション率が20%向上見込み",
                        },
                        {
                            category: "パフォーマンス",
                            priority: "medium",
                            title: "起動時間の短縮",
                            description: "コールドスタートの起動時間を3秒以内に",
                            impact: "ユーザー満足度の向上",
                        },
                    ],
                    trendAnalysis: {
                        userGrowth: "positive",
                        engagementTrend: "stable",
                        ratingTrend: "positive",
                        summary: "全体的に上昇傾向にあり、特にユーザー成長が顕著です。",
                    },
                    reviewAnalysis: {
                        positiveThemes: ["使いやすい", "デザインが良い", "機能が充実"],
                        negativeThemes: ["たまに落ちる", "読み込みが遅い"],
                        commonRequests: ["ダークモード対応", "ウィジェット機能"],
                    },
                    competitivePositioning: {
                        marketPosition: "ニッチ市場でのリーダーポジション",
                        competitorComparison: [
                            {
                                competitor: "競合A社",
                                ourStrengths: ["優れたUI/UX", "高速な動作"],
                                ourWeaknesses: ["機能数では劣る"],
                                battleStrategy: "ユーザー体験の差別化で勝負",
                            },
                        ],
                        differentiationStrategy: "AI機能とシンプルさの両立",
                        quickWins: ["比較ページの作成", "ケーススタディの公開"],
                    },
                    marketOpportunityPriority: {
                        prioritizedOpportunities: [
                            {
                                opportunity: "企業向け展開",
                                fitScore: "excellent",
                                fitReason: "現在の機能がエンタープライズニーズに適合",
                                estimatedEffort: "medium",
                                requiredChanges: ["SSO対応", "監査ログ実装"],
                                recommendedAction: "SSO実装を優先して企業営業を開始",
                            },
                        ],
                        strategicRecommendation: "企業市場への展開を主軸に、既存のB2C事業と並行して成長を目指す。",
                    },
                    marketDataIntegrated: true,
                    generatedAt: new Date().toISOString(),
                },
                githubRepository: {
                    repository: "mathrunet/flutter_masamune",
                    framework: "Flutter",
                    platforms: ["iOS", "Android", "Web"],
                    overview: "Masamuneフレームワークを使用したFlutterアプリケーション開発",
                    architecture: "クリーンアーキテクチャベース",
                    features: [
                        { name: "認証機能", description: "多様な認証プロバイダーをサポート" },
                        { name: "データ同期", description: "リアルタイムデータ同期機能" },
                    ],
                },
                githubImprovements: {
                    improvements: [
                        {
                            category: "performance",
                            priority: "high",
                            title: "画像読み込みの最適化",
                            description: "大量の画像を効率的に読み込むためのキャッシュ戦略の改善",
                            codeReferences: [
                                { filePath: "lib/services/image_service.dart", lineNumber: 45, description: "キャッシュロジックの改善ポイント" },
                            ],
                        },
                        {
                            category: "code_quality",
                            priority: "medium",
                            title: "テストカバレッジの向上",
                            description: "ユニットテストの追加による品質向上",
                            codeReferences: [
                                { filePath: "test/", description: "テスト追加が必要なモジュール" },
                            ],
                        },
                    ],
                },
            };

            const refs = await createTestDataWithResults({
                taskId,
                actionId,
                actions,
                token,
                tokenExpiredTime,
                accumulatedResults: mockResults,
                actionIndex: 0,
                locale: "ja",
            });

            try {
                console.log("=== Dark Theme PDF Test ===");
                console.log("Style options:");
                console.log("  - colorScheme: dark");
                console.log("  - headerIconUrl: GitHub icon");
                console.log("  - organizationTitle: mathru.net");
                console.log("  - copyright: mathru.net");

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
                const pdfPath = actionData?.assets?.marketingAnalyticsPdf;
                expect(pdfPath).toBeDefined();
                expect(pdfPath).not.toBe("");

                console.log("PDF Storage path:", pdfPath);

                // Copy PDF to local tmp directory for verification
                if (pdfPath) {
                    const localPath = await copyPdfToLocal(pdfPath, "dark_theme");
                    if (localPath) {
                        console.log(`\nDark theme PDF saved to: ${localPath}`);
                        console.log("Open this file to verify:");
                        console.log("  - Dark background (#212121) on all pages");
                        console.log("  - White text for readability");
                        console.log("  - Header with icon on left and 'mathru.net' on right");
                        console.log("  - Footer with '© 2024 mathru.net' copyright");
                        console.log("  - No 'Generated by Masamune Marketing Workflow' text");
                    }
                }

                console.log("\n=== Dark Theme PDF Test Complete ===");
            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => { });
                await firestore.doc(refs.taskPath).delete().catch(() => { });
            }
        }, 180000);
    });
});
