/**
 * GenerateAudioWithGoogleTTS Integration Tests
 *
 * Tests using firebase-functions-test with actual Google Cloud Text-to-Speech API.
 * Generated audio files are saved to both Firebase Storage and local test/tmp/ directory.
 *
 * Required:
 * - Service account with Cloud TTS and Storage permissions
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
const testOrganizationId = `test-org-tts-${testTimestamp}`;
const testProjectId = `test-project-tts-${testTimestamp}`;

// Firestore paths
const organizationPath = `plugins/workflow/organization/${testOrganizationId}`;
const projectPath = `plugins/workflow/project/${testProjectId}`;

// Ensure test/tmp directory exists
const tmpDir = path.join(__dirname, "../tmp");
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
}

describe("GenerateAudioWithGoogleTTS Integration Tests", () => {
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
     * Helper: Create test data for audio generation
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
     * Helper: Save audio buffer to local file
     */
    function saveAudioLocally(buffer: Buffer, filename: string): string {
        const filepath = path.join(tmpDir, filename);
        fs.writeFileSync(filepath, buffer);
        console.log(`Saved audio locally: ${filepath}`);
        return filepath;
    }

    describe("Basic Audio Generation", () => {
        it("should generate audio with voice_name parameter", async () => {
            const taskId = `test-audio-gen-${Date.now()}`;
            const actionId = `test-action-audio-gen-${Date.now()}`;
            const token = `test-token-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_audio_with_google_tts",
                index: 0,
                data: {
                    text: "こんにちは。これはGoogle Cloud Text-to-Speechのテストです。日本語の音声を生成しています。",
                    voice_name: "ja-JP-Wavenet-A",
                    output_format: "mp3",
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
                const func = require("../../src/functions/generate_audio_with_google_tts");
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

                // Verify results structure
                expect(taskData?.results?.audioGeneration).toBeDefined();
                const audioResults = taskData?.results?.audioGeneration;
                expect(audioResults?.files).toBeInstanceOf(Array);
                expect(audioResults?.files?.length).toBeGreaterThan(0);
                expect(audioResults?.files?.[0]?.duration).toBeGreaterThan(0);
                expect(audioResults?.files?.[0]?.format).toBe("mp3");
                expect(audioResults?.files?.[0]?.size).toBeGreaterThan(0);
                expect(audioResults?.files?.[0]?.characters).toBeGreaterThan(0);
                expect(audioResults?.characters).toBeGreaterThan(0);
                expect(audioResults?.cost).toBeGreaterThanOrEqual(0);

                // Verify assets structure
                expect(taskData?.assets?.generatedAudio).toBeDefined();
                const audioAsset = taskData?.assets?.generatedAudio;
                expect(audioAsset?.url).toMatch(/^gs:\/\//);
                expect(audioAsset?.public_url).toMatch(/^https:\/\//);
                expect(audioAsset?.content_type).toBe("audio/mpeg");

                console.log("\n=== Audio Generation Results ===");
                console.log("Files:", JSON.stringify(audioResults?.files, null, 2));
                console.log("Characters:", audioResults?.characters);
                console.log("Cost:", audioResults?.cost);
                console.log("\nAsset URL:", audioAsset?.url);
                console.log("Public URL:", audioAsset?.public_url);

                // Download and save the generated audio locally
                const storage = admin.storage();
                const gsMatch = audioAsset?.url?.match(/^gs:\/\/([^/]+)\/(.+)$/);
                if (gsMatch) {
                    const bucketName = gsMatch[1];
                    const filePath = gsMatch[2];
                    const bucket = storage.bucket(bucketName);
                    const file = bucket.file(filePath);
                    const [buffer] = await file.download();
                    const localPath = saveAudioLocally(buffer, `test-ja-neural2-${Date.now()}.mp3`);
                    console.log("\nAudio saved locally for verification:", localPath);
                }

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 120000); // 2 minutes timeout for audio generation

        it("should generate audio with language and gender parameters", async () => {
            const taskId = `test-lang-gender-${Date.now()}`;
            const actionId = `test-action-lang-gender-${Date.now()}`;
            const token = `test-token-lang-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_audio_with_google_tts",
                index: 0,
                data: {
                    text: "Hello, this is a test of Google Cloud Text-to-Speech. This is an English voice generated using language and gender parameters.",
                    language: "en-US",
                    gender: "MALE",
                    output_format: "mp3",
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
                const func = require("../../src/functions/generate_audio_with_google_tts");
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
                expect(taskData?.results?.audioGeneration?.files?.length).toBeGreaterThan(0);
                expect(taskData?.assets?.generatedAudio?.url).toMatch(/^gs:\/\//);

                console.log("Language+Gender test completed successfully!");
                console.log("Generated audio URL:", taskData?.assets?.generatedAudio?.url);

                // Save locally
                const storage = admin.storage();
                const gsMatch = taskData?.assets?.generatedAudio?.url?.match(/^gs:\/\/([^/]+)\/(.+)$/);
                if (gsMatch) {
                    const [buffer] = await storage.bucket(gsMatch[1]).file(gsMatch[2]).download();
                    saveAudioLocally(buffer, `test-en-male-${Date.now()}.mp3`);
                }

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 120000);

        it("should handle different languages", async () => {
            const languages = [
                { voice_name: "ja-JP-Wavenet-B", text: "日本語の音声テストです。", label: "ja-neural2" },
                { voice_name: "en-US-Wavenet-A", text: "This is an English voice test using Wavenet.", label: "en-wavenet" },
                { voice_name: "de-DE-Standard-A", text: "Dies ist ein deutscher Sprach-Test.", label: "de-standard" },
            ];

            for (const lang of languages) {
                const taskId = `test-multi-lang-${lang.label}-${Date.now()}`;
                const actionId = `test-action-multi-lang-${lang.label}-${Date.now()}`;
                const token = `test-token-${lang.label}-${Date.now()}`;
                const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

                const command = {
                    command: "generate_audio_with_google_tts",
                    index: 0,
                    data: {
                        text: lang.text,
                        voice_name: lang.voice_name,
                        output_format: "mp3",
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
                    const func = require("../../src/functions/generate_audio_with_google_tts");
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
                    expect(taskData?.results?.audioGeneration?.files?.[0]?.size).toBeGreaterThan(0);

                    console.log(`${lang.label} test completed successfully!`);

                    // Save locally
                    const storage = admin.storage();
                    const gsMatch = taskData?.assets?.generatedAudio?.url?.match(/^gs:\/\/([^/]+)\/(.+)$/);
                    if (gsMatch) {
                        const [buffer] = await storage.bucket(gsMatch[1]).file(gsMatch[2]).download();
                        saveAudioLocally(buffer, `test-${lang.label}-${Date.now()}.mp3`);
                    }

                } finally {
                    await firestore.doc(refs.actionPath).delete().catch(() => {});
                    await firestore.doc(refs.taskPath).delete().catch(() => {});
                }
            }
        }, 180000); // 3 minutes timeout for multiple languages
    });

    describe("Audio Parameters", () => {
        it("should support multiple audio formats", async () => {
            const formats = [
                { format: "mp3", contentType: "audio/mpeg" },
                { format: "wav", contentType: "audio/wav" },
                { format: "ogg", contentType: "audio/ogg" },
            ];

            for (const fmt of formats) {
                const taskId = `test-format-${fmt.format}-${Date.now()}`;
                const actionId = `test-action-format-${fmt.format}-${Date.now()}`;
                const token = `test-token-${fmt.format}-${Date.now()}`;
                const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

                const command = {
                    command: "generate_audio_with_google_tts",
                    index: 0,
                    data: {
                        text: "This is a test of different audio formats.",
                        voice_name: "en-US-Wavenet-A",
                        output_format: fmt.format,
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
                    const func = require("../../src/functions/generate_audio_with_google_tts");
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
                    expect(taskData?.results?.audioGeneration?.files?.[0]?.format).toBe(fmt.format);
                    expect(taskData?.assets?.generatedAudio?.content_type).toBe(fmt.contentType);

                    console.log(`Format ${fmt.format} test completed successfully!`);

                    // Save locally
                    const storage = admin.storage();
                    const gsMatch = taskData?.assets?.generatedAudio?.url?.match(/^gs:\/\/([^/]+)\/(.+)$/);
                    if (gsMatch) {
                        const [buffer] = await storage.bucket(gsMatch[1]).file(gsMatch[2]).download();
                        saveAudioLocally(buffer, `test-format-${fmt.format}-${Date.now()}.${fmt.format}`);
                    }

                } finally {
                    await firestore.doc(refs.actionPath).delete().catch(() => {});
                    await firestore.doc(refs.taskPath).delete().catch(() => {});
                }
            }
        }, 120000);

        it("should apply speaking rate parameter", async () => {
            const taskId = `test-speaking-rate-${Date.now()}`;
            const actionId = `test-action-speaking-rate-${Date.now()}`;
            const token = `test-token-rate-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_audio_with_google_tts",
                index: 0,
                data: {
                    text: "This is a test of speaking rate adjustment. The speed can be controlled.",
                    voice_name: "en-US-Wavenet-A",
                    speaking_rate: 1.5,
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
                const func = require("../../src/functions/generate_audio_with_google_tts");
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
                expect(taskData?.results?.audioGeneration?.files?.[0]?.duration).toBeGreaterThan(0);

                console.log("Speaking rate test completed successfully!");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 120000);

        it("should apply pitch adjustment", async () => {
            const taskId = `test-pitch-${Date.now()}`;
            const actionId = `test-action-pitch-${Date.now()}`;
            const token = `test-token-pitch-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_audio_with_google_tts",
                index: 0,
                data: {
                    text: "This is a test of pitch adjustment.",
                    voice_name: "en-US-Wavenet-A",
                    pitch: 5.0,
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
                const func = require("../../src/functions/generate_audio_with_google_tts");
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
                expect(taskData?.results?.audioGeneration?.files?.[0]?.size).toBeGreaterThan(0);

                console.log("Pitch test completed successfully!");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 120000);

        it("should apply volume gain", async () => {
            const taskId = `test-volume-${Date.now()}`;
            const actionId = `test-action-volume-${Date.now()}`;
            const token = `test-token-volume-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_audio_with_google_tts",
                index: 0,
                data: {
                    text: "This is a test of volume gain adjustment.",
                    voice_name: "en-US-Wavenet-A",
                    volume_gain_db: 5.0,
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
                const func = require("../../src/functions/generate_audio_with_google_tts");
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
                expect(taskData?.results?.audioGeneration?.files?.[0]?.size).toBeGreaterThan(0);

                console.log("Volume gain test completed successfully!");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 120000);
    });

    describe("Custom Output Path", () => {
        it("should save audio to a custom path in Storage", async () => {
            const taskId = `test-custom-path-${Date.now()}`;
            const actionId = `test-action-custom-path-${Date.now()}`;
            const token = `test-token-path-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);
            const customPath = `test-generated-audio/custom/${Date.now()}/my-audio.mp3`;

            const command = {
                command: "generate_audio_with_google_tts",
                index: 0,
                data: {
                    text: "This is a test of custom output path.",
                    voice_name: "en-US-Wavenet-A",
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
                const func = require("../../src/functions/generate_audio_with_google_tts");
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
                expect(taskData?.assets?.generatedAudio?.url).toContain(customPath);

                console.log("Custom path test completed successfully!");
                console.log("Audio saved to:", taskData?.assets?.generatedAudio?.url);

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 120000);
    });

    describe("Error Handling", () => {
        it("should fail when text is missing", async () => {
            const taskId = `test-no-text-${Date.now()}`;
            const actionId = `test-action-no-text-${Date.now()}`;
            const token = `test-token-no-text-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_audio_with_google_tts",
                index: 0,
                data: {
                    // No text provided
                    voice_name: "en-US-Wavenet-A",
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
                const func = require("../../src/functions/generate_audio_with_google_tts");
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
                expect(taskData?.error?.message).toContain("text");

                console.log("Missing text error test completed successfully!");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 60000);

        it("should fail when voice parameters are missing", async () => {
            const taskId = `test-no-voice-${Date.now()}`;
            const actionId = `test-action-no-voice-${Date.now()}`;
            const token = `test-token-no-voice-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_audio_with_google_tts",
                index: 0,
                data: {
                    text: "This should fail without voice parameters.",
                    // No voice_name, language, or gender
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
                const func = require("../../src/functions/generate_audio_with_google_tts");
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

                console.log("Missing voice parameters error test completed successfully!");

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 60000);

        it("should fail when only language is provided without gender", async () => {
            const taskId = `test-lang-only-${Date.now()}`;
            const actionId = `test-action-lang-only-${Date.now()}`;
            const token = `test-token-lang-only-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            const command = {
                command: "generate_audio_with_google_tts",
                index: 0,
                data: {
                    text: "This should fail with only language parameter.",
                    language: "en-US",
                    // No gender
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
                const func = require("../../src/functions/generate_audio_with_google_tts");
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

                console.log("Language only error test completed successfully!");

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
                command: "generate_audio_with_google_tts",
                index: 0,
                data: {
                    text: "This should fail with expired token.",
                    voice_name: "en-US-Wavenet-A",
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
                const func = require("../../src/functions/generate_audio_with_google_tts");
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
                command: "generate_audio_with_google_tts",
                index: 0,
                data: {
                    text: "This should fail with invalid token.",
                    voice_name: "en-US-Wavenet-A",
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
                const func = require("../../src/functions/generate_audio_with_google_tts");
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

    describe("Cost Calculation", () => {
        it("should calculate cost correctly based on voice type", async () => {
            const voiceTypes = [
                { voice_name: "ja-JP-Wavenet-A", label: "neural2" },
                { voice_name: "en-US-Wavenet-A", label: "wavenet" },
                { voice_name: "de-DE-Standard-A", label: "standard" },
            ];

            for (const voiceType of voiceTypes) {
                const taskId = `test-cost-${voiceType.label}-${Date.now()}`;
                const actionId = `test-action-cost-${voiceType.label}-${Date.now()}`;
                const token = `test-token-cost-${voiceType.label}-${Date.now()}`;
                const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

                const command = {
                    command: "generate_audio_with_google_tts",
                    index: 0,
                    data: {
                        text: "This is a test of cost calculation for different voice types. The cost should vary based on the voice quality.",
                        voice_name: voiceType.voice_name,
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
                    const func = require("../../src/functions/generate_audio_with_google_tts");
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
                    expect(taskData?.results?.audioGeneration?.cost).toBeGreaterThanOrEqual(0);
                    expect(taskData?.results?.audioGeneration?.characters).toBeGreaterThan(0);

                    console.log(`${voiceType.label} cost: $${taskData?.results?.audioGeneration?.cost}`);

                } finally {
                    await firestore.doc(refs.actionPath).delete().catch(() => {});
                    await firestore.doc(refs.taskPath).delete().catch(() => {});
                }
            }

            console.log("Cost calculation test completed successfully!");
        }, 120000);
    });

    describe("Large Text Handling", () => {
        it("should handle large text input", async () => {
            const taskId = `test-large-text-${Date.now()}`;
            const actionId = `test-action-large-text-${Date.now()}`;
            const token = `test-token-large-${Date.now()}`;
            const tokenExpiredTime = new Date(Date.now() + 60 * 60 * 1000);

            // Generate large text (under 5000 bytes limit, approximately 1500 characters)
            const paragraph = "これは大量のテキストを処理するためのテストです。Google Cloud Text-to-Speechは長いテキストも処理できます。";
            const largeText = Array(15).fill(paragraph).join(" "); // ~1500 characters, ~4500 bytes

            const command = {
                command: "generate_audio_with_google_tts",
                index: 0,
                data: {
                    text: largeText,
                    voice_name: "ja-JP-Wavenet-A",
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
                const func = require("../../src/functions/generate_audio_with_google_tts");
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
                expect(taskData?.results?.audioGeneration?.files?.[0]?.size).toBeGreaterThan(50000); // > 50KB
                expect(taskData?.results?.audioGeneration?.files?.[0]?.duration).toBeGreaterThan(30); // > 30 seconds
                expect(taskData?.results?.audioGeneration?.characters).toBeGreaterThan(1000);

                console.log("Large text test completed successfully!");
                console.log("Text length:", largeText.length, "characters");
                console.log("Audio size:", taskData?.results?.audioGeneration?.files?.[0]?.size, "bytes");
                console.log("Audio duration:", taskData?.results?.audioGeneration?.files?.[0]?.duration, "seconds");

                // Save locally
                const storage = admin.storage();
                const gsMatch = taskData?.assets?.generatedAudio?.url?.match(/^gs:\/\/([^/]+)\/(.+)$/);
                if (gsMatch) {
                    const [buffer] = await storage.bucket(gsMatch[1]).file(gsMatch[2]).download();
                    saveAudioLocally(buffer, `test-large-text-${Date.now()}.mp3`);
                }

            } finally {
                await firestore.doc(refs.actionPath).delete().catch(() => {});
                await firestore.doc(refs.taskPath).delete().catch(() => {});
            }
        }, 180000); // 3 minutes timeout for large text
    });
});
