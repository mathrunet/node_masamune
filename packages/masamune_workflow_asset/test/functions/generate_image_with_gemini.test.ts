/**
 * GenerateImageWithGemini Integration Tests
 *
 * Tests using firebase-functions-test with actual Gemini API.
 * Generated images are saved to both Firebase Storage and local test/tmp/ directory.
 *
 * Required:
 * - Service account with Vertex AI and Storage permissions
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
const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH
    ? path.join(__dirname, "..", process.env.GOOGLE_SERVICE_ACCOUNT_PATH)
    : path.join(__dirname, "../mathru-net-27ae75a92bc7.json");

// Test configuration
const projectId = process.env.GCP_PROJECT_ID || "mathru-net";
const storageBucket = process.env.STORAGE_BUCKET || `${projectId}.appspot.com`;

// Initialize firebase-functions-test with actual project
const config = require("firebase-functions-test")({
    storageBucket: storageBucket,
    projectId: projectId,
}, serviceAccountPath);

// Initialize Firebase Admin with service account credentials
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        projectId: projectId,
        storageBucket: storageBucket,
    });
}

// Helper to create Firestore Timestamp from Date
const toTimestamp = (date: Date) => admin.firestore.Timestamp.fromDate(date);

// Generate unique IDs for test data
const testTimestamp = Date.now();
const testOrganizationId = `test-org-gemini-image-${testTimestamp}`;
const testProjectId = `test-project-gemini-image-${testTimestamp}`;

// Firestore paths
const organizationPath = `plugins/workflow/organization/${testOrganizationId}`;
const projectPath = `plugins/workflow/project/${testProjectId}`;

// Ensure test/tmp directory exists
const tmpDir = path.join(__dirname, "../tmp");
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
}

describe("GenerateImageWithGemini Integration Tests", () => {
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
     * Helper: Create test data for image generation
     */
    async function createTestData(options: {
        taskId: string;
        actionId: string;
        command: any;
        token: string;
        tokenExpiredTime: Date;
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

        // Create Project
        await projectRef.save({
            "@uid": testProjectId,
            "@time": nowTs,
            name: "Test Project",
            organization: organizationRef,
            "createdTime": new ModelTimestamp(nowTs.toDate()),
            "updatedTime": new ModelTimestamp(nowTs.toDate()),
        });

        const actions = [options.command];

        // Create Task
        await taskRef.save({
            "@uid": options.taskId,
            "@time": nowTs,
            organization: organizationRef,
            project: projectRef,
            status: "running",
            actions: actions,
            usage: 0,
            results: {},
            assets: {},
            "createdTime": new ModelTimestamp(nowTs.toDate()),
            "updatedTime": new ModelTimestamp(nowTs.toDate()),
        });

        // Create Action
        await actionRef.save({
            "@uid": options.actionId,
            "@time": nowTs,
            command: options.command,
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
     * Helper: Save image buffer to local file
     */
    function saveImageLocally(buffer: Buffer, filename: string): string {
        const filepath = path.join(tmpDir, filename);
        fs.writeFileSync(filepath, buffer);
        console.log(`Saved image locally: ${filepath}`);
        return filepath;
    }

    describe("Basic Image Generation", () => {
        it("should generate an image from a text prompt", async () => {
            const taskId = `test-image-gen-${Date.now()}`;
            const actionId = `test-action-image-gen-${Date.now()}`;
            const token = `test-token-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_image_with_gemini",
                index: 0,
                data: {
                    prompt: "A beautiful sunset over a calm ocean with orange and purple clouds, digital art style",
                    width: 1024,
                    height: 1024,
                },
            };

            const refs = await createTestData({
                taskId,
                actionId,
                command,
                token,
                tokenExpiredTime,
            });

            try {
                const func = require("../../src/functions/generate_image_with_gemini");
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

                // Verify results structure (matches action.py interface)
                expect(taskData?.results?.imageGeneration).toBeDefined();
                const imageResults = taskData?.results?.imageGeneration;
                expect(imageResults?.files).toBeInstanceOf(Array);
                expect(imageResults?.files?.length).toBeGreaterThan(0);
                expect(imageResults?.files?.[0]?.width).toBeDefined();
                expect(imageResults?.files?.[0]?.height).toBeDefined();
                expect(imageResults?.files?.[0]?.format).toBeDefined();
                expect(imageResults?.files?.[0]?.size).toBeGreaterThan(0);
                expect(imageResults?.inputTokens).toBeGreaterThanOrEqual(0);
                expect(imageResults?.outputTokens).toBeGreaterThanOrEqual(0);

                // Verify assets structure (matches action.py interface)
                expect(taskData?.assets?.generatedImage).toBeDefined();
                const imageAsset = taskData?.assets?.generatedImage;
                expect(imageAsset?.url).toMatch(/^gs:\/\//);
                expect(imageAsset?.public_url).toMatch(/^https:\/\//);
                expect(imageAsset?.content_type).toMatch(/^image\//);

                console.log("\n=== Image Generation Results ===");
                console.log("Files:", JSON.stringify(imageResults?.files, null, 2));
                console.log("Input Tokens:", imageResults?.inputTokens);
                console.log("Output Tokens:", imageResults?.outputTokens);
                console.log("Cost:", imageResults?.cost);
                console.log("\nAsset URL:", imageAsset?.url);
                console.log("Public URL:", imageAsset?.public_url);

                // Download and save the generated image locally
                const storage = admin.storage();
                const gsMatch = imageAsset?.url?.match(/^gs:\/\/([^/]+)\/(.+)$/);
                if (gsMatch) {
                    const bucketName = gsMatch[1];
                    const filePath = gsMatch[2];
                    const bucket = storage.bucket(bucketName);
                    const file = bucket.file(filePath);
                    const [buffer] = await file.download();
                    const localPath = saveImageLocally(buffer, `test-sunset-${Date.now()}.png`);
                    console.log("\nImage saved locally for verification:", localPath);
                }

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 180000); // 3 minutes timeout for image generation
    });

    describe("Image Generation with Negative Prompt", () => {
        it("should generate an image avoiding specified elements", async () => {
            const taskId = `test-neg-prompt-${Date.now()}`;
            const actionId = `test-action-neg-prompt-${Date.now()}`;
            const token = `test-token-neg-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_image_with_gemini",
                index: 0,
                data: {
                    prompt: "A friendly robot character waving hello, cartoon style illustration",
                    negative_prompt: "scary, dark, realistic, photographic",
                    width: 512,
                    height: 512,
                },
            };

            const refs = await createTestData({
                taskId,
                actionId,
                command,
                token,
                tokenExpiredTime,
            });

            try {
                const func = require("../../src/functions/generate_image_with_gemini");
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
                expect(taskData?.results?.imageGeneration?.files?.length).toBeGreaterThan(0);
                expect(taskData?.assets?.generatedImage?.url).toMatch(/^gs:\/\//);

                console.log("Negative prompt test completed successfully!");
                console.log("Generated image URL:", taskData?.assets?.generatedImage?.url);

                // Save locally
                const storage = admin.storage();
                const gsMatch = taskData?.assets?.generatedImage?.url?.match(/^gs:\/\/([^/]+)\/(.+)$/);
                if (gsMatch) {
                    const [buffer] = await storage.bucket(gsMatch[1]).file(gsMatch[2]).download();
                    saveImageLocally(buffer, `test-robot-${Date.now()}.png`);
                }

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 180000);
    });

    describe("Custom Output Path", () => {
        it("should save image to a custom path in Storage", async () => {
            const taskId = `test-custom-path-${Date.now()}`;
            const actionId = `test-action-custom-path-${Date.now()}`;
            const token = `test-token-path-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);
            const customPath = `test-generated-images/custom/${Date.now()}/my-image.png`;

            const command = {
                command: "generate_image_with_gemini",
                index: 0,
                data: {
                    prompt: "A mountain landscape with snow, watercolor painting style",
                    output_path: customPath,
                },
            };

            const refs = await createTestData({
                taskId,
                actionId,
                command,
                token,
                tokenExpiredTime,
            });

            try {
                const func = require("../../src/functions/generate_image_with_gemini");
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
                expect(taskData?.assets?.generatedImage?.url).toContain(customPath);

                console.log("Custom path test completed successfully!");
                console.log("Image saved to:", taskData?.assets?.generatedImage?.url);

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 180000);
    });

    describe("Error Handling", () => {
        it("should fail when prompt is missing", async () => {
            const taskId = `test-no-prompt-${Date.now()}`;
            const actionId = `test-action-no-prompt-${Date.now()}`;
            const token = `test-token-no-prompt-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_image_with_gemini",
                index: 0,
                data: {
                    // No prompt provided
                    width: 1024,
                    height: 1024,
                },
            };

            const refs = await createTestData({
                taskId,
                actionId,
                command,
                token,
                tokenExpiredTime,
            });

            try {
                const func = require("../../src/functions/generate_image_with_gemini");
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

                expect(taskData?.status).toBe("failed");
                expect(taskData?.error).toBeDefined();
                expect(taskData?.error?.message).toContain("prompt");

                console.log("Missing prompt error test completed successfully!");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 60000);

        it("should fail with token-expired when tokenExpiredTime is in the past", async () => {
            const taskId = `test-expired-${Date.now()}`;
            const actionId = `test-action-expired-${Date.now()}`;
            const token = `test-token-expired-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

            const command = {
                command: "generate_image_with_gemini",
                index: 0,
                data: {
                    prompt: "A test image",
                },
            };

            const refs = await createTestData({
                taskId,
                actionId,
                command,
                token,
                tokenExpiredTime,
            });

            try {
                const func = require("../../src/functions/generate_image_with_gemini");
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

                expect(taskData?.status).toBe("failed");
                expect(taskData?.error?.message).toBe("token-expired");

                console.log("Token expired test completed successfully!");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 60000);

        it("should fail with invalid-token when token does not match", async () => {
            const taskId = `test-invalid-token-${Date.now()}`;
            const actionId = `test-action-invalid-token-${Date.now()}`;
            const storedToken = `stored-token-${Date.now()}`;
            const wrongToken = `wrong-token-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_image_with_gemini",
                index: 0,
                data: {
                    prompt: "A test image",
                },
            };

            const refs = await createTestData({
                taskId,
                actionId,
                command,
                token: storedToken,
                tokenExpiredTime,
            });

            try {
                const func = require("../../src/functions/generate_image_with_gemini");
                const wrapped = config.wrap(func([], {}, {}));

                await wrapped({
                    data: {
                        path: refs.actionPath,
                        token: wrongToken, // Wrong token
                    },
                    params: {},
                });

                const taskDoc = await firestore.doc(refs.taskPath).load();
                const taskData = taskDoc.data();

                expect(taskData?.status).toBe("failed");
                expect(taskData?.error?.message).toBe("invalid-token");

                console.log("Invalid token test completed successfully!");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 60000);
    });

    describe("Image Type Classification", () => {
        it("should include image_type in results when specified", async () => {
            const taskId = `test-image-type-${Date.now()}`;
            const actionId = `test-action-image-type-${Date.now()}`;
            const token = `test-token-type-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_image_with_gemini",
                index: 0,
                data: {
                    prompt: "A product logo design, minimalist style with blue gradient",
                    image_type: "logo",
                },
            };

            const refs = await createTestData({
                taskId,
                actionId,
                command,
                token,
                tokenExpiredTime,
            });

            try {
                const func = require("../../src/functions/generate_image_with_gemini");
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
                expect(taskData?.results?.imageGeneration?.imageType).toBe("logo");

                console.log("Image type test completed successfully!");
                console.log("Image type:", taskData?.results?.imageGeneration?.imageType);

                // Save locally
                const storage = admin.storage();
                const gsMatch = taskData?.assets?.generatedImage?.url?.match(/^gs:\/\/([^/]+)\/(.+)$/);
                if (gsMatch) {
                    const [buffer] = await storage.bucket(gsMatch[1]).file(gsMatch[2]).download();
                    saveImageLocally(buffer, `test-logo-${Date.now()}.png`);
                }

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 180000);
    });
});
