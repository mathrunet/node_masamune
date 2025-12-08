import * as admin from "firebase-admin";
import "@mathrunet/masamune";
import * as dotenv from "dotenv";
import * as path from "path";

// .envファイルを読み込み
dotenv.config({ path: path.resolve(__dirname, ".env") });

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

describe("masamune_ai_openai", () => {
    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        // 環境変数のチェック
        if (!process.env.OPENAI_APIKEY) {
            console.warn("Warning: OPENAI_APIKEY is not set. Integration tests may fail.");
        }
    });

    afterAll(() => {
        config.cleanup();
    });

    // ============================================================
    // functions/openai_chat_gpt.ts のテスト（Cloud Function - 実際のAPI呼び出し）
    // ============================================================
    describe("functions/openai_chat_gpt - Cloud Function（統合テスト）", () => {
        test("正常系: 実際にOpenAI APIを呼び出してChat完了", async () => {
            const func = require("../src/functions/openai_chat_gpt");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    message: [
                        { role: "user", content: "Say 'Hello, this is a test!' in exactly those words." }
                    ],
                },
            });

            // レスポンスにchoices配列が含まれることを確認
            expect(result).toHaveProperty("choices");
            expect(Array.isArray(result.choices)).toBe(true);
            expect(result.choices.length).toBeGreaterThan(0);
            expect(result.choices[0]).toHaveProperty("message");
            expect(result.choices[0].message).toHaveProperty("content");
        }, 60000);

        test("正常系: model指定（gpt-3.5-turbo）で正常にレスポンスを取得", async () => {
            const func = require("../src/functions/openai_chat_gpt");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    message: [{ role: "user", content: "What is 1 + 1? Answer with just the number." }],
                    model: "gpt-3.5-turbo",
                },
            });

            expect(result).toHaveProperty("choices");
            expect(result.choices[0].message.content).toBeDefined();
        }, 60000);

        test("正常系: temperature指定で正常にレスポンスを取得", async () => {
            const func = require("../src/functions/openai_chat_gpt");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    message: [{ role: "user", content: "Say 'test' once." }],
                    temperature: 0.1,
                },
            });

            expect(result).toHaveProperty("choices");
            expect(result.choices[0].message.content).toBeDefined();
        }, 60000);

        test("正常系: 複数メッセージの会話で正常にレスポンスを取得", async () => {
            const func = require("../src/functions/openai_chat_gpt");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    message: [
                        { role: "system", content: "You are a helpful assistant. Always respond in exactly 3 words." },
                        { role: "user", content: "Hello!" }
                    ],
                },
            });

            expect(result).toHaveProperty("choices");
            expect(result.choices[0].message.content).toBeDefined();
        }, 60000);

        test("エラー: message未指定", async () => {
            const func = require("../src/functions/openai_chat_gpt");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {},
            })).rejects.toThrow(/No content specified in `message`/);
        }, 30000);

        test("エラー: message空配列", async () => {
            const func = require("../src/functions/openai_chat_gpt");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    message: [],
                },
            })).rejects.toThrow(/No content specified in `message`/);
        }, 30000);
    });
});
