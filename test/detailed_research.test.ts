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
        process.env.GEMINI_MODEL = "gemini-2.5-pro";
    });

    // Mock VertexAI
    jest.mock("@google-cloud/vertexai", () => {
        return {
            VertexAI: jest.fn().mockImplementation(() => {
                return {
                    preview: {
                        getGenerativeModel: jest.fn().mockReturnValue({
                            generateContent: jest.fn().mockResolvedValue({
                                response: {
                                    candidates: [{
                                        content: {
                                            parts: [{
                                                text: "Here is the result:\n" + JSON.stringify({
                                                    title: "Mocked Title",
                                                    report: "Mocked Report"
                                                }) + "\n<ctrl42>"
                                            }]
                                        }
                                    }]
                                }
                            })
                        })
                    }
                };
            }),
            SchemaType: {
                OBJECT: "OBJECT",
                STRING: "STRING"
            }
        };
    });

    afterAll(() => {
        config.cleanup();
    });

    test("Conduct Detailed Research", async () => {
        const myFunctionsFactory = require("../src/functions/conduct_detailed_research");
        const cloudFunction = myFunctionsFactory(["us-central1"], {}, {});
        wrapped = config.wrap(cloudFunction);

        // Increase timeout for AI generation
        jest.setTimeout(30000);

        const requestId = "test_detailed_request_id";
        const assetId = "test_detailed_asset_id";
        const theme = "The History of Sushi";

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
            channelTheme: "Japanese Culture",
            status: "broad_research_completed",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Call the function
        console.log("Calling wrapped function...");
        try {
            const result = await wrapped({
                data: { requestId: requestId },
            });
            console.log("Wrapped function result:", result);

            // Verify result structure
            expect(result.success).toBe(true);
            expect(result.assetId).toBe(assetId);
        } catch (e) {
            console.error("Error calling wrapped function:", e);
            throw e;
        }

        // Verify Firestore updates
        const requestDoc = await admin.firestore().collection("plugins/asset/request").doc(requestId).get();
        expect(requestDoc.data()?.status).toBe("detailed_research_completed");

        const assetDoc = await admin.firestore().collection("plugins/asset/asset").doc(assetId).get();
        const assetData = assetDoc.data();
        expect(assetData?.status).toBe("detailed_research_completed");
        expect(assetData?.title).toBeDefined();
        expect(assetData?.report).toBeDefined();

        console.log("Generated Title:", assetData?.title);
        console.log("Generated Report:", assetData?.report);
    }, 20000);
});
