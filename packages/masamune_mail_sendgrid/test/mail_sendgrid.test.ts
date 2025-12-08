import * as admin from "firebase-admin";
import "@mathrunet/masamune";
import * as dotenv from "dotenv";
import * as path from "path";

// .envファイルを読み込み
dotenv.config({ path: path.resolve(__dirname, ".env") });

// @sendgrid/mail のモック（インポート前に定義）
jest.mock("@sendgrid/mail", () => ({
    default: {
        setApiKey: jest.fn(),
        send: jest.fn().mockResolvedValue([{ statusCode: 202, body: {} }]),
    },
    __esModule: true,
}));

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

// モックの参照を取得
import sendgrid from "@sendgrid/mail";
const mockSetApiKey = jest.mocked(sendgrid.setApiKey);
const mockSend = jest.mocked(sendgrid.send);

describe("masamune_mail_sendgrid", () => {
    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // テスト用の環境変数を設定
        process.env.MAIL_SENDGRID_APIKEY = "test-sendgrid-api-key";
    });

    afterAll(() => {
        config.cleanup();
    });

    // ============================================================
    // lib/send_grid.ts のテスト
    // ============================================================
    describe("lib/send_grid - send関数", () => {
        test("正常系: メール送信成功", async () => {
            jest.resetModules();
            jest.doMock("@sendgrid/mail", () => ({
                default: {
                    setApiKey: mockSetApiKey,
                    send: mockSend,
                },
                __esModule: true,
            }));
            const { send } = require("../src/lib/send_grid");

            await send({
                from: "sender@example.com",
                to: "recipient@example.com",
                title: "Test Subject",
                content: "Test Body Content",
            });

            expect(mockSetApiKey).toHaveBeenCalledWith("test-sendgrid-api-key");
            expect(mockSend).toHaveBeenCalledTimes(1);
            expect(mockSend).toHaveBeenCalledWith({
                to: "recipient@example.com",
                from: "sender@example.com",
                subject: "Test Subject",
                text: "Test Body Content",
            });
        });

        test("正常系: API Keyが環境変数から正しく設定される", async () => {
            const testApiKey = "SG.test-key-12345";
            process.env.MAIL_SENDGRID_APIKEY = testApiKey;

            jest.resetModules();
            jest.doMock("@sendgrid/mail", () => ({
                default: {
                    setApiKey: mockSetApiKey,
                    send: mockSend,
                },
                __esModule: true,
            }));
            const { send } = require("../src/lib/send_grid");

            await send({
                from: "a@example.com",
                to: "b@example.com",
                title: "Title",
                content: "Content",
            });

            expect(mockSetApiKey).toHaveBeenCalledWith(testApiKey);
        });

        test("異常系: API Key未設定時は空文字が使用される", async () => {
            const originalApiKey = process.env.MAIL_SENDGRID_APIKEY;
            delete process.env.MAIL_SENDGRID_APIKEY;

            jest.resetModules();
            jest.doMock("@sendgrid/mail", () => ({
                default: {
                    setApiKey: mockSetApiKey,
                    send: mockSend,
                },
                __esModule: true,
            }));
            const { send } = require("../src/lib/send_grid");

            await send({
                from: "a@example.com",
                to: "b@example.com",
                title: "Title",
                content: "Content",
            });

            expect(mockSetApiKey).toHaveBeenCalledWith("");

            // 復元
            process.env.MAIL_SENDGRID_APIKEY = originalApiKey;
        });

        test("異常系: SendGrid APIエラー時は例外がスローされる", async () => {
            const sendGridError = new Error("SendGrid API Error: Unauthorized");
            mockSend.mockRejectedValueOnce(sendGridError);

            jest.resetModules();
            jest.doMock("@sendgrid/mail", () => ({
                default: {
                    setApiKey: mockSetApiKey,
                    send: mockSend,
                },
                __esModule: true,
            }));
            const { send } = require("../src/lib/send_grid");

            await expect(send({
                from: "a@example.com",
                to: "b@example.com",
                title: "Title",
                content: "Content",
            })).rejects.toThrow("SendGrid API Error: Unauthorized");
        });
    });

    // ============================================================
    // functions/send_grid.ts のテスト（Cloud Function）
    // ============================================================
    describe("functions/send_grid - Cloud Function", () => {
        test("正常系: 全パラメータ指定でメール送信成功", async () => {
            jest.resetModules();
            jest.doMock("@sendgrid/mail", () => ({
                default: {
                    setApiKey: mockSetApiKey,
                    send: mockSend,
                },
                __esModule: true,
            }));
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    from: "sender@example.com",
                    to: "recipient@example.com",
                    title: "Test Email Title",
                    content: "Test Email Content",
                },
            });

            expect(result).toEqual({ success: true });
            expect(mockSend).toHaveBeenCalledTimes(1);
        }, 30000);

        test("エラー: from未指定", async () => {
            jest.resetModules();
            jest.doMock("@sendgrid/mail", () => ({
                default: {
                    setApiKey: mockSetApiKey,
                    send: mockSend,
                },
                __esModule: true,
            }));
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    to: "recipient@example.com",
                    title: "Test Title",
                    content: "Test Content",
                },
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: to未指定", async () => {
            jest.resetModules();
            jest.doMock("@sendgrid/mail", () => ({
                default: {
                    setApiKey: mockSetApiKey,
                    send: mockSend,
                },
                __esModule: true,
            }));
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    from: "sender@example.com",
                    title: "Test Title",
                    content: "Test Content",
                },
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: title未指定", async () => {
            jest.resetModules();
            jest.doMock("@sendgrid/mail", () => ({
                default: {
                    setApiKey: mockSetApiKey,
                    send: mockSend,
                },
                __esModule: true,
            }));
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    from: "sender@example.com",
                    to: "recipient@example.com",
                    content: "Test Content",
                },
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: content未指定", async () => {
            jest.resetModules();
            jest.doMock("@sendgrid/mail", () => ({
                default: {
                    setApiKey: mockSetApiKey,
                    send: mockSend,
                },
                __esModule: true,
            }));
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    from: "sender@example.com",
                    to: "recipient@example.com",
                    title: "Test Title",
                },
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: 全パラメータ未指定", async () => {
            jest.resetModules();
            jest.doMock("@sendgrid/mail", () => ({
                default: {
                    setApiKey: mockSetApiKey,
                    send: mockSend,
                },
                __esModule: true,
            }));
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {},
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: 空文字パラメータはエラーになる", async () => {
            jest.resetModules();
            jest.doMock("@sendgrid/mail", () => ({
                default: {
                    setApiKey: mockSetApiKey,
                    send: mockSend,
                },
                __esModule: true,
            }));
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    from: "",
                    to: "recipient@example.com",
                    title: "Test Title",
                    content: "Test Content",
                },
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: SendGrid APIエラー発生時", async () => {
            mockSend.mockRejectedValueOnce(new Error("SendGrid Error"));

            jest.resetModules();
            jest.doMock("@sendgrid/mail", () => ({
                default: {
                    setApiKey: mockSetApiKey,
                    send: mockSend,
                },
                __esModule: true,
            }));
            const func = require("../src/functions/send_grid");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    from: "sender@example.com",
                    to: "recipient@example.com",
                    title: "Test Title",
                    content: "Test Content",
                },
            })).rejects.toThrow();
        }, 30000);
    });
});
