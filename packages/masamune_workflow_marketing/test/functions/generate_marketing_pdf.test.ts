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
        await organizationRef.set({
            "@uid": testOrganizationId,
            "@time": nowTs,
            name: "Test Organization",
            "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
            createdTime: nowTs,
            "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
            updatedTime: nowTs,
        }, { merge: true });

        // Create Project with all credentials
        await projectRef.set({
            "@uid": testProjectId,
            "@time": nowTs,
            name: "Test Project",
            organization: organizationRef,
            google_service_account: googlePlayServiceAccount,
            appstore_issuer_id: appStoreIssuerId,
            appstore_auth_key_id: appStoreKeyId,
            appstore_auth_key: appStorePrivateKey,
            github_personal_access_token: githubToken,
            "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
            createdTime: nowTs,
            "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
            updatedTime: nowTs,
        }, { merge: true });

        // Create Task with accumulated results
        await taskRef.set({
            "@uid": options.taskId,
            "@time": nowTs,
            organization: organizationRef,
            project: projectRef,
            status: "running",
            actions: options.actions,
            usage: 0,
            results: options.accumulatedResults || {},
            "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
            createdTime: nowTs,
            "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
            updatedTime: nowTs,
        });

        // Create Action
        const actionIndex = options.actionIndex ?? 0;
        await actionRef.set({
            "@uid": options.actionId,
            "@time": nowTs,
            command: options.actions[actionIndex],
            task: taskRef,
            organization: organizationRef,
            project: projectRef,
            status: "running",
            token: options.token,
            "#tokenExpiredTime": { "@target": "tokenExpiredTime", "@type": "DateTime", "@time": tokenExpiredTs },
            tokenExpiredTime: tokenExpiredTs,
            usage: 0,
            "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
            createdTime: nowTs,
            "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
            updatedTime: nowTs,
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
        const actionDoc = await firestore.doc(actionPath).get();
        const actionData = actionDoc.data();
        const taskDoc = await actionData?.task?.get();
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

                await firestore.doc(asRefs.taskPath).update({
                    results: accumulatedResults,
                });

                accumulatedResults = await runDataCollectionFunction(
                    "../../src/functions/collect_from_app_store",
                    asRefs.actionPath,
                    token
                );
                console.log("App Store data collected:", Object.keys(accumulatedResults));

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

                await firestore.doc(faRefs.taskPath).update({
                    results: accumulatedResults,
                });

                accumulatedResults = await runDataCollectionFunction(
                    "../../src/functions/collect_from_firebase_analytics",
                    faRefs.actionPath,
                    token
                );
                console.log("Firebase Analytics data collected:", Object.keys(accumulatedResults));

                await firestore.doc(faRefs.actionPath).delete().catch(() => {});

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
                    await firestore.doc(ghInitRefs.actionPath).delete().catch(() => {});

                    // 4b: Run analyze_github_process for each batch
                    // Use batchCount from init result to build process actions
                    const initResult = accumulatedResults.githubAnalysisInit;
                    const batchCount = initResult?.batchCount || 0;
                    console.log("  Batch count from init result:", batchCount);

                    // Build updated actions array manually (since Firestore may have caching issues)
                    const processActionsToRun: any[] = [];
                    const initIndex = 3;
                    for (let i = 0; i < batchCount; i++) {
                        processActionsToRun.push({
                            command: "analyze_github_process",
                            index: initIndex + 1 + i,
                            githubRepository: githubRepo,
                            batchIndex: i,
                        });
                    }
                    const summaryActionToRun = {
                        command: "analyze_github_summary",
                        index: initIndex + 1 + batchCount,
                        githubRepository: githubRepo,
                    };

                    // Build full updated actions array
                    const updatedActions = [
                        ...actions.slice(0, initIndex + 1), // original actions up to and including init
                        ...processActionsToRun,
                        summaryActionToRun,
                        { command: "analyze_marketing_data", index: initIndex + 2 + batchCount },
                        { command: "generate_marketing_pdf", index: initIndex + 3 + batchCount, reportType: "weekly" },
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
                        await firestore.doc(ghProcessRefs.actionPath).delete().catch(() => {});
                    }

                    // 4c: Run analyze_github_summary
                    if (batchCount > 0) {
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
                        await firestore.doc(ghSummaryRefs.actionPath).delete().catch(() => {});
                    }
                } else {
                    console.warn("Step 4: Skipping GitHub analysis - No GITHUB_TOKEN");
                }

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

                await firestore.doc(analyzeRefs.actionPath).delete().catch(() => {});

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
                const taskDoc = await firestore.doc(pdfRefs.taskPath).get();
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
                const actionDoc = await firestore.doc(pdfRefs.actionPath).get();
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
                await firestore.doc(pdfRefs.actionPath).delete().catch(() => {});
                await firestore.doc(pdfRefs.taskPath).delete().catch(() => {});

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
        }, 1800000); // 30 minutes timeout for full pipeline with GitHub analysis (102+ folder batches)
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
                const actionDoc = await firestore.doc(refs.actionPath).get();
                const actionData = actionDoc.data();

                expect(actionData).toBeDefined();
                expect(actionData?.assets?.marketingAnalyticsPdf).toBeDefined();
                expect(actionData?.assets?.marketingAnalyticsPdf).toBe("");

                console.log("Empty data test completed successfully!");
                console.log("marketingAnalyticsPdf:", actionData?.assets?.marketingAnalyticsPdf);
            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
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
                const taskDoc = await firestore.doc(refs.taskPath).get();
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
                const taskDoc = await firestore.doc(refs.taskPath).get();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("failed");
                expect(taskData?.error?.message).toBe("invalid-token");

                console.log("Invalid token test completed successfully!");
            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 1800000);
    });
});
