import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import "@mathrunet/masamune_firebase";
import * as fs from "fs";
import * as path from "path";

const credentialsPath = path.resolve(__dirname, "development-for-mathrunet-e2c2c84b2167.json");
const runIntegration = process.env.MASAMUNE_RUN_INTEGRATION_TESTS === "1" && fs.existsSync(credentialsPath);
const integrationTest = runIntegration ? test : test.skip;

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, runIntegration ? credentialsPath : undefined);

describe("deleteUser Function", () => {
    let testUserId: string | null = null;

    beforeAll(() => {
        if (getApps().length === 0) {
            initializeApp();
        }
    });

    afterAll(async () => {
        // クリーンアップ: 残っているテストユーザーを削除
        if (testUserId) {
            try {
                await getAuth().deleteUser(testUserId);
            } catch (e) {
                // 既に削除済みの場合は無視
            }
        }
    });

    integrationTest("正常系: ユーザー削除成功", async () => {
        // テストユーザーを作成
        const testEmail = `test-delete-${Date.now()}@example.com`;
        const userRecord = await getAuth().createUser({
            email: testEmail,
            password: "testPassword123",
        });
        testUserId = userRecord.uid;

        // ユーザーが作成されたことを確認
        const createdUser = await getAuth().getUser(testUserId);
        expect(createdUser.uid).toBe(testUserId);

        // delete_user関数を呼び出し
        const func = require("../src/functions/delete_user");
        const wrapped = config.wrap(func([], {}, {}));
        const res = await wrapped({
            data: {
                userId: testUserId,
            },
            params: {},
        });

        expect(res.success).toBe(true);

        // ユーザーが削除されたことを確認
        await expect(getAuth().getUser(testUserId)).rejects.toThrow();
        testUserId = null; // クリーンアップ不要
    }, 50000);

    test("エラー: userIdが未指定", async () => {
        const func = require("../src/functions/delete_user");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {},
            params: {},
        })).rejects.toThrow(/No user ID specified/);
    }, 50000);

    test("エラー: userIdが空文字", async () => {
        const func = require("../src/functions/delete_user");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                userId: "",
            },
            params: {},
        })).rejects.toThrow(/No user ID specified/);
    }, 50000);

    integrationTest("エラー: 存在しないユーザー", async () => {
        const func = require("../src/functions/delete_user");
        const wrapped = config.wrap(func([], {}, {}));
        await expect(wrapped({
            data: {
                userId: "non-existent-user-id-12345",
            },
            params: {},
        })).rejects.toThrow();
    }, 50000);
});
