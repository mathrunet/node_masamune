import * as admin from "firebase-admin";
import "@mathrunet/masamune";
import * as dotenv from "dotenv";
import * as path from "path";
import * as algolia from "algoliasearch";

// .envファイルを読み込み
dotenv.config({ path: path.resolve(__dirname, ".env") });

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

describe("masamune_algolia", () => {
    const testIndexName = "test_algolia";
    const testDocPath = `unit/test/${testIndexName}`;
    let algoliaClient: ReturnType<typeof algolia.algoliasearch> | null = null;

    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        // 環境変数のチェック
        if (!process.env.ALGOLIA_APPID || process.env.ALGOLIA_APPID === "YOUR_ALGOLIA_APP_ID") {
            console.warn("Warning: ALGOLIA_APPID is not set. Integration tests may fail.");
        }
        if (!process.env.ALGOLIA_APIKEY || process.env.ALGOLIA_APIKEY === "YOUR_ALGOLIA_API_KEY") {
            console.warn("Warning: ALGOLIA_APIKEY is not set. Integration tests may fail.");
        }
        // Algoliaクライアントを初期化
        if (process.env.ALGOLIA_APPID && process.env.ALGOLIA_APIKEY) {
            algoliaClient = algolia.algoliasearch(
                process.env.ALGOLIA_APPID,
                process.env.ALGOLIA_APIKEY,
            );
        }
    });

    afterAll(async () => {
        // テストデータをクリーンアップ
        if (algoliaClient) {
            try {
                await algoliaClient.deleteObject({
                    indexName: testIndexName,
                    objectID: "testDoc1",
                });
            } catch (e) {
                // 既に削除済みの場合は無視
            }
            try {
                await algoliaClient.deleteObject({
                    indexName: testIndexName,
                    objectID: "testDoc2",
                });
            } catch (e) {
                // 既に削除済みの場合は無視
            }
        }
        config.cleanup();
    });

    // ============================================================
    // functions/algolia.ts のテスト（Firestoreトリガー - 実際のAPI呼び出し）
    // ============================================================
    describe("functions/algolia - Firestoreトリガー（統合テスト）", () => {
        test("正常系: ドキュメント作成時にAlgoliaに同期", async () => {
            const func = require("../src/functions/algolia");
            const wrapped = config.wrap(func([], { path: testDocPath }, {}));

            const testData = {
                name: "Test Item",
                description: "This is a test item",
                price: 100,
            };

            // 作成イベントをシミュレート（beforeがnull、afterがデータあり）
            const beforeSnap = config.firestore.makeDocumentSnapshot(null, `${testDocPath}/testDoc1`);
            const afterSnap = config.firestore.makeDocumentSnapshot(testData, `${testDocPath}/testDoc1`);

            await wrapped({
                data: {
                    before: beforeSnap,
                    after: afterSnap,
                },
                params: { docId: "testDoc1" },
            });

            // Algoliaでデータを検証
            if (algoliaClient) {
                // 少し待ってからデータを取得（Algoliaの反映待ち）
                await new Promise(resolve => setTimeout(resolve, 3000));
                const result = await algoliaClient.getObject({
                    indexName: testIndexName,
                    objectID: "testDoc1",
                });
                expect(result).toHaveProperty("name", "Test Item");
                expect(result).toHaveProperty("description", "This is a test item");
                expect(result).toHaveProperty("price", 100);
                expect(result).toHaveProperty("objectID", "testDoc1");
            }
        }, 30000);

        test("正常系: ドキュメント更新時にAlgoliaに同期", async () => {
            const func = require("../src/functions/algolia");
            const wrapped = config.wrap(func([], { path: testDocPath }, {}));

            const beforeData = {
                name: "Test Item",
                description: "This is a test item",
                price: 100,
            };
            const afterData = {
                name: "Updated Test Item",
                description: "This is an updated test item",
                price: 200,
            };

            // 更新イベントをシミュレート（beforeもafterもデータあり）
            const beforeSnap = config.firestore.makeDocumentSnapshot(beforeData, `${testDocPath}/testDoc1`);
            const afterSnap = config.firestore.makeDocumentSnapshot(afterData, `${testDocPath}/testDoc1`);

            await wrapped({
                data: {
                    before: beforeSnap,
                    after: afterSnap,
                },
                params: { docId: "testDoc1" },
            });

            // Algoliaでデータを検証
            if (algoliaClient) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                const result = await algoliaClient.getObject({
                    indexName: testIndexName,
                    objectID: "testDoc1",
                });
                expect(result).toHaveProperty("name", "Updated Test Item");
                expect(result).toHaveProperty("description", "This is an updated test item");
                expect(result).toHaveProperty("price", 200);
            }
        }, 30000);

        test("正常系: ドキュメント削除時にAlgoliaから削除", async () => {
            const func = require("../src/functions/algolia");
            const wrapped = config.wrap(func([], { path: testDocPath }, {}));

            // まずテストデータを作成
            if (algoliaClient) {
                await algoliaClient.addOrUpdateObject({
                    indexName: testIndexName,
                    objectID: "testDoc2",
                    body: {
                        name: "To Be Deleted",
                        objectID: "testDoc2",
                    },
                });
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            const beforeData = {
                name: "To Be Deleted",
            };

            // 削除イベントをシミュレート（beforeがデータあり、afterがnull）
            const beforeSnap = config.firestore.makeDocumentSnapshot(beforeData, `${testDocPath}/testDoc2`);
            const afterSnap = config.firestore.makeDocumentSnapshot(null, `${testDocPath}/testDoc2`);

            await wrapped({
                data: {
                    before: beforeSnap,
                    after: afterSnap,
                },
                params: { docId: "testDoc2" },
            });

            // Algoliaからデータが削除されたことを検証
            if (algoliaClient) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                await expect(algoliaClient.getObject({
                    indexName: testIndexName,
                    objectID: "testDoc2",
                })).rejects.toThrow();
            }
        }, 30000);

        test("正常系: beforeもafterもnullの場合は何もしない", async () => {
            const func = require("../src/functions/algolia");
            const wrapped = config.wrap(func([], { path: testDocPath }, {}));

            // 両方nullのイベント
            const beforeSnap = config.firestore.makeDocumentSnapshot(null, `${testDocPath}/testDoc3`);
            const afterSnap = config.firestore.makeDocumentSnapshot(null, `${testDocPath}/testDoc3`);

            // エラーなく完了することを確認
            await expect(wrapped({
                data: {
                    before: beforeSnap,
                    after: afterSnap,
                },
                params: { docId: "testDoc3" },
            })).resolves.toBeUndefined();
        }, 30000);
    });
});
