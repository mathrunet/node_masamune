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
process.env.GOOGLE_SERVICE_ACCOUNT = serviceAccountJson;

describe("google_token Function", () => {
    let testUserId: string | null = null;

    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
    });

    afterAll(async () => {
        // クリーンアップ: テストユーザーを削除
        if (testUserId) {
            try {
                await admin.auth().deleteUser(testUserId);
                console.log(`Deleted test user: ${testUserId}`);
            } catch (e) {
                // 既に削除済みの場合は無視
            }
        }
    });

    test("正常系: トークン取得成功", async () => {
        // テストユーザーを作成
        const testEmail = `test-token-${Date.now()}@example.com`;
        const userRecord = await admin.auth().createUser({
            email: testEmail,
            password: "testPassword123",
        });
        testUserId = userRecord.uid;
        console.log(`Created test user: ${testUserId}`);

        // google_token関数を呼び出し
        const func = require("../src/functions/google_token");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                duration: 3600,
            },
            auth: {
                uid: testUserId,
            },
            params: {},
        });

        expect(res.accessToken).toBeDefined();
        expect(typeof res.accessToken).toBe("string");
        expect(res.accessToken.length).toBeGreaterThan(0);
        expect(res.expiresAt).toBeDefined();
        expect(typeof res.expiresAt).toBe("number");
        expect(res.expiresAt).toBeGreaterThan(Date.now());
        console.log(`Token obtained, expires at: ${new Date(res.expiresAt).toISOString()}`);
    }, 50000);

    test("正常系: duration未指定でもデフォルト値で動作", async () => {
        // 前のテストで作成したユーザーを再利用
        if (!testUserId) {
            const testEmail = `test-token-default-${Date.now()}@example.com`;
            const userRecord = await admin.auth().createUser({
                email: testEmail,
                password: "testPassword123",
            });
            testUserId = userRecord.uid;
        }

        const func = require("../src/functions/google_token");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {},
            auth: {
                uid: testUserId,
            },
            params: {},
        });

        expect(res.accessToken).toBeDefined();
        expect(res.expiresAt).toBeDefined();
    }, 50000);

    test("エラー: 認証なし (auth未指定)", async () => {
        const func = require("../src/functions/google_token");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {},
            params: {},
        })).rejects.toThrow();
    }, 50000);

    test("エラー: サービスアカウント環境変数未設定", async () => {
        // 環境変数を一時的に削除
        const originalEnv = process.env.GOOGLE_SERVICE_ACCOUNT;
        delete process.env.GOOGLE_SERVICE_ACCOUNT;

        try {
            // 新しいモジュールインスタンスを取得するためキャッシュをクリア
            jest.resetModules();
            const func = require("../src/functions/google_token");
            const configNew = require("firebase-functions-test")({
                storageBucket: "development-for-mathrunet.appspot.com",
                projectId: "development-for-mathrunet",
            }, "test/development-for-mathrunet-e2c2c84b2167.json");
            const wrapped = configNew.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {},
                auth: {
                    uid: "test-user",
                },
                params: {},
            })).rejects.toThrow();
        } finally {
            // 環境変数を復元
            process.env.GOOGLE_SERVICE_ACCOUNT = originalEnv;
        }
    }, 50000);
});
