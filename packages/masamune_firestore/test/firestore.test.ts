import * as admin from "firebase-admin";
import { utils } from "@mathrunet/masamune";

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

describe("Firestore Test", () => {
    beforeAll(() => {
        admin.initializeApp();
    });
    test("Test for test", async () => {
        const testPath = "unit/test/user/aaa";
        const testData = {
            name: "aaa",
            text: "bbb",
            number: 100,
        };
        const firestoreInstance = admin.firestore();
        await firestoreInstance.doc(testPath).set(testData);
        const func = require("@mathrunet/masamune/src/functions/test");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: testPath,
            },
            params: {},
        });
        expect(res).toStrictEqual(testData);
    });
    test("Delete document test", async () => {
        const firestoreInstance = admin.firestore();
        const sourceCollection = "unit/test/delete";
        const watchCollection = "unit/test/watch";
        const sourceDatas: { [key: string]: any }[] = [];
        for (let i = 0; i < 10; i++) {
            const sourceUid = `deleteTestUid${i}`;
            const sourceData = {
                uid: sourceUid,
                name: `event${i}`,
                text: `eventtext${i}`,
                number: i,
            };
            sourceDatas.push(sourceData);
        }
        for (const sourceData of sourceDatas) {
            await firestoreInstance.doc(`${sourceCollection}/${sourceData.uid}`).set(sourceData);
        }
        let col = await firestoreInstance.collection(sourceCollection).get();
        let d = col.docs.find((e) => e.id === "deleteTestUid4");
        expect(d).not.toBeUndefined();
        d = col.docs.find((e) => e.id === "deleteTestUid8");
        expect(d).not.toBeUndefined();
        const func = require("../src/functions/delete_documents");
        let wrapped = config.wrap(func([], { path: watchCollection, relation: (path: string) => sourceCollection }, {}));
        const beforeSnap = config.firestore.makeDocumentSnapshot({ name: "test" }, `${watchCollection}/watchTestUuid`);
        const afterSnap = config.firestore.makeDocumentSnapshot(null, `${watchCollection}/watchTestUuid`);
        await wrapped({
            afterSnap: afterSnap,
            beforeSnap: beforeSnap,
        });
        col = await firestoreInstance.collection(sourceCollection).get();
        d = col.docs.find((e) => e.id === "deleteTestUid4");
        expect(d).toBeUndefined();
        d = col.docs.find((e) => e.id === "deleteTestUid8");
        expect(d).toBeUndefined();
    }, 50000);
});
