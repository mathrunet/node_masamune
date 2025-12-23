/**
 * CollectFromGooglePlayConsole Integration Tests
 *
 * Tests using firebase-functions-test with actual Firebase/Firestore.
 * Tests from functions.tasks.onTaskDispatched level.
 *
 * Required:
 * - Service account: test/mathru-net-39425d37638c.json
 * - Environment variables in test/.env
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
// This ensures the default app exists for getFirestore() calls in workflow_process_function_base
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

// Generate unique IDs for test data
const testTimestamp = Date.now();
const testOrganizationId = `test-org-${testTimestamp}`;
const testProjectId = `test-project-${testTimestamp}`;
const testTaskId = `test-task-${testTimestamp}`;
const testActionId = `test-action-${testTimestamp}`;

// Firestore paths
const organizationPath = `plugins/workflow/organization/${testOrganizationId}`;
const projectPath = `plugins/workflow/project/${testProjectId}`;
const taskPath = `plugins/workflow/task/${testTaskId}`;
const actionPath = `plugins/workflow/action/${testActionId}`;

describe("CollectFromGooglePlayConsole Integration Tests", () => {
    let firestore: admin.firestore.Firestore;
    let googlePlayServiceAccount: string;

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
    });

    afterAll(async () => {
        // Cleanup test data
        try {
            await firestore.doc(actionPath).delete();
            await firestore.doc(taskPath).delete();
            await firestore.doc(projectPath).delete();
            await firestore.doc(organizationPath).delete();
        } catch (e) {
            // Ignore cleanup errors
        }
        config.cleanup();
    });

    /**
     * Helper: Create test data in Firestore
     */
    async function createTestData(options: {
        actions: any[];
        token: string;
        tokenExpiredTime: Date;
        actionIndex?: number;
    }) {
        const now = new Date();
        const nowTs = toTimestamp(now);
        const tokenExpiredTs = toTimestamp(options.tokenExpiredTime);
        const organizationRef = firestore.doc(organizationPath);
        const projectRef = firestore.doc(projectPath);
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
        // Create Project with googleServiceAccount
        await projectRef.save({
            "@uid": testProjectId,
            "@time": nowTs,
            name: "Test Project",
            organization: organizationRef,
            googleServiceAccount: googlePlayServiceAccount,
            "createdTime": new ModelTimestamp(nowTs.toDate()),
            "updatedTime": new ModelTimestamp(nowTs.toDate()),
        });

        // Create Task
        await taskRef.save({
            "@uid": testTaskId,
            "@time": nowTs,
            organization: organizationRef,
            project: projectRef,
            status: "running",
            actions: options.actions,
            usage: 0,
            results: {},
            "createdTime": new ModelTimestamp(nowTs.toDate()),
            "updatedTime": new ModelTimestamp(nowTs.toDate()),
        });

        // Create Action
        const actionIndex = options.actionIndex ?? 0;
        await actionRef.save({
            "@uid": testActionId,
            "@time": nowTs,
            command: options.actions[actionIndex],
            task: taskRef,
            organization: organizationRef,
            project: projectRef,
            status: "running",
            token: options.token,
            "tokenExpiredTime": new ModelTimestamp(tokenExpiredTs.toDate()),
            "usage": 0,
            "createdTime": new ModelTimestamp(nowTs.toDate()),
            "updatedTime": new ModelTimestamp(nowTs.toDate()),
        });

        return { organizationRef, projectRef, taskRef, actionRef };
    }

    /**
     * Helper: Cleanup test data
     */
    async function cleanupTestData() {
        try {
            await firestore.doc(actionPath).delete();
            await firestore.doc(taskPath).delete();
            await firestore.doc(projectPath).delete();
            await firestore.doc(organizationPath).delete();
        } catch (e) {
            // Ignore
        }
    }

    describe("Single Action Completion", () => {
        it("should complete single action and update Task/Action documents", async () => {
            if (!googlePlayServiceAccount) {
                console.warn("Skipping: Google Play service account not found");
                return;
            }

            const token = `test-token-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

            const dateRange = {
                startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            };

            // Single action
            const actions = [{
                command: "collect_from_google_play_console",
                index: 0,
                data: {
                    packageName: googlePlayPackageName,
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
                },
            }];

            await createTestData({ actions, token, tokenExpiredTime });

            try {
                // Load and wrap the function
                const func = require("../../src/functions/collect_from_google_play_console");
                const wrapped = config.wrap(func([], {}, {}));

                // Execute the function
                await wrapped({
                    data: {
                        path: actionPath,
                        token: token,
                    },
                    params: {},
                });

                // Verify Action document
                const actionDoc = await firestore.doc(actionPath).load();
                const actionData = actionDoc.data();

                expect(actionData).toBeDefined();
                expect(actionData?.status).toBe("completed");
                expect(actionData?.results).toBeDefined();
                expect(actionData?.results?.googlePlayConsole).toBeDefined();
                expect(actionData?.results?.googlePlayConsole?.packageName).toBe(googlePlayPackageName);
                expect(actionData?.finishedTime).toBeDefined();

                // Verify Task document
                const taskDoc = await firestore.doc(taskPath).load();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("completed");
                expect(taskData?.results).toBeDefined();
                expect(taskData?.results?.googlePlayConsole).toBeDefined();
                expect(taskData?.results?.googlePlayConsole?.packageName).toBe(googlePlayPackageName);
                expect(taskData?.finishedTime).toBeDefined();
                expect(taskData?.usage).toBeGreaterThan(0);

                console.log("Single action test completed successfully!");
                console.log("Action results:", JSON.stringify(actionData?.results?.googlePlayConsole, null, 2));
            } finally {
                await cleanupTestData();
            }
        }, 120000);
    });

    describe("Multiple Actions Continuation", () => {
        it("should set Task to waiting status with nextAction after first action", async () => {
            if (!googlePlayServiceAccount) {
                console.warn("Skipping: Google Play service account not found");
                return;
            }

            const multiTaskId = `test-task-multi-${Date.now()}`;
            const multiActionId = `test-action-multi-${Date.now()}`;
            const multiTaskPath = `plugins/workflow/task/${multiTaskId}`;
            const multiActionPath = `plugins/workflow/action/${multiActionId}`;

            const token = `test-token-multi-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const dateRange = {
                startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            };

            // Multiple actions: first action to be executed, second to be scheduled
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
                    command: "another_action",
                    index: 1,
                    data: {
                        someParam: "value",
                    },
                },
            ];

            const now = new Date();
            const nowTs = toTimestamp(now);
            const tokenExpiredTs = toTimestamp(tokenExpiredTime);
            const organizationRef = firestore.doc(organizationPath);
            const projectRef = firestore.doc(projectPath);
            const taskRef = firestore.doc(multiTaskPath);
            const actionRef = firestore.doc(multiActionPath);

            // Create Organization and Project (reuse if exists)
            await organizationRef.save({
                "@uid": testOrganizationId,
                "@time": nowTs,
                name: "Test Organization",
                "createdTime": new ModelTimestamp(nowTs.toDate()),
                "updatedTime": new ModelTimestamp(nowTs.toDate()),
            }, { merge: true });

            await projectRef.save({
                "@uid": testProjectId,
                "@time": nowTs,
                name: "Test Project",
                organization: organizationRef,
                googleServiceAccount: googlePlayServiceAccount,
                "createdTime": new ModelTimestamp(nowTs.toDate()),
                "updatedTime": new ModelTimestamp(nowTs.toDate()),
            }, { merge: true });

            // Create Task with multiple actions
            await taskRef.save({
                "@uid": multiTaskId,
                "@time": nowTs,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                actions: actions,
                usage: 0,
                results: {},
                "createdTime": new ModelTimestamp(nowTs.toDate()),
                "updatedTime": new ModelTimestamp(nowTs.toDate()),
            });

            // Create Action for first command
            await actionRef.save({
                "@uid": multiActionId,
                "@time": nowTs,
                command: actions[0],
                task: taskRef,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                token: token,
                "tokenExpiredTime": new ModelTimestamp(tokenExpiredTs.toDate()),
                "usage": 0,
                "createdTime": new ModelTimestamp(nowTs.toDate()),
                "updatedTime": new ModelTimestamp(nowTs.toDate()),
            });

            try {
                // Load and wrap the function
                const func = require("../../src/functions/collect_from_google_play_console");
                const wrapped = config.wrap(func([], {}, {}));

                // Execute the function
                await wrapped({
                    data: {
                        path: multiActionPath,
                        token: token,
                    },
                    params: {},
                });

                // Verify Action document - should be completed
                const actionDoc = await firestore.doc(multiActionPath).load();
                const actionData = actionDoc.data();

                expect(actionData).toBeDefined();
                expect(actionData?.status).toBe("completed");
                expect(actionData?.results?.googlePlayConsole).toBeDefined();

                // Verify Task document - should be waiting (not completed) with nextAction
                const taskDoc = await firestore.doc(multiTaskPath).load();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("waiting");
                expect(taskData?.nextAction).toBeDefined();
                expect(taskData?.nextAction?.command).toBe("another_action");
                expect(taskData?.nextAction?.index).toBe(1);
                expect(taskData?.results?.googlePlayConsole).toBeDefined();

                console.log("Multiple actions test completed successfully!");
                console.log("Task status:", taskData?.status);
                console.log("Next action:", JSON.stringify(taskData?.nextAction, null, 2));
            } finally {
                // Cleanup
                await firestore.doc(multiActionPath).delete().catch(() => {});
                await firestore.doc(multiTaskPath).delete().catch(() => {});
                await cleanupTestData();
            }
        }, 120000);
    });

    describe("Token Expired Error", () => {
        it("should fail with token-expired when tokenExpiredTime is in the past", async () => {
            if (!googlePlayServiceAccount) {
                console.warn("Skipping: Google Play service account not found");
                return;
            }

            const expiredTaskId = `test-task-expired-${Date.now()}`;
            const expiredActionId = `test-action-expired-${Date.now()}`;
            const expiredTaskPath = `plugins/workflow/task/${expiredTaskId}`;
            const expiredActionPath = `plugins/workflow/action/${expiredActionId}`;

            const token = `test-token-expired-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago (expired)

            const actions = [{
                command: "collect_from_google_play_console",
                index: 0,
                data: {
                    packageName: googlePlayPackageName,
                },
            }];

            const now = new Date();
            const nowTs = toTimestamp(now);
            const tokenExpiredTs = toTimestamp(tokenExpiredTime);
            const organizationRef = firestore.doc(organizationPath);
            const projectRef = firestore.doc(projectPath);
            const taskRef = firestore.doc(expiredTaskPath);
            const actionRef = firestore.doc(expiredActionPath);

            // Create Organization and Project
            await organizationRef.save({
                "@uid": testOrganizationId,
                "@time": nowTs,
                name: "Test Organization",
                "createdTime": new ModelTimestamp(nowTs.toDate()),
                "updatedTime": new ModelTimestamp(nowTs.toDate()),
            }, { merge: true });

            await projectRef.save({
                "@uid": testProjectId,
                "@time": nowTs,
                name: "Test Project",
                organization: organizationRef,
                googleServiceAccount: googlePlayServiceAccount,
                "createdTime": new ModelTimestamp(nowTs.toDate()),
                "updatedTime": new ModelTimestamp(nowTs.toDate()),
            }, { merge: true });

            // Create Task
            await taskRef.save({
                "@uid": expiredTaskId,
                "@time": nowTs,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                actions: actions,
                usage: 0,
                results: {},
                "createdTime": new ModelTimestamp(nowTs.toDate()),
                "updatedTime": new ModelTimestamp(nowTs.toDate()),
            });

            // Create Action with expired token
            await actionRef.save({
                "@uid": expiredActionId,
                "@time": nowTs,
                command: actions[0],
                task: taskRef,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                token: token,
                "tokenExpiredTime": new ModelTimestamp(tokenExpiredTs.toDate()),
                "usage": 0,
                "createdTime": new ModelTimestamp(nowTs.toDate()),
                "updatedTime": new ModelTimestamp(nowTs.toDate()),
            });

            try {
                // Load and wrap the function
                const func = require("../../src/functions/collect_from_google_play_console");
                const wrapped = config.wrap(func([], {}, {}));

                // Execute the function
                await wrapped({
                    data: {
                        path: expiredActionPath,
                        token: token,
                    },
                    params: {},
                });

                // Verify Task document - should be failed
                const taskDoc = await firestore.doc(expiredTaskPath).load();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("failed");
                expect(taskData?.error).toBeDefined();
                expect(taskData?.error?.message).toBe("token-expired");

                // Verify Action document - should be failed
                const actionDoc = await firestore.doc(expiredActionPath).load();
                const actionData = actionDoc.data();

                expect(actionData).toBeDefined();
                expect(actionData?.status).toBe("failed");
                expect(actionData?.error).toBeDefined();

                console.log("Token expired test completed successfully!");
                console.log("Task status:", taskData?.status);
                console.log("Error:", JSON.stringify(taskData?.error, null, 2));
            } finally {
                // Cleanup
                await firestore.doc(expiredActionPath).delete().catch(() => {});
                await firestore.doc(expiredTaskPath).delete().catch(() => {});
                await cleanupTestData();
            }
        }, 60000);
    });

    describe("Invalid Token Error", () => {
        it("should fail with invalid-token when token does not match", async () => {
            if (!googlePlayServiceAccount) {
                console.warn("Skipping: Google Play service account not found");
                return;
            }

            const invalidTaskId = `test-task-invalid-${Date.now()}`;
            const invalidActionId = `test-action-invalid-${Date.now()}`;
            const invalidTaskPath = `plugins/workflow/task/${invalidTaskId}`;
            const invalidActionPath = `plugins/workflow/action/${invalidActionId}`;

            const storedToken = `stored-token-${Date.now()}`;
            const wrongToken = `wrong-token-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

            const actions = [{
                command: "collect_from_google_play_console",
                index: 0,
                data: {
                    packageName: googlePlayPackageName,
                },
            }];

            const now = new Date();
            const nowTs = toTimestamp(now);
            const tokenExpiredTs = toTimestamp(tokenExpiredTime);
            const organizationRef = firestore.doc(organizationPath);
            const projectRef = firestore.doc(projectPath);
            const taskRef = firestore.doc(invalidTaskPath);
            const actionRef = firestore.doc(invalidActionPath);

            // Create Organization and Project
            await organizationRef.save({
                "@uid": testOrganizationId,
                "@time": nowTs,
                name: "Test Organization",
                "createdTime": new ModelTimestamp(nowTs.toDate()),
                "updatedTime": new ModelTimestamp(nowTs.toDate()),
            }, { merge: true });

            await projectRef.save({
                "@uid": testProjectId,
                "@time": nowTs,
                name: "Test Project",
                organization: organizationRef,
                googleServiceAccount: googlePlayServiceAccount,
                "createdTime": new ModelTimestamp(nowTs.toDate()),
                "updatedTime": new ModelTimestamp(nowTs.toDate()),
            }, { merge: true });

            // Create Task
            await taskRef.save({
                "@uid": invalidTaskId,
                "@time": nowTs,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                actions: actions,
                usage: 0,
                results: {},
                "createdTime": new ModelTimestamp(nowTs.toDate()),
                "updatedTime": new ModelTimestamp(nowTs.toDate()),
            });

            // Create Action with one token
            await actionRef.save({
                "@uid": invalidActionId,
                "@time": nowTs,
                command: actions[0],
                task: taskRef,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                token: storedToken, // Stored token
                "tokenExpiredTime": new ModelTimestamp(tokenExpiredTs.toDate()),
                "usage": 0,
                "createdTime": new ModelTimestamp(nowTs.toDate()),
                "updatedTime": new ModelTimestamp(nowTs.toDate()),
            });

            try {
                // Load and wrap the function
                const func = require("../../src/functions/collect_from_google_play_console");
                const wrapped = config.wrap(func([], {}, {}));

                // Execute the function with WRONG token
                await wrapped({
                    data: {
                        path: invalidActionPath,
                        token: wrongToken, // Different from stored token
                    },
                    params: {},
                });

                // Verify Task document - should be failed
                const taskDoc = await firestore.doc(invalidTaskPath).load();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("failed");
                expect(taskData?.error).toBeDefined();
                expect(taskData?.error?.message).toBe("invalid-token");

                // Verify Action document - should be failed
                const actionDoc = await firestore.doc(invalidActionPath).load();
                const actionData = actionDoc.data();

                expect(actionData).toBeDefined();
                expect(actionData?.status).toBe("failed");

                console.log("Invalid token test completed successfully!");
                console.log("Task status:", taskData?.status);
                console.log("Error:", JSON.stringify(taskData?.error, null, 2));
            } finally {
                // Cleanup
                await firestore.doc(invalidActionPath).delete().catch(() => {});
                await firestore.doc(invalidTaskPath).delete().catch(() => {});
                await cleanupTestData();
            }
        }, 60000);
    });
});
