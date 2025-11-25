import * as admin from "firebase-admin";
import * as functions from "firebase-functions-test";

const config = require("firebase-functions-test")({
    storageBucket: "mathru-net.appspot.com",
    projectId: "mathru-net",
}, "test/mathru-net-39425d37638c.json");

describe("Asset Creation Test", () => {
    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
    });

    test("Start Asset Creation", async () => {
        const firestoreInstance = admin.firestore();
        const func = require("../src/functions/start_asset_creation");
        const wrapped = config.wrap(func([], {}, {}));

        const channelTheme = "History of Japan";
        const assets = { image: "url_to_image" };

        const res = await wrapped({
            data: {
                channelTheme: channelTheme,
                assets: assets,
            },
            params: {},
        });

        expect(res.success).toBe(true);
        expect(res.requestId).toBeDefined();

        const doc = await firestoreInstance.collection("plugins/asset/request").doc(res.requestId).get();
        expect(doc.exists).toBe(true);
        const data = doc.data();
        expect(data?.channelTheme).toBe(channelTheme);
        expect(data?.status).toBe("pending");
    });

    test("Schedule Asset Creation", async () => {
        const firestoreInstance = admin.firestore();

        // Create a pending request manually
        const collectionPath = "plugins/asset/request";
        const docRef = firestoreInstance.collection(collectionPath).doc();
        await docRef.set({
            channelTheme: "Test Theme",
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const func = require("../src/functions/schedule_asset_creation");
        // Mock options to include the default database
        const wrapped = config.wrap(func([], { firestoreDatabaseIds: [""] }, {}));

        await wrapped({});

        // Check if the status has been updated to 'processing'
        const updatedDoc = await docRef.get();
        const data = updatedDoc.data();
        expect(data?.status).toBe("processing");
    });
});
