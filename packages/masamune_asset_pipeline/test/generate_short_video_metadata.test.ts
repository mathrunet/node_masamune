import * as admin from "firebase-admin";

const config = require("firebase-functions-test")({
    storageBucket: "mathru-net.appspot.com",
    projectId: "mathru-net",
}, "test/mathru-net-39425d37638c.json");

describe("Generate Short Video Metadata Function Test", () => {
    let wrapped: any;

    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        process.env.GCP_PROJECT_ID = "mathru-net";
        process.env.GEMINI_MODEL = "gemini-2.5-flash";
    });

    afterAll(() => {
        config.cleanup();
    });

    test("Generate Short Video Metadata - Real Gemini API Test", async () => {
        // This test uses the real Gemini API
        const myFunctionsFactory = require("../src/functions/generate_short_video_metadata");
        const cloudFunction = myFunctionsFactory(["us-central1"], {}, {});
        wrapped = config.wrap(cloudFunction);

        // Increase timeout for AI generation
        jest.setTimeout(180000);

        const requestId = "short_video_test_request_id";
        const assetId = "short_video_test_asset_id";
        const theme = "The Secrets of Samurai Swords";
        const title = "The Deadly Art of Samurai Swordsmithing";
        const report = `
## The Art of Japanese Swordsmithing

### Introduction
Japanese swords (katana) are renowned worldwide for their exceptional craftsmanship, razor-sharp edge, and cultural significance. The process of creating a katana is a sacred art passed down through generations of master swordsmiths.

### Historical Background
- Traditional techniques dating back over 1000 years
- Each sword takes months to create
- Involves folding steel hundreds of times

### The Process
1. **Steel Selection**: Choosing the right tamahagane (jewel steel)
2. **Folding**: Creating layers to remove impurities
3. **Shaping**: Forming the distinctive curve
4. **Heat Treatment**: Differential hardening for flexibility and sharpness
5. **Polishing**: Revealing the hamon (temper line)

### Cultural Significance
- Symbol of the samurai warrior class
- Considered the "soul of the samurai"
- Still revered in modern Japan
        `;

        // Setup Firestore data - simulating completed detailed research
        await admin.firestore().collection("plugins/asset/request").doc(requestId).set({
            status: "detailed_research_completed",
            assetId: assetId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await admin.firestore().collection("plugins/asset/asset").doc(assetId).set({
            requestId: requestId,
            theme: theme,
            title: title,
            report: report,
            channelTheme: "Japanese Culture",
            assetType: "short_video",
            assetTypeReason: "Quick, impactful facts about samurai swords perfect for 60-second format",
            status: "detailed_research_completed",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Call the function
        console.log("\n========================================");
        console.log("Testing Short Video Metadata Generation");
        console.log("Theme:", theme);
        console.log("========================================\n");

        try {
            const result = await wrapped({
                data: { requestId: requestId },
            });
            console.log("\n=== Function Response ===");
            console.log("Success:", result.success);
            console.log("Asset ID:", result.assetId);
            console.log("=========================\n");

            // Verify result structure
            expect(result.success).toBe(true);
            expect(result.assetId).toBe(assetId);
        } catch (e) {
            console.error("\n❌ Error calling function:", e);
            throw e;
        }

        // Verify Firestore updates
        const requestDoc = await admin.firestore().collection("plugins/asset/request").doc(requestId).get();
        expect(requestDoc.data()?.status).toBe("short_video_metadata_completed");

        const assetDoc = await admin.firestore().collection("plugins/asset/asset").doc(assetId).get();
        const assetData = assetDoc.data();

        // Verify all required metadata fields exist
        expect(assetData?.status).toBe("short_video_metadata_completed");
        expect(assetData?.videoMetadata).toBeDefined();
        expect(assetData?.videoMetadata.title).toBeDefined();
        expect(assetData?.videoMetadata.description).toBeDefined();
        expect(assetData?.videoMetadata.promotionText).toBeDefined();
        expect(assetData?.videoMetadata.keywords).toBeDefined();
        expect(assetData?.videoMetadata.language).toBeDefined();

        // Verify short video overview
        expect(assetData?.shortVideoOverview).toBeDefined();
        expect(assetData?.shortVideoOverview.details).toBeDefined();
        expect(assetData?.shortVideoOverview.visualAtmosphere).toBeDefined();
        expect(assetData?.shortVideoOverview.musicAtmosphere).toBeDefined();

        // Verify short video details
        expect(assetData?.shortVideoDetails).toBeDefined();
        expect(assetData?.shortVideoDetails.scenes).toBeDefined();
        expect(Array.isArray(assetData?.shortVideoDetails.scenes)).toBe(true);
        expect(assetData?.shortVideoDetails.scenes.length).toBeGreaterThan(0);

        // Verify each scene has required fields
        const firstScene = assetData?.shortVideoDetails.scenes[0];
        expect(firstScene.visual).toBeDefined();
        expect(firstScene.visual.image_query).toBeDefined();
        expect(firstScene.visual.effect).toBeDefined();
        expect(firstScene.audio).toBeDefined();
        expect(firstScene.audio.narration_text).toBeDefined();
        expect(firstScene.duration).toBeDefined();

        // Verify total duration is around 60 seconds
        const totalDuration = assetData?.shortVideoDetails.scenes.reduce(
            (sum: number, scene: any) => sum + (scene.duration || 0),
            0
        );
        expect(totalDuration).toBeGreaterThan(30);
        expect(totalDuration).toBeLessThan(90);

        console.log("\n========================================");
        console.log("✅ SHORT VIDEO METADATA RESULTS");
        console.log("========================================");
        console.log("Video Title:", assetData?.videoMetadata.title);
        console.log("Description:", assetData?.videoMetadata.description.substring(0, 100) + "...");
        console.log("Keywords:", assetData?.videoMetadata.keywords);
        console.log("Language:", assetData?.videoMetadata.language);
        console.log("\nOverview:");
        console.log("- Visual Atmosphere:", assetData?.shortVideoOverview.visualAtmosphere);
        console.log("- Music Atmosphere:", assetData?.shortVideoOverview.musicAtmosphere);
        console.log("\nScenes:");
        console.log("- Number of scenes:", assetData?.shortVideoDetails.scenes.length);
        console.log("- Total duration:", totalDuration, "seconds");
        console.log("\nFirst Scene:");
        console.log("- Image Query:", firstScene.visual.image_query);
        console.log("- Effect:", firstScene.visual.effect.type);
        console.log("- Narration:", firstScene.audio.narration_text.substring(0, 100) + "...");
        console.log("- Duration:", firstScene.duration, "seconds");
        console.log("========================================\n");
    }, 180000);
});
