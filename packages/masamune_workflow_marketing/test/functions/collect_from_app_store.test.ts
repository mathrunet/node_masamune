/**
 * CollectFromAppStore Integration Tests
 *
 * Tests using firebase-functions-test with actual Firebase/Firestore.
 * Tests from functions.tasks.onTaskDispatched level.
 *
 * Required:
 * - Service account: test/mathru-net-39425d37638c.json
 * - App Store credentials in test/.env
 * - App Store P8 key file: test/AuthKey_48T4WJHF5B.p8
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
const appStoreKeyId = process.env.APP_STORE_KEY_ID || "48T4WJHF5B";
const appStoreIssuerId = process.env.APP_STORE_ISSUER_ID || "69a6de82-60ca-47e3-e053-5b8c7c11a4d1";
const appStorePrivateKeyPath = process.env.APP_STORE_PRIVATE_KEY_PATH || "test/AuthKey_48T4WJHF5B.p8";
const appStoreAppId = process.env.APP_STORE_APP_ID || "6692619607";
const appStoreVendorNumber = process.env.APP_STORE_VENDOR_NUMBER || "93702699";

// Generate unique IDs for test data
const testTimestamp = Date.now();
const testOrganizationId = `test-org-appstore-${testTimestamp}`;
const testProjectId = `test-project-appstore-${testTimestamp}`;
const testTaskId = `test-task-appstore-${testTimestamp}`;
const testActionId = `test-action-appstore-${testTimestamp}`;

// Firestore paths
const organizationPath = `plugins/workflow/organization/${testOrganizationId}`;
const projectPath = `plugins/workflow/project/${testProjectId}`;
const taskPath = `plugins/workflow/task/${testTaskId}`;
const actionPath = `plugins/workflow/action/${testActionId}`;

describe("CollectFromAppStore Integration Tests", () => {
    let firestore: admin.firestore.Firestore;
    let appStorePrivateKey: string;

    beforeAll(() => {
        firestore = admin.firestore();

        // Load App Store private key
        // .env path is relative to test directory
        const testDir = path.join(__dirname, "..");
        const keyPath = path.join(testDir, appStorePrivateKeyPath.replace(/^\.\//, ""));
        if (fs.existsSync(keyPath)) {
            appStorePrivateKey = fs.readFileSync(keyPath, "utf-8");
        } else {
            console.warn(`App Store private key not found: ${keyPath}`);
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
            if (!appStorePrivateKey) {
                console.warn("Skipping: App Store private key not found");
                return;
            }

            const token = `test-token-appstore-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

            const dateRange = {
                startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            };

            // Single action
            const actions = [{
                command: "collect_from_app_store",
                index: 0,
                appId: appStoreAppId,
                vendorNumber: appStoreVendorNumber,
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

            // Create Project with App Store credentials
            await projectRef.set({
                "@uid": testProjectId,
                "@time": nowTs,
                name: "Test Project",
                organization: organizationRef,
                appstore_issuer_id: appStoreIssuerId,
                appstore_auth_key_id: appStoreKeyId,
                appstore_auth_key: appStorePrivateKey,
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
                const func = require("../../src/functions/collect_from_app_store");
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
                expect(actionData?.results?.appStore).toBeDefined();
                expect(actionData?.results?.appStore?.appId).toBe(appStoreAppId);
                expect(actionData?.finishedTime).toBeDefined();

                // Verify Task document
                const taskDoc = await firestore.doc(taskPath).get();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("completed");
                expect(taskData?.results).toBeDefined();
                expect(taskData?.results?.appStore).toBeDefined();
                expect(taskData?.results?.appStore?.appId).toBe(appStoreAppId);
                expect(taskData?.finishedTime).toBeDefined();
                expect(taskData?.usage).toBeGreaterThan(0);

                console.log("Single action test completed successfully!");
                console.log("Action results:", JSON.stringify(actionData?.results?.appStore, null, 2));
            } finally {
                await cleanupTestData();
            }
        }, 120000);
    });

    describe("Multiple Actions Continuation", () => {
        it("should set Task to waiting status with nextAction after first action", async () => {
            if (!appStorePrivateKey) {
                console.warn("Skipping: App Store private key not found");
                return;
            }

            const multiTaskId = `test-task-appstore-multi-${Date.now()}`;
            const multiActionId = `test-action-appstore-multi-${Date.now()}`;
            const multiTaskPath = `plugins/workflow/task/${multiTaskId}`;
            const multiActionPath = `plugins/workflow/action/${multiActionId}`;

            const token = `test-token-appstore-multi-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const dateRange = {
                startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            };

            // Multiple actions
            const actions = [
                {
                    command: "collect_from_app_store",
                    index: 0,
                    appId: appStoreAppId,
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
                appstore_issuer_id: appStoreIssuerId,
                appstore_auth_key_id: appStoreKeyId,
                appstore_auth_key: appStorePrivateKey,
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
                const func = require("../../src/functions/collect_from_app_store");
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
                expect(actionData?.results?.appStore).toBeDefined();

                // Verify Task document - should be waiting (not completed) with nextAction
                const taskDoc = await firestore.doc(multiTaskPath).get();
                const taskData = taskDoc.data();

                expect(taskData).toBeDefined();
                expect(taskData?.status).toBe("waiting");
                expect(taskData?.nextAction).toBeDefined();
                expect(taskData?.nextAction?.command).toBe("another_action");
                expect(taskData?.nextAction?.index).toBe(1);
                expect(taskData?.results?.appStore).toBeDefined();

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
            if (!appStorePrivateKey) {
                console.warn("Skipping: App Store private key not found");
                return;
            }

            const expiredTaskId = `test-task-appstore-expired-${Date.now()}`;
            const expiredActionId = `test-action-appstore-expired-${Date.now()}`;
            const expiredTaskPath = `plugins/workflow/task/${expiredTaskId}`;
            const expiredActionPath = `plugins/workflow/action/${expiredActionId}`;

            const token = `test-token-appstore-expired-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago (expired)

            const actions = [{
                command: "collect_from_app_store",
                index: 0,
                appId: appStoreAppId,
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
                appstore_issuer_id: appStoreIssuerId,
                appstore_auth_key_id: appStoreKeyId,
                appstore_auth_key: appStorePrivateKey,
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
                const func = require("../../src/functions/collect_from_app_store");
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
            if (!appStorePrivateKey) {
                console.warn("Skipping: App Store private key not found");
                return;
            }

            const invalidTaskId = `test-task-appstore-invalid-${Date.now()}`;
            const invalidActionId = `test-action-appstore-invalid-${Date.now()}`;
            const invalidTaskPath = `plugins/workflow/task/${invalidTaskId}`;
            const invalidActionPath = `plugins/workflow/action/${invalidActionId}`;

            const storedToken = `stored-token-appstore-${Date.now()}`;
            const wrongToken = `wrong-token-appstore-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

            const actions = [{
                command: "collect_from_app_store",
                index: 0,
                appId: appStoreAppId,
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
                appstore_issuer_id: appStoreIssuerId,
                appstore_auth_key_id: appStoreKeyId,
                appstore_auth_key: appStorePrivateKey,
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
                const func = require("../../src/functions/collect_from_app_store");
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
