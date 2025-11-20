import * as admin from "firebase-admin";

const config = require("firebase-functions-test")({
    storageBucket: "mathru-net.appspot.com",
    projectId: "mathru-net",
}, "test/mathru-net-39425d37638c.json");

describe("Generate Short Video Function Test", () => {
    let wrapped: any;

    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        process.env.GCP_PROJECT_ID = "mathru-net";
        process.env.GEMINI_MODEL = "gemini-2.0-flash-exp";
    });

    afterAll(() => {
        config.cleanup();
    });

    test("Generate Short Video - Real AI Generation Test", async () => {
        const myFunctionsFactory = require("../src/functions/generate_short_video");
        const cloudFunction = myFunctionsFactory(["us-central1"], {}, {});
        wrapped = config.wrap(cloudFunction);

        // Increase timeout for AI image generation and video processing
        jest.setTimeout(300000); // 5 minutes

        const requestId = "short_video_gen_test_request_id";
        const assetId = "short_video_gen_test_asset_id";

        // Mock short video metadata
        const videoMetadata = {
            title: "Test Video Title",
            description: "Test video description",
            promotionText: "Test promotion text",
            keywords: ["test", "video"],
            language: "en"
        };

        const shortVideoOverview = {
            details: "Test video details",
            visualAtmosphere: "dramatic, cinematic",
            musicAtmosphere: "epic orchestral"
        };

        const shortVideoDetails = {
            scenes: [
                {
                    visual: {
                        image_query: "A beautiful sunset over mountains",
                        effect: {
                            type: "zoom_in",
                            intensity: "medium"
                        },
                        transition: {
                            type: "crossfade",
                            duration: 1.0
                        }
                    },
                    audio: {
                        narration_text: "This is the first scene narration.",
                        bgm_file_id: "epic_orchestral_01",
                        se_file_ids: ["whoosh_01"]
                    },
                    duration: 15.0
                },
                {
                    visual: {
                        image_query: "A warrior standing on a cliff",
                        effect: {
                            type: "pan_right",
                            intensity: "high"
                        },
                        transition: {
                            type: "fade_black",
                            duration: 1.5
                        }
                    },
                    audio: {
                        narration_text: "This is the second scene narration.",
                        bgm_file_id: "epic_orchestral_01",
                        se_file_ids: []
                    },
                    duration: 20.0
                }
            ]
        };

        // Setup Firestore data
        await admin.firestore().collection("plugins/asset/request").doc(requestId).set({
            status: "short_video_metadata_completed",
            assetId: assetId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await admin.firestore().collection("plugins/asset/asset").doc(assetId).set({
            requestId: requestId,
            theme: "Test Theme",
            title: "Test Title",
            channelTheme: "Test Channel",
            assetType: "short_video",
            videoMetadata: videoMetadata,
            shortVideoOverview: shortVideoOverview,
            shortVideoDetails: shortVideoDetails,
            status: "short_video_metadata_completed",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Call the function
        console.log("\n========================================");
        console.log("Testing Short Video Generation (Mock)");
        console.log("========================================\n");

        try {
            const result = await wrapped({
                data: { requestId: requestId },
            });
            console.log("\n=== Function Response ===");
            console.log("Success:", result.success);
            console.log("Asset ID:", result.assetId);
            console.log("Video URL:", result.videoUrl);
            console.log("=========================\n");

            // Verify result structure
            expect(result.success).toBe(true);
            expect(result.assetId).toBe(assetId);
            expect(result.videoUrl).toBeDefined();
        } catch (e) {
            console.error("\n❌ Error calling function:", e);
            throw e;
        }

        // Verify Firestore updates
        const requestDoc = await admin.firestore().collection("plugins/asset/request").doc(requestId).get();
        expect(requestDoc.data()?.status).toBe("short_video_completed");

        const assetDoc = await admin.firestore().collection("plugins/asset/asset").doc(assetId).get();
        const assetData = assetDoc.data();

        // Verify video generation completed
        expect(assetData?.status).toBe("short_video_completed");
        expect(assetData?.videoUrl).toBeDefined();
        expect(assetData?.subtitleUrl).toBeDefined();
        expect(assetData?.videoDuration).toBeDefined();
        expect(assetData?.videoDuration).toBeGreaterThan(0);

        console.log("\n========================================");
        console.log("✅ SHORT VIDEO GENERATION RESULTS");
        console.log("========================================");
        console.log("Video URL:", assetData?.videoUrl);
        console.log("Subtitle URL:", assetData?.subtitleUrl);
        console.log("Video Duration:", assetData?.videoDuration, "seconds");
        console.log("========================================\n");

        // Copy generated files to test/tmp for later inspection
        const fs = require("fs");
        const path = require("path");
        const testTmpDir = path.join(__dirname, "tmp");
        if (!fs.existsSync(testTmpDir)) {
            fs.mkdirSync(testTmpDir, { recursive: true });
        }

        // Download files from Cloud Storage and save to test/tmp
        const bucket = admin.storage().bucket();
        const videoFile = bucket.file(`assets/${assetId}/short_video.mp4`);
        const subtitleFile = bucket.file(`assets/${assetId}/subtitles.srt`);

        const videoDestPath = path.join(testTmpDir, `${assetId}_video.mp4`);
        const subtitleDestPath = path.join(testTmpDir, `${assetId}_subtitles.srt`);

        await videoFile.download({ destination: videoDestPath });
        await subtitleFile.download({ destination: subtitleDestPath });

        console.log("\n📁 Test files saved to:");
        console.log("  Video:", videoDestPath);
        console.log("  Subtitle:", subtitleDestPath);
        console.log("\n");
    }, 60000);
});
