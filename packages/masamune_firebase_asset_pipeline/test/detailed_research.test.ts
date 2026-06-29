import * as admin from "firebase-admin";

const config = require("firebase-functions-test")({
    storageBucket: "mathru-net.appspot.com",
    projectId: "mathru-net",
}, "test/mathru-net-39425d37638c.json");

describe("Detailed Research Function Test", () => {
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

    test("Conduct Detailed Research - Real Gemini API Test", async () => {
        // This test uses the real Gemini API
        const myFunctionsFactory = require("../src/functions/conduct_detailed_research");
        const cloudFunction = myFunctionsFactory(["us-central1"], {}, {});
        wrapped = config.wrap(cloudFunction);

        // Increase timeout for AI generation
        jest.setTimeout(180000);

        const requestId = "real_api_test_request_id";
        const assetId = "real_api_test_asset_id";
        const theme = "The History of the Sengoku Period in Japan";

        // Setup Firestore data
        await admin.firestore().collection("plugins/asset/request").doc(requestId).set({
            status: "broad_research_completed",
            assetId: assetId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await admin.firestore().collection("plugins/asset/asset").doc(assetId).set({
            requestId: requestId,
            theme: theme,
            channelTheme: "Japanese History",
            status: "broad_research_completed",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Call the function
        console.log("\n========================================");
        console.log("Testing with REAL Gemini API");
        console.log("Theme:", theme);
        console.log("========================================\n");

        try {
            const result = await wrapped({
                data: { requestId: requestId },
            });
            console.log("\n=== Function Response ===");
            console.log("Success:", result.success);
            console.log("Asset ID:", result.assetId);
            console.log("Asset Type:", result.assetType);
            console.log("Next Function:", result.nextFunction);
            console.log("=========================\n");

            // Verify result structure
            expect(result.success).toBe(true);
            expect(result.assetId).toBe(assetId);
            expect(result.assetType).toBeDefined();
            expect(result.nextFunction).toBeDefined();
            expect(["short_video", "long_video", "manga", "image"]).toContain(result.assetType);
        } catch (e) {
            console.error("\n❌ Error calling function:", e);
            throw e;
        }

        // Verify Firestore updates
        const requestDoc = await admin.firestore().collection("plugins/asset/request").doc(requestId).get();
        expect(requestDoc.data()?.status).toBe("detailed_research_completed");

        const assetDoc = await admin.firestore().collection("plugins/asset/asset").doc(assetId).get();
        const assetData = assetDoc.data();

        // Verify all required fields exist
        expect(assetData?.status).toBe("detailed_research_completed");
        expect(assetData?.title).toBeDefined();
        expect(assetData?.report).toBeDefined();
        expect(assetData?.assetType).toBeDefined();
        expect(assetData?.assetTypeReason).toBeDefined();

        // Verify report has substantial content (at least 1000 characters for 10-15 min video)
        expect(assetData?.report.length).toBeGreaterThan(1000);

        // Verify title is not empty
        expect(assetData?.title.length).toBeGreaterThan(0);

        // Verify asset type reason is not empty
        expect(assetData?.assetTypeReason.length).toBeGreaterThan(0);

        console.log("\n========================================");
        console.log("✅ DETAILED RESEARCH RESULTS");
        console.log("========================================");
        console.log("Title:", assetData?.title);
        console.log("Asset Type:", assetData?.assetType);
        console.log("Asset Type Reason:", assetData?.assetTypeReason);
        console.log("\nReport Length:", assetData?.report.length, "characters");
        console.log("\n--- Report Preview (first 500 chars) ---");
        console.log(assetData?.report.substring(0, 500) + "...");
        console.log("----------------------------------------");
        console.log("\n--- Report Preview (last 300 chars) ---");
        console.log("..." + assetData?.report.substring(assetData.report.length - 300));
        console.log("========================================\n");
    }, 180000);
});
