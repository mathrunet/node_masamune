import * as admin from "firebase-admin";
import * as functions from "firebase-functions-test";

const config = require("firebase-functions-test")({
    storageBucket: "mathru-net.appspot.com",
    projectId: "mathru-net",
}, "test/mathru-net-39425d37638c.json");

describe("Broad Research Function Test", () => {
    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        process.env.GCP_PROJECT_ID = "mathru-net";
        process.env.GEMINI_MODEL = "gemini-2.5-pro";
    });

    test("Conduct Broad Research", async () => {
        const firestoreInstance = admin.firestore();
        const myFunctionsFactory = require("../src/functions/conduct_broad_research");
        // Call the factory to get the Cloud Function
        const cloudFunction = myFunctionsFactory(["us-central1"], {}, {});
        const wrapped = config.wrap(cloudFunction);

        const channelTheme = "History of Japan";

        // Prepare a request document
        const collectionPath = "plugins/asset/request";
        const docRef = firestoreInstance.collection(collectionPath).doc();
        await docRef.set({
            channelTheme: channelTheme,
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Invoke the function with the document ID
        const res = await wrapped({
            data: {
                requestId: docRef.id
            },
        });

        expect(res.success).toBe(true);
        expect(res.selectedTheme).toBeDefined();

        // Verify that the theme is saved in Firestore
        const assetsQuery = await firestoreInstance.collection("plugins/asset/asset").where("requestId", "==", docRef.id).get();
        expect(assetsQuery.empty).toBe(false);
        const assetDoc = assetsQuery.docs[0].data();
        expect(assetDoc.theme).toBeDefined();
        expect(typeof assetDoc.theme).toBe("string");
        console.log("Generated Theme:", assetDoc.theme);
    }, 20000);
});

