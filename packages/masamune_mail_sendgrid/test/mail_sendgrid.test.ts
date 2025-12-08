import * as admin from "firebase-admin";
import "@mathrunet/masamune";
import * as dotenv from "dotenv";
import * as path from "path";
import { SendGridRequest } from "../src/lib/interface";

// .envファイルを読み込み
dotenv.config({ path: path.resolve(__dirname, ".env") });

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

describe("masamune_mail_sendgrid", () => {
    // テスト用のメールアドレス（.envから取得）
    const testEmailFrom = process.env.TEST_EMAIL_FROM ?? "";
    const testEmailTo = process.env.TEST_EMAIL_TO ?? "";

    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        // 環境変数のチェック
        if (!process.env.MAIL_SENDGRID_APIKEY) {
            console.warn("Warning: MAIL_SENDGRID_APIKEY is not set. Integration tests may fail.");
        }
        if (!testEmailFrom || !testEmailTo) {
            console.warn("Warning: TEST_EMAIL_FROM or TEST_EMAIL_TO is not set. Integration tests may fail.");
        }
    });

    afterAll(() => {
        config.cleanup();
    });

    // ============================================================
    // lib/send_grid.ts のテスト（実際のAPI呼び出し）
    // ============================================================
    describe("lib/send_grid - send関数（統合テスト）", () => {
        test("正常系: 実際にSendGrid APIを呼び出してメール送信", async () => {
            const { send } = require("../src/lib/send_grid");

            // 実際のAPIを呼び出し
            const content: SendGridRequest = {
                from: testEmailFrom,
                to: testEmailTo,
                subject: "[Test] SendGrid Integration Test - lib/send_grid",
                text: `This is a test email sent from masamune_mail_sendgrid integration test.\n\nTimestamp: ${new Date().toISOString()}`,
            };
            await expect(send(content)).resolves.not.toThrow();
        }, 30000);
    });

    // ============================================================
    // functions/send_grid.ts のテスト（Cloud Function - 実際のAPI呼び出し）
    // ============================================================
    describe("functions/send_grid - Cloud Function（統合テスト）", () => {
        test("正常系: 全パラメータ指定でメール送信成功", async () => {
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    from: testEmailFrom,
                    to: testEmailTo,
                    title: "[Test] SendGrid Integration Test - Cloud Function",
                    content: `This is a test email sent from masamune_mail_sendgrid Cloud Function integration test.\n\nTimestamp: ${new Date().toISOString()}`,
                },
            });

            expect(result).toEqual({ success: true });
        }, 30000);

        test("エラー: from未指定", async () => {
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    to: testEmailTo,
                    title: "Test Title",
                    content: "Test Content",
                },
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: to未指定", async () => {
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    from: testEmailFrom,
                    title: "Test Title",
                    content: "Test Content",
                },
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: title未指定", async () => {
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    from: testEmailFrom,
                    to: testEmailTo,
                    content: "Test Content",
                },
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: content未指定", async () => {
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    from: testEmailFrom,
                    to: testEmailTo,
                    title: "Test Title",
                },
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: 全パラメータ未指定", async () => {
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {},
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: 空文字パラメータはエラーになる", async () => {
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    from: "",
                    to: testEmailTo,
                    title: "Test Title",
                    content: "Test Content",
                },
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);
    });
});
