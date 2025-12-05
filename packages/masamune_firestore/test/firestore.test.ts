import * as admin from "firebase-admin";
import "@mathrunet/masamune";
import * as fs from "fs";
import * as path from "path";

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

// テスト用にサービスアカウント環境変数を設定
const serviceAccountPath = path.resolve(__dirname, "development-for-mathrunet-e2c2c84b2167.json");
const serviceAccountJson = fs.readFileSync(serviceAccountPath, "utf-8");
process.env.FIRESTORE_SERVICE_ACCOUNT = serviceAccountJson;

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
        await firestoreInstance.doc(testPath).save(testData);
        const func = require("@mathrunet/masamune/src/functions/test");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: testPath,
            },
            params: {},
        });
        delete res["@time"];
        delete res["@uid"];
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
            await firestoreInstance.doc(`${sourceCollection}/${sourceData.uid}`).save(sourceData);
        }
        let col = await firestoreInstance.collection(sourceCollection).load();
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
        col = await firestoreInstance.collection(sourceCollection).load();
        d = col.docs.find((e) => e.id === "deleteTestUid4");
        expect(d).toBeUndefined();
        d = col.docs.find((e) => e.id === "deleteTestUid8");
        expect(d).toBeUndefined();
    }, 50000);
});

describe("Aggregate Model Firestore", () => {
    const testCollection = "unit/test/aggregate";
    let firestoreInstance: admin.firestore.Firestore;

    beforeAll(async () => {
        firestoreInstance = admin.firestore();
        // テストデータを作成
        for (let i = 1; i <= 5; i++) {
            await firestoreInstance.doc(`${testCollection}/doc${i}`).save({
                name: `item${i}`,
                value: i * 10,
            });
        }
    });

    afterAll(async () => {
        // テストデータを削除
        const col = await firestoreInstance.collection(testCollection).load();
        for (const doc of col.docs) {
            await doc.ref.delete();
        }
    });

    test("count - コレクション内ドキュメント数を取得", async () => {
        const func = require("../src/functions/aggregate_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: testCollection,
                method: "count",
            },
            params: {},
        });
        expect(res.status).toBe(200);
        const data = JSON.parse(res.data);
        expect(data.value).toBe(5);
    }, 50000);

    test("sum - 指定フィールドの合計値を取得", async () => {
        const func = require("../src/functions/aggregate_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: `${testCollection}/value`,
                method: "sum",
            },
            params: {},
        });
        expect(res.status).toBe(200);
        const data = JSON.parse(res.data);
        expect(data.value).toBe(150); // 10 + 20 + 30 + 40 + 50
    }, 50000);

    test("average - 指定フィールドの平均値を取得", async () => {
        const func = require("../src/functions/aggregate_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: `${testCollection}/value`,
                method: "average",
            },
            params: {},
        });
        expect(res.status).toBe(200);
        const data = JSON.parse(res.data);
        expect(data.value).toBe(30); // (10 + 20 + 30 + 40 + 50) / 5
    }, 50000);

    test("エラー: 不正なメソッド", async () => {
        const func = require("../src/functions/aggregate_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                path: testCollection,
                method: "invalid",
            },
            params: {},
        })).rejects.toThrow(/Unknown method/);
    }, 50000);

    test("エラー: パス未指定", async () => {
        const func = require("../src/functions/aggregate_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                method: "count",
            },
            params: {},
        })).rejects.toThrow(/No path specified/);
    }, 50000);
});

