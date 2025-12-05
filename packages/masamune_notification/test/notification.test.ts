import * as admin from "firebase-admin";
import "@mathrunet/masamune";

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

describe("send_notification Function", () => {
    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
    });

    describe("dryRun モード (FCM通信テスト)", () => {
        test("正常系: トークン指定でdryRun成功", async () => {
            const func = require("../src/functions/send_notification");
            const wrapped = config.wrap(func([], {}, {}));

            // ダミートークン（実際のデバイストークン形式）
            const dummyToken = "dITFJXqu2k0:APA91bHGm0P...dummy_token_for_test";

            const res = await wrapped({
                data: {
                    title: "テスト通知",
                    body: "これはdryRunテストです",
                    targetToken: dummyToken,
                    dryRun: true,
                },
                params: {},
            });

            expect(res.success).toBe(true);
            expect(res.results).toBeDefined();
            console.log("dryRun token response:", JSON.stringify(res.results));
        }, 50000);

        test("正常系: トピック指定でdryRun成功", async () => {
            const func = require("../src/functions/send_notification");
            const wrapped = config.wrap(func([], {}, {}));

            const res = await wrapped({
                data: {
                    title: "テスト通知",
                    body: "トピック宛のdryRunテストです",
                    targetTopic: "test-topic",
                    dryRun: true,
                },
                params: {},
            });

            expect(res.success).toBe(true);
            expect(res.results).toBeDefined();
            console.log("dryRun topic response:", JSON.stringify(res.results));
        }, 50000);

        test("正常系: 複数トークン指定でdryRun成功", async () => {
            const func = require("../src/functions/send_notification");
            const wrapped = config.wrap(func([], {}, {}));

            const dummyTokens = [
                "token1_dummy_for_test",
                "token2_dummy_for_test",
                "token3_dummy_for_test",
            ];

            const res = await wrapped({
                data: {
                    title: "テスト通知",
                    body: "複数トークンdryRunテスト",
                    targetToken: dummyTokens,
                    dryRun: true,
                },
                params: {},
            });

            expect(res.success).toBe(true);
            expect(res.results).toBeDefined();
            console.log("dryRun multiple tokens response:", JSON.stringify(res.results));
        }, 50000);

        test("正常系: dataペイロード付きでdryRun成功", async () => {
            const func = require("../src/functions/send_notification");
            const wrapped = config.wrap(func([], {}, {}));

            const res = await wrapped({
                data: {
                    title: "テスト通知",
                    body: "データ付き通知テスト",
                    targetTopic: "test-topic",
                    data: {
                        key1: "value1",
                        key2: "value2",
                    },
                    channelId: "test-channel",
                    sound: "default",
                    badgeCount: 1,
                    dryRun: true,
                },
                params: {},
            });

            expect(res.success).toBe(true);
            expect(res.results).toBeDefined();
            console.log("dryRun with data response:", JSON.stringify(res.results));
        }, 50000);
    });

    describe("バリデーションエラー", () => {
        test("エラー: title未指定", async () => {
            const func = require("../src/functions/send_notification");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    body: "本文のみ",
                    targetTopic: "test-topic",
                    dryRun: true,
                },
                params: {},
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 50000);

        test("エラー: body未指定", async () => {
            const func = require("../src/functions/send_notification");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    title: "タイトルのみ",
                    targetTopic: "test-topic",
                    dryRun: true,
                },
                params: {},
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 50000);

        test("エラー: 送信先未指定 (token/topic両方なし)", async () => {
            const func = require("../src/functions/send_notification");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    title: "テスト",
                    body: "送信先なし",
                    dryRun: true,
                },
                params: {},
            })).rejects.toThrow();
        }, 50000);
    });

    describe("responseTokenList モード", () => {
        test("正常系: トークンリストを返す（送信なし）", async () => {
            const func = require("../src/functions/send_notification");
            const wrapped = config.wrap(func([], {}, {}));

            const dummyTokens = ["token1", "token2", "token3"];

            const res = await wrapped({
                data: {
                    title: "テスト通知",
                    body: "responseTokenListテスト",
                    targetToken: dummyTokens,
                    responseTokenList: true,
                },
                params: {},
            });

            expect(res.success).toBe(true);
            expect(res.results).toBeDefined();
            // responseTokenListの場合、トークンリストが配列で返される
            expect(Array.isArray(res.results)).toBe(true);
            console.log("responseTokenList response:", JSON.stringify(res.results));
        }, 50000);
    });
});
