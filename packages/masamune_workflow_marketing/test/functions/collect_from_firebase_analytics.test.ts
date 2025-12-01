/**
 * CollectFromFirebaseAnalytics Integration Tests
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
const firebaseAnalyticsPropertyId = process.env.FIREBASE_ANALYTICS_PROPERTY_ID || "properties/459007991";
const googleServiceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || "test/mathru-net-27ae75a92bc7.json";

// Generate unique IDs for test data
const testTimestamp = Date.now();
const testOrganizationId = `test-org-analytics-${testTimestamp}`;
const testProjectId = `test-project-analytics-${testTimestamp}`;
const testTaskId = `test-task-analytics-${testTimestamp}`;
const testActionId = `test-action-analytics-${testTimestamp}`;

// Firestore paths
const organizationPath = `plugins/workflow/organization/${testOrganizationId}`;
const projectPath = `plugins/workflow/project/${testProjectId}`;
const taskPath = `plugins/workflow/task/${testTaskId}`;
const actionPath = `plugins/workflow/action/${testActionId}`;

describe("CollectFromFirebaseAnalytics Integration Tests", () => {
    let firestore: admin.firestore.Firestore;
    let googleServiceAccount: string;

    beforeAll(() => {
        firestore = admin.firestore();

        // Load Google service account JSON
        const projectRoot = path.join(__dirname, "..", "..");
        const saPath = path.join(projectRoot, googleServiceAccountPath);
        if (fs.existsSync(saPath)) {
            googleServiceAccount = fs.readFileSync(saPath, "utf-8");
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
            if (!googleServiceAccount) {
                console.warn("Skipping: Google service account not found");
                return;
            }

            const token = `test-token-analytics-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

            const dateRange = {
                startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            };

            // Single action
            const actions = [{
                command: "collect_from_firebase_analytics",
                index: 0,
                propertyId: firebaseAnalyticsPropertyId,
                startDate: dateRange.startDate,
                endDate: dateRange.endDate,
            }];

            const now = new Date();
            const nowTs = toTimestamp(now);
            const tokenExpiredTs = toTimestamp(tokenExpiredTime);
            const organizationRef = firestore.doc(organizationPath);
            const projectRef = firestore.doc(projectPath);
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
            });

            // Create Project with google_service_account
            await projectRef.set({
                "@uid": testProjectId,
                "@time": nowTs,
                name: "Test Project",
                organization: organizationRef,
                google_service_account: googleServiceAccount,
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            });

            // Create Task
            await taskRef.set({
                "@uid": testTaskId,
                "@time": nowTs,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                actions: actions,
                usage: 0,
                results: {},
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            });

            // Create Action
            await actionRef.set({
                "@uid": testActionId,
                "@time": nowTs,
                command: actions[0],
                task: taskRef,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                token: token,
                "#tokenExpiredTime": { "@target": "tokenExpiredTime", "@type": "DateTime", "@time": tokenExpiredTs },
                tokenExpiredTime: tokenExpiredTs,
                usage: 0,
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            });

            try {
                // Load and wrap the function
                const func = require("../../src/functions/collect_from_firebase_analytics");
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
                const actionDoc = await firestore.doc(actionPath).get();
                const actionData = actionDoc.data();

                expect(actionData).toBeDefined();
                expect(actionData?.status).toBe("completed");
                expect(actionData?.results).toBeDefined();
                expect(actionData?.results?.firebaseAnalytics).toBeDefined();
                expect(actionData?.results?.firebaseAnalytics?.propertyId).toBe(firebaseAnalyticsPropertyId);
                expect(actionData?.finishedTime).toBeDefined();

                // Verify Task document
                const taskDoc = await firestore.doc(taskPath).get();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("completed");
                expect(taskData?.results).toBeDefined();
                expect(taskData?.results?.firebaseAnalytics).toBeDefined();
                expect(taskData?.results?.firebaseAnalytics?.propertyId).toBe(firebaseAnalyticsPropertyId);
                // Check for DAU/WAU/MAU presence
                expect(taskData?.results?.firebaseAnalytics?.dau).toBeDefined();
                expect(taskData?.results?.firebaseAnalytics?.wau).toBeDefined();
                expect(taskData?.results?.firebaseAnalytics?.mau).toBeDefined();
                expect(taskData?.finishedTime).toBeDefined();
                expect(taskData?.usage).toBeGreaterThan(0);

                console.log("Single action test completed successfully!");
                console.log("Action results:", JSON.stringify(actionData?.results?.firebaseAnalytics, null, 2));
            } finally {
                await cleanupTestData();
            }
        }, 120000);
    });

    describe("Multiple Actions Continuation", () => {
        it("should set Task to waiting status with nextAction after first action", async () => {
            if (!googleServiceAccount) {
                console.warn("Skipping: Google service account not found");
                return;
            }

            const multiTaskId = `test-task-analytics-multi-${Date.now()}`;
            const multiActionId = `test-action-analytics-multi-${Date.now()}`;
            const multiTaskPath = `plugins/workflow/task/${multiTaskId}`;
            const multiActionPath = `plugins/workflow/action/${multiActionId}`;

            const token = `test-token-analytics-multi-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const dateRange = {
                startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            };

            // Multiple actions
            const actions = [
                {
                    command: "collect_from_firebase_analytics",
                    index: 0,
                    propertyId: firebaseAnalyticsPropertyId,
                    startDate: dateRange.startDate,
                    endDate: dateRange.endDate,
                },
                {
                    command: "another_action",
                    index: 1,
                    someParam: "value",
                },
            ];

            const now = new Date();
            const nowTs = toTimestamp(now);
            const tokenExpiredTs = toTimestamp(tokenExpiredTime);
            const organizationRef = firestore.doc(organizationPath);
            const projectRef = firestore.doc(projectPath);
            const taskRef = firestore.doc(multiTaskPath);
            const actionRef = firestore.doc(multiActionPath);

            // Create Organization and Project
            await organizationRef.set({
                "@uid": testOrganizationId,
                "@time": nowTs,
                name: "Test Organization",
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            }, { merge: true });

            await projectRef.set({
                "@uid": testProjectId,
                "@time": nowTs,
                name: "Test Project",
                organization: organizationRef,
                google_service_account: googleServiceAccount,
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            }, { merge: true });

            // Create Task with multiple actions
            await taskRef.set({
                "@uid": multiTaskId,
                "@time": nowTs,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                actions: actions,
                usage: 0,
                results: {},
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            });

            // Create Action for first command
            await actionRef.set({
                "@uid": multiActionId,
                "@time": nowTs,
                command: actions[0],
                task: taskRef,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                token: token,
                "#tokenExpiredTime": { "@target": "tokenExpiredTime", "@type": "DateTime", "@time": tokenExpiredTs },
                tokenExpiredTime: tokenExpiredTs,
                usage: 0,
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            });

            try {
                // Load and wrap the function
                const func = require("../../src/functions/collect_from_firebase_analytics");
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
                const actionDoc = await firestore.doc(multiActionPath).get();
                const actionData = actionDoc.data();

                expect(actionData).toBeDefined();
                expect(actionData?.status).toBe("completed");
                expect(actionData?.results?.firebaseAnalytics).toBeDefined();

                // Verify Task document - should be waiting (not completed) with nextAction
                const taskDoc = await firestore.doc(multiTaskPath).get();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("waiting");
                expect(taskData?.nextAction).toBeDefined();
                expect(taskData?.nextAction?.command).toBe("another_action");
                expect(taskData?.nextAction?.index).toBe(1);
                expect(taskData?.results?.firebaseAnalytics).toBeDefined();

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
            if (!googleServiceAccount) {
                console.warn("Skipping: Google service account not found");
                return;
            }

            const expiredTaskId = `test-task-analytics-expired-${Date.now()}`;
            const expiredActionId = `test-action-analytics-expired-${Date.now()}`;
            const expiredTaskPath = `plugins/workflow/task/${expiredTaskId}`;
            const expiredActionPath = `plugins/workflow/action/${expiredActionId}`;

            const token = `test-token-analytics-expired-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago (expired)

            const actions = [{
                command: "collect_from_firebase_analytics",
                index: 0,
                propertyId: firebaseAnalyticsPropertyId,
            }];

            const now = new Date();
            const nowTs = toTimestamp(now);
            const tokenExpiredTs = toTimestamp(tokenExpiredTime);
            const organizationRef = firestore.doc(organizationPath);
            const projectRef = firestore.doc(projectPath);
            const taskRef = firestore.doc(expiredTaskPath);
            const actionRef = firestore.doc(expiredActionPath);

            // Create Organization and Project
            await organizationRef.set({
                "@uid": testOrganizationId,
                "@time": nowTs,
                name: "Test Organization",
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            }, { merge: true });

            await projectRef.set({
                "@uid": testProjectId,
                "@time": nowTs,
                name: "Test Project",
                organization: organizationRef,
                google_service_account: googleServiceAccount,
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            }, { merge: true });

            // Create Task
            await taskRef.set({
                "@uid": expiredTaskId,
                "@time": nowTs,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                actions: actions,
                usage: 0,
                results: {},
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            });

            // Create Action with expired token
            await actionRef.set({
                "@uid": expiredActionId,
                "@time": nowTs,
                command: actions[0],
                task: taskRef,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                token: token,
                "#tokenExpiredTime": { "@target": "tokenExpiredTime", "@type": "DateTime", "@time": tokenExpiredTs },
                tokenExpiredTime: tokenExpiredTs,
                usage: 0,
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            });

            try {
                // Load and wrap the function
                const func = require("../../src/functions/collect_from_firebase_analytics");
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
                const taskDoc = await firestore.doc(expiredTaskPath).get();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("failed");
                expect(taskData?.error).toBeDefined();
                expect(taskData?.error?.message).toBe("token-expired");

                // Verify Action document - should be failed
                const actionDoc = await firestore.doc(expiredActionPath).get();
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
            if (!googleServiceAccount) {
                console.warn("Skipping: Google service account not found");
                return;
            }

            const invalidTaskId = `test-task-analytics-invalid-${Date.now()}`;
            const invalidActionId = `test-action-analytics-invalid-${Date.now()}`;
            const invalidTaskPath = `plugins/workflow/task/${invalidTaskId}`;
            const invalidActionPath = `plugins/workflow/action/${invalidActionId}`;

            const storedToken = `stored-token-analytics-${Date.now()}`;
            const wrongToken = `wrong-token-analytics-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

            const actions = [{
                command: "collect_from_firebase_analytics",
                index: 0,
                propertyId: firebaseAnalyticsPropertyId,
            }];

            const now = new Date();
            const nowTs = toTimestamp(now);
            const tokenExpiredTs = toTimestamp(tokenExpiredTime);
            const organizationRef = firestore.doc(organizationPath);
            const projectRef = firestore.doc(projectPath);
            const taskRef = firestore.doc(invalidTaskPath);
            const actionRef = firestore.doc(invalidActionPath);

            // Create Organization and Project
            await organizationRef.set({
                "@uid": testOrganizationId,
                "@time": nowTs,
                name: "Test Organization",
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            }, { merge: true });

            await projectRef.set({
                "@uid": testProjectId,
                "@time": nowTs,
                name: "Test Project",
                organization: organizationRef,
                google_service_account: googleServiceAccount,
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            }, { merge: true });

            // Create Task
            await taskRef.set({
                "@uid": invalidTaskId,
                "@time": nowTs,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                actions: actions,
                usage: 0,
                results: {},
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            });

            // Create Action with stored token
            await actionRef.set({
                "@uid": invalidActionId,
                "@time": nowTs,
                command: actions[0],
                task: taskRef,
                organization: organizationRef,
                project: projectRef,
                status: "running",
                token: storedToken, // Stored token
                "#tokenExpiredTime": { "@target": "tokenExpiredTime", "@type": "DateTime", "@time": tokenExpiredTs },
                tokenExpiredTime: tokenExpiredTs,
                usage: 0,
                "#createdTime": { "@target": "createdTime", "@type": "DateTime", "@time": nowTs },
                createdTime: nowTs,
                "#updatedTime": { "@target": "updatedTime", "@type": "DateTime", "@time": nowTs },
                updatedTime: nowTs,
            });

            try {
                // Load and wrap the function
                const func = require("../../src/functions/collect_from_firebase_analytics");
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
                const taskDoc = await firestore.doc(invalidTaskPath).get();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("failed");
                expect(taskData?.error).toBeDefined();
                expect(taskData?.error?.message).toBe("invalid-token");

                // Verify Action document - should be failed
                const actionDoc = await firestore.doc(invalidActionPath).get();
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
