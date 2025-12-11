/**
 * GenerateMarketingMarkdown Integration Tests
 *
 * Tests using firebase-functions-test with actual Firebase/Firestore.
 * This test runs the FULL pipeline:
 * 1. Google Play Console data collection
 * 2. App Store data collection
 * 3. Firebase Analytics data collection
 * 4. GitHub Repository Analysis (init → process × N → summary)
 * 5. AI Analysis (with GitHub-aware improvements)
 * 6. Markdown Generation (including code improvement suggestions)
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
const testOrganizationId = `test-org-md-${testTimestamp}`;
const testProjectId = `test-project-md-${testTimestamp}`;

// Firestore paths
const organizationPath = `plugins/workflow/organization/${testOrganizationId}`;
const projectPath = `plugins/workflow/project/${testProjectId}`;

describe("GenerateMarketingMarkdown Integration Tests", () => {
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
     * Helper: Save Markdown to local tmp directory
     */
    function saveMarkdownToLocal(markdownContent: string): string | null {
        try {
            const tmpDir = path.join(__dirname, "..", "tmp");
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }
            const localPath = path.join(tmpDir, "marketing_report.md");
            fs.writeFileSync(localPath, markdownContent, "utf-8");
            console.log(`Markdown saved to: ${localPath}`);
            return localPath;
        } catch (error) {
            console.error("Failed to save Markdown to local:", error);
            return null;
        }
    }

    describe("Full Pipeline Test with Live Data", () => {
        it("should generate Markdown after collecting from all sources and AI analysis", async () => {
            if (!googlePlayServiceAccount) {
                console.warn("Skipping: Google Play service account not found");
                return;
            }

            const pipelineTaskId = `test-pipeline-md-${Date.now()}`;
            const token = `test-token-pipeline-md-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const dateRange = {
                startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            };

            // Define the full pipeline actions
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
                    command: "generate_marketing_markdown",
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
                    const initResult = accumulatedResults.githubAnalysisInit;
                    const batchCount = initResult?.batchCount || 0;
                    console.log("  Batch count from init result:", batchCount);

                    // Limit batches for testing to prevent timeout
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
                        ...actions.slice(0, initIndex + 1),
                        ...processActionsToRun,
                        summaryActionToRun,
                        { command: "analyze_marketing_data", index: initIndex + 2 + actualBatchCount },
                        { command: "generate_marketing_markdown", index: initIndex + 3 + actualBatchCount, reportType: "weekly" },
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

                // Step 5: Analyze Marketing Data
                console.log("Step 5: Analyzing marketing data with AI...");

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

                // Step 6: Generate Marketing Markdown
                console.log("Step 6: Generating marketing Markdown...");

                const mdAction = currentActions.find(
                    (a: any) => a.command === "generate_marketing_markdown"
                );
                const mdActionIndex = mdAction?.index ?? 5;

                const mdActionId = `${pipelineTaskId}-md`;
                const mdRefs = await createTestDataWithResults({
                    taskId: pipelineTaskId,
                    actionId: mdActionId,
                    actions: currentActions,
                    token,
                    tokenExpiredTime,
                    accumulatedResults,
                    actionIndex: mdActionIndex,
                });

                await firestore.doc(mdRefs.taskPath).update({
                    results: accumulatedResults,
                });

                const mdFunc = require("../../src/functions/generate_marketing_markdown");
                const mdWrapped = config.wrap(mdFunc([], {}, {}));

                await mdWrapped({
                    data: {
                        path: mdRefs.actionPath,
                        token: token,
                    },
                    params: {},
                });

                // Verify results
                const taskDoc = await firestore.doc(mdRefs.taskPath).load();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("completed");

                // Check for GitHub improvements in results
                console.log("\n=== GitHub Integration Results ===");
                console.log("githubRepository present:", !!accumulatedResults.githubRepository);
                console.log("githubImprovements present:", !!accumulatedResults.githubImprovements);

                // Check for Markdown result
                const actionDoc = await firestore.doc(mdRefs.actionPath).load();
                const actionData = actionDoc.data();
                console.log("\n=== Markdown Generation Results ===");

                const markdownContent = actionData?.results?.marketingAnalyticsMarkdown;
                expect(markdownContent).toBeDefined();
                expect(markdownContent).not.toBe("");
                expect(typeof markdownContent).toBe("string");
                console.log("Markdown content length:", markdownContent?.length, "characters");

                // Save Markdown to local tmp directory for verification
                if (markdownContent) {
                    const localPath = saveMarkdownToLocal(markdownContent);
                    if (localPath) {
                        console.log(`\nMarkdown copied to local: ${localPath}`);
                        console.log("You can open this file to verify the Markdown content.");
                    }

                    // Log first 500 characters of the Markdown
                    console.log("\n=== Markdown Preview (first 500 chars) ===");
                    console.log(markdownContent.substring(0, 500));
                    console.log("...");
                }

                // Clean up
                await firestore.doc(mdRefs.actionPath).delete().catch(() => { });
                await firestore.doc(mdRefs.taskPath).delete().catch(() => { });

            } catch (error) {
                console.error("Pipeline test error:", error);
                throw error;
            }
        }, 600000); // 10 minutes timeout
    });

    describe("Empty Data Test", () => {
        it("should return empty string when no data exists", async () => {
            const emptyTaskId = `test-empty-md-${Date.now()}`;
            const emptyActionId = `test-action-empty-md-${Date.now()}`;
            const token = `test-token-empty-md-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "generate_marketing_markdown",
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
                const func = require("../../src/functions/generate_marketing_markdown");
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
                expect(actionData?.results?.marketingAnalyticsMarkdown).toBeDefined();
                expect(actionData?.results?.marketingAnalyticsMarkdown).toBe("");

                console.log("Empty data test completed successfully!");
                console.log("marketingAnalyticsMarkdown:", actionData?.results?.marketingAnalyticsMarkdown);
            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => { });
                await firestore.doc(refs.taskPath).delete().catch(() => { });
            }
        }, 60000);
    });

    describe("Token Expired Error", () => {
        it("should fail with token-expired when tokenExpiredTime is in the past", async () => {
            const expiredTaskId = `test-expired-md-${Date.now()}`;
            const expiredActionId = `test-action-expired-md-${Date.now()}`;
            const token = `test-token-expired-md-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

            const actions = [{
                command: "generate_marketing_markdown",
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
                const func = require("../../src/functions/generate_marketing_markdown");
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
            const invalidTaskId = `test-invalid-md-${Date.now()}`;
            const invalidActionId = `test-action-invalid-md-${Date.now()}`;
            const storedToken = `stored-token-md-${Date.now()}`;
            const wrongToken = `wrong-token-md-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "generate_marketing_markdown",
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
                const func = require("../../src/functions/generate_marketing_markdown");
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
});
