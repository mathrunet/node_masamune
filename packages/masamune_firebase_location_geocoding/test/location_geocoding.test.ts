import "@mathrunet/masamune_firebase";
import * as dotenv from "dotenv";
import * as path from "path";

// .envファイルを読み込み
dotenv.config({ path: path.resolve(__dirname, ".env") });

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
});
const runIntegration = process.env.MASAMUNE_RUN_INTEGRATION_TESTS === "1"
    && !!process.env.MAP_GEOCODING_APIKEY
    && process.env.MAP_GEOCODING_APIKEY !== "YOUR_API_KEY_HERE";
const integrationTest = runIntegration ? test : test.skip;

describe("masamune_location_geocoding", () => {
    afterAll(() => {
        config.cleanup();
    });

    // ============================================================
    // functions/geocoding.ts のテスト（Cloud Function - 実際のAPI呼び出し）
    // ============================================================
    describe("functions/geocoding - Cloud Function（統合テスト）", () => {
        integrationTest("正常系: 住所から緯度経度を取得", async () => {
            const func = require("../src/functions/geocoding");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    address: "東京都渋谷区",
                },
            });

            // レスポンスの検証
            expect(result).toHaveProperty("success", true);
            expect(result).toHaveProperty("results");
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toBeGreaterThan(0);

            // 位置情報の検証
            const location = result.results[0].geometry?.location;
            expect(location).toBeDefined();
            expect(location).toHaveProperty("lat");
            expect(location).toHaveProperty("lng");
            expect(typeof location.lat).toBe("number");
            expect(typeof location.lng).toBe("number");
        }, 30000);

        integrationTest("正常系: 郵便番号から緯度経度を取得", async () => {
            const func = require("../src/functions/geocoding");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    address: "150-0001",
                },
            });

            // レスポンスの検証
            expect(result).toHaveProperty("success", true);
            expect(result).toHaveProperty("results");
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toBeGreaterThan(0);

            // 位置情報の検証
            const location = result.results[0].geometry?.location;
            expect(location).toBeDefined();
            expect(location).toHaveProperty("lat");
            expect(location).toHaveProperty("lng");
        }, 30000);

        integrationTest("正常系: 英語住所から緯度経度を取得", async () => {
            const func = require("../src/functions/geocoding");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    address: "Shibuya, Tokyo, Japan",
                },
            });

            // レスポンスの検証
            expect(result).toHaveProperty("success", true);
            expect(result).toHaveProperty("results");
            expect(Array.isArray(result.results)).toBe(true);
            expect(result.results.length).toBeGreaterThan(0);
        }, 30000);

        test("エラー: address未指定", async () => {
            const func = require("../src/functions/geocoding");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {},
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: addressがnull", async () => {
            const func = require("../src/functions/geocoding");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    address: null,
                },
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);

        test("エラー: addressがundefined", async () => {
            const func = require("../src/functions/geocoding");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    address: undefined,
                },
            })).rejects.toThrow(/Query parameter is invalid/);
        }, 30000);
    });
});
