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
process.env.STORAGE_SERVICE_ACCOUNT = serviceAccountJson;

describe("storage_firebase Function", () => {
    const testBucket = "development-for-mathrunet.appspot.com";
    const testFilePath = `unit/test/storage/testfile-${Date.now()}.txt`;
    const testFullPath = `${testBucket}/${testFilePath}`;
    const testContent = "Hello, Storage Test!";
    const testBase64 = Buffer.from(testContent).toString("base64");

    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
    });

    afterAll(async () => {
        // クリーンアップ: テストファイルを削除
        try {
            const bucket = admin.storage().bucket(testBucket);
            await bucket.file(testFilePath).delete();
        } catch (e) {
            // 既に削除済みの場合は無視
        }
    });

    test("PUT - ファイルアップロード成功", async () => {
        const func = require("../src/functions/storage_firebase");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: testFullPath,
                method: "put",
                binary: testBase64,
                meta: {
                    contentType: "text/plain",
                },
            },
            params: {},
        });

        expect(res.status).toBe(200);
        expect(res.message).toBe("File uploaded successfully");
        expect(res.meta.contentType).toBe("text/plain");
        expect(res.meta.downloadUri).toBeDefined();
        expect(res.meta.publicUri).toBeDefined();
    }, 50000);

    test("GET - ファイル取得成功", async () => {
        const func = require("../src/functions/storage_firebase");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: testFullPath,
                method: "get",
            },
            params: {},
        });

        expect(res.status).toBe(200);
        expect(res.binary).toBe(testBase64);
        expect(res.meta.contentType).toBe("text/plain");
        expect(res.meta.downloadUri).toBeDefined();
        expect(res.meta.publicUri).toBeDefined();

        // Base64をデコードして内容を確認
        const decoded = Buffer.from(res.binary, "base64").toString("utf-8");
        expect(decoded).toBe(testContent);
    }, 50000);

    test("DELETE - ファイル削除成功", async () => {
        const func = require("../src/functions/storage_firebase");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: testFullPath,
                method: "delete",
            },
            params: {},
        });

        expect(res.status).toBe(200);
        expect(res.message).toBe("File deleted successfully");
    }, 50000);

    test("GET - 存在しないファイル (404)", async () => {
        const func = require("../src/functions/storage_firebase");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: `${testBucket}/non-existent-file-12345.txt`,
                method: "get",
            },
            params: {},
        });

        expect(res.status).toBe(404);
        expect(res.binary).toBeNull();
        expect(res.error).toBe("File not found");
    }, 50000);

    test("DELETE - 存在しないファイル (404)", async () => {
        const func = require("../src/functions/storage_firebase");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                path: `${testBucket}/non-existent-file-12345.txt`,
                method: "delete",
            },
            params: {},
        });

        expect(res.status).toBe(404);
        expect(res.error).toBe("File not found");
    }, 50000);

    test("エラー: method未指定", async () => {
        const func = require("../src/functions/storage_firebase");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                path: testFullPath,
            },
            params: {},
        })).rejects.toThrow(/No method specified/);
    }, 50000);

    test("エラー: path未指定", async () => {
        const func = require("../src/functions/storage_firebase");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                method: "get",
            },
            params: {},
        })).rejects.toThrow(/No path specified/);
    }, 50000);

    test("エラー: 不正なpath形式", async () => {
        const func = require("../src/functions/storage_firebase");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                path: "invalid-path-without-slash",
                method: "get",
            },
            params: {},
        })).rejects.toThrow(/Invalid path format/);
    }, 50000);

    test("エラー: PUT時にbinary未指定", async () => {
        const func = require("../src/functions/storage_firebase");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                path: testFullPath,
                method: "put",
            },
            params: {},
        })).rejects.toThrow(/No binary data specified/);
    }, 50000);
});
