/**
 * ResearchMarket Integration Tests
 *
 * Tests using firebase-functions-test with actual Firebase/Firestore.
 * This test validates market research functionality using Gemini with Google Search.
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
import { MarketResearchData } from "../../src/models";

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
const testOrganizationId = `test-org-research-${testTimestamp}`;
const testProjectId = `test-project-research-${testTimestamp}`;

// Firestore paths
const organizationPath = `plugins/workflow/organization/${testOrganizationId}`;
const projectPath = `plugins/workflow/project/${testProjectId}`;

describe("ResearchMarket Integration Tests", () => {
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
     * Helper: Create test data with project information
     */
    async function createTestDataWithProject(options: {
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
        // Build project data, filtering out undefined values
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

        // Create Task
        await taskRef.save({
            "@uid": options.taskId,
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

    describe("Market Research with Valid Project Data", () => {
        it("should research market with valid project data", async () => {
            const taskId = `test-research-valid-${Date.now()}`;
            const actionId = `test-action-research-valid-${Date.now()}`;
            const token = `test-token-research-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "research_market",
                index: 0,
            }];

            const projectData = {
                description: "AIを活用した個人向け健康管理アプリ。睡眠、運動、食事を総合的に分析し、パーソナライズされた健康アドバイスを提供する。",
                concept: "健康管理の民主化 - 誰もが専門家レベルの健康管理を手軽に行える世界を目指す",
                goal: "2025年末までに月間アクティブユーザー100万人を達成",
                target: "20-40代の健康意識の高いビジネスパーソン、特にリモートワーカーや座り仕事が多い層",
                kpi: {
                    mau: 1000000,
                    retention_30d: 0.4,
                    nps: 50,
                },
            };

            const refs = await createTestDataWithProject({
                taskId,
                actionId,
                actions,
                token,
                tokenExpiredTime,
                projectData,
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/research_market");
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
                expect(taskData?.results?.marketResearchData).toBeDefined();

                const researchData: MarketResearchData = taskData?.results?.marketResearchData;

                // Verify structure
                expect(researchData.marketPotential).toBeDefined();
                expect(researchData.marketPotential.summary).toBeDefined();
                expect(researchData.marketPotential.marketDrivers).toBeInstanceOf(Array);
                expect(researchData.marketPotential.marketBarriers).toBeInstanceOf(Array);
                expect(researchData.marketPotential.targetSegments).toBeInstanceOf(Array);

                expect(researchData.competitorAnalysis).toBeDefined();
                expect(researchData.competitorAnalysis.competitors).toBeInstanceOf(Array);
                expect(researchData.competitorAnalysis.marketLandscape).toBeDefined();

                expect(researchData.businessOpportunities).toBeInstanceOf(Array);
                expect(researchData.dataSources).toBeInstanceOf(Array);
                expect(researchData.generatedAt).toBeDefined();

                console.log("\n=== Market Research Results ===");
                console.log("Generated at:", researchData.generatedAt);
                console.log("\n--- Market Potential ---");
                console.log("Summary:", researchData.marketPotential.summary?.substring(0, 200) + "...");
                console.log("TAM:", researchData.marketPotential.tam);
                console.log("SAM:", researchData.marketPotential.sam);
                console.log("Drivers:", researchData.marketPotential.marketDrivers?.length, "items");
                console.log("\n--- Competitors ---");
                console.log("Count:", researchData.competitorAnalysis.competitors?.length);
                researchData.competitorAnalysis.competitors?.slice(0, 3).forEach((c, i) => {
                    console.log(`  ${i + 1}. ${c.name}`);
                });
                console.log("\n--- Business Opportunities ---");
                console.log("Count:", researchData.businessOpportunities?.length);
                console.log("\n--- Data Sources ---");
                console.log("Count:", researchData.dataSources?.length);

                // Output full JSON for debugging
                console.log("\n========== FULL JSON: task.results.marketResearchData ==========");
                console.log(JSON.stringify(researchData, null, 2));
                console.log("========== END JSON ==========\n");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => { });
                await firestore.doc(refs.taskPath).delete().catch(() => { });
            }
        }, 180000); // 3 minutes timeout
    });

    describe("Market Research with Minimal Project Data", () => {
        it("should handle project with minimal data", async () => {
            const taskId = `test-research-minimal-${Date.now()}`;
            const actionId = `test-action-research-minimal-${Date.now()}`;
            const token = `test-token-minimal-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "research_market",
                index: 0,
            }];

            // Minimal project data - only description
            const projectData = {
                description: "オンライン学習プラットフォーム",
            };

            const refs = await createTestDataWithProject({
                taskId,
                actionId,
                actions,
                token,
                tokenExpiredTime,
                projectData,
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/research_market");
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
                expect(taskData?.results?.marketResearchData).toBeDefined();

                console.log("Minimal data test completed successfully!");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => { });
                await firestore.doc(refs.taskPath).delete().catch(() => { });
            }
        }, 180000);
    });

    describe("Token Expired Error", () => {
        it("should fail with token-expired when tokenExpiredTime is in the past", async () => {
            const taskId = `test-research-expired-${Date.now()}`;
            const actionId = `test-action-research-expired-${Date.now()}`;
            const token = `test-token-expired-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

            const actions = [{
                command: "research_market",
                index: 0,
            }];

            const projectData = {
                description: "テスト用プロジェクト",
            };

            const refs = await createTestDataWithProject({
                taskId,
                actionId,
                actions,
                token,
                tokenExpiredTime,
                projectData,
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/research_market");
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
            const taskId = `test-research-invalid-${Date.now()}`;
            const actionId = `test-action-research-invalid-${Date.now()}`;
            const storedToken = `stored-token-${Date.now()}`;
            const wrongToken = `wrong-token-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const actions = [{
                command: "research_market",
                index: 0,
            }];

            const projectData = {
                description: "テスト用プロジェクト",
            };

            const refs = await createTestDataWithProject({
                taskId,
                actionId,
                actions,
                token: storedToken,
                tokenExpiredTime,
                projectData,
                actionIndex: 0,
            });

            try {
                const func = require("../../src/functions/research_market");
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
