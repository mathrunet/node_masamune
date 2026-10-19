import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import * as functions from "firebase-functions-test";
import * as fs from "fs";
import * as path from "path";

const liveTestsEnabled = process.env.MASAMUNE_RUN_LIVE_TESTS === "1" &&
    fs.existsSync(path.join(__dirname, "mathru-net-39425d37638c.json"));
const config = liveTestsEnabled ? require("firebase-functions-test")({
    storageBucket: "mathru-net.appspot.com",
    projectId: "mathru-net",
}, "test/mathru-net-39425d37638c.json") : undefined;

(liveTestsEnabled ? describe : describe.skip)("Broad Research Function Test", () => {
    beforeAll(() => {
        if (getApps().length === 0) {
            initializeApp();
        }
        process.env.GCP_PROJECT_ID = "mathru-net";
        process.env.GEMINI_MODEL = "gemini-2.5-pro";
    });

    test("Conduct Broad Research", async () => {
        const firestoreInstance = getFirestore();
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
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
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