describe("Collection Model Firestore", () => {
    const testCollection = "unit/test/collection";
    let firestoreInstance: admin.firestore.Firestore;

    beforeAll(() => {
        firestoreInstance = admin.firestore();
    });

    afterAll(async () => {
        // テストデータを削除
        const col = await firestoreInstance.collection(testCollection).load();
        for (const doc of col.docs) {
            await doc.ref.delete();
        }
    });

    test("put - 複数ドキュメントの一括保存", async () => {
        const func = require("../src/functions/collection_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        const testData = {
            docA: { name: "Alice", age: 30 },
            docB: { name: "Bob", age: 25 },
        };
        const res = await wrapped({
            data: {
                path: testCollection,
                method: "put",
                data: JSON.stringify(testData),
            },
            params: {},
        });
        expect(res.status).toBe(200);

        // データが保存されたか確認
        const col = await firestoreInstance.collection(testCollection).load();
        expect(col.size).toBe(2);
    }, 50000);

    test("get - コレクション内の全ドキュメント取得", async () => {
        const func = require("../src/functions/collection_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: testCollection,
                method: "get",
            },
            params: {},
        });
        expect(res.status).toBe(200);
        const data = JSON.parse(res.data);
        expect(Object.keys(data).length).toBe(2);
        expect(data.docA.name).toBe("Alice");
        expect(data.docB.name).toBe("Bob");
    }, 50000);

    test("delete - コレクション内ドキュメント一括削除", async () => {
        // 先にテストデータを追加
        await firestoreInstance.doc(`${testCollection}/deleteTest1`).save({ name: "delete1" });
        await firestoreInstance.doc(`${testCollection}/deleteTest2`).save({ name: "delete2" });

        const func = require("../src/functions/collection_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: testCollection,
                method: "delete",
            },
            params: {},
        });
        expect(res.status).toBe(200);

        // 削除されたか確認
        const col = await firestoreInstance.collection(testCollection).load();
        expect(col.size).toBe(0);
    }, 50000);

    test("エラー: 不正なメソッド", async () => {
        const func = require("../src/functions/collection_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                path: testCollection,
                method: "invalid",
            },
            params: {},
        })).rejects.toThrow(/Unknown method/);
    }, 50000);

    test("エラー: putでデータなし", async () => {
        const func = require("../src/functions/collection_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                path: testCollection,
                method: "put",
            },
            params: {},
        })).rejects.toThrow(/No data specified/);
    }, 50000);
});

describe("Document Model Firestore", () => {
    const testCollection = "unit/test/document";
    let firestoreInstance: admin.firestore.Firestore;

    beforeAll(() => {
        firestoreInstance = admin.firestore();
    });

    afterAll(async () => {
        // テストデータを削除
        const col = await firestoreInstance.collection(testCollection).load();
        for (const doc of col.docs) {
            await doc.ref.delete();
        }
    });

    test("put - ドキュメント保存", async () => {
        const func = require("../src/functions/document_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        const testData = { name: "Test User", email: "test@example.com" };
        const res = await wrapped({
            data: {
                path: `${testCollection}/testDoc`,
                method: "put",
                data: JSON.stringify(testData),
            },
            params: {},
        });
        expect(res.status).toBe(200);

        // データが保存されたか確認
        const doc = await firestoreInstance.doc(`${testCollection}/testDoc`).load();
        expect(doc.exists).toBe(true);
        expect(doc.data()?.name).toBe("Test User");
    }, 50000);

    test("get - 単一ドキュメント取得", async () => {
        const func = require("../src/functions/document_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: `${testCollection}/testDoc`,
                method: "get",
            },
            params: {},
        });
        expect(res.status).toBe(200);
        const data = JSON.parse(res.data);
        expect(data.name).toBe("Test User");
        expect(data.email).toBe("test@example.com");
    }, 50000);

    test("get - 存在しないドキュメント", async () => {
        const func = require("../src/functions/document_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: `${testCollection}/nonExistent`,
                method: "get",
            },
            params: {},
        });
        expect(res.status).toBe(200);
        const data = JSON.parse(res.data);
        expect(Object.keys(data).length).toBe(0); // 空オブジェクト
    }, 50000);

    test("delete - ドキュメント削除", async () => {
        // 先にテストデータを追加
        await firestoreInstance.doc(`${testCollection}/deleteDoc`).save({ name: "toDelete" });

        const func = require("../src/functions/document_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: `${testCollection}/deleteDoc`,
                method: "delete",
            },
            params: {},
        });
        expect(res.status).toBe(200);

        // 削除されたか確認
        const doc = await firestoreInstance.doc(`${testCollection}/deleteDoc`).load();
        expect(doc.exists).toBe(false);
    }, 50000);

    test("エラー: パスに/が含まれない", async () => {
        const func = require("../src/functions/document_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                path: "invalidpath",
                method: "get",
            },
            params: {},
        })).rejects.toThrow(/Invalid document path format/);
    }, 50000);

    test("エラー: 不正なメソッド", async () => {
        const func = require("../src/functions/document_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                path: `${testCollection}/testDoc`,
                method: "invalid",
            },
            params: {},
        })).rejects.toThrow(/Unknown method/);
    }, 50000);

    test("エラー: putでデータなし", async () => {
        const func = require("../src/functions/document_model_firestore");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                path: `${testCollection}/testDoc`,
                method: "put",
            },
            params: {},
        })).rejects.toThrow(/No data specified/);
    }, 50000);
});
