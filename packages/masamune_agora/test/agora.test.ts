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

describe("masamune_agora", () => {
    let hasValidCredentials = false;

    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        // 環境変数のチェック
        const appId = process.env.AGORA_APP_ID;
        const appCert = process.env.AGORA_APP_CERTIFICATE;
        hasValidCredentials = !!(
            appId && appId !== "YOUR_AGORA_APP_ID" &&
            appCert && appCert !== "YOUR_AGORA_APP_CERTIFICATE"
        );
        if (!hasValidCredentials) {
            console.warn("Warning: AGORA credentials are not set. Token tests will be skipped.");
        }
    });

    afterAll(() => {
        config.cleanup();
    });

    // ============================================================
    // functions/agora_token.ts のテスト（onCall）
    // ============================================================
    describe("functions/agora_token - トークン生成", () => {
        test("正常系: uid指定でトークン生成", async () => {
            if (!hasValidCredentials) {
                console.log("Skipping: AGORA credentials not set");
                return;
            }

            const func = require("../src/functions/agora_token");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    name: "test_channel",
                    uid: 12345,
                },
            });

            expect(result).toHaveProperty("channel", "test_channel");
            expect(result).toHaveProperty("token");
            expect(typeof result.token).toBe("string");
            expect(result.token.length).toBeGreaterThan(0);
        }, 30000);

        test("正常系: account指定でトークン生成", async () => {
            if (!hasValidCredentials) {
                console.log("Skipping: AGORA credentials not set");
                return;
            }

            const func = require("../src/functions/agora_token");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    name: "test_channel",
                    account: "user123",
                },
            });

            expect(result).toHaveProperty("channel", "test_channel");
            expect(result).toHaveProperty("token");
            expect(typeof result.token).toBe("string");
            expect(result.token.length).toBeGreaterThan(0);
        }, 30000);

        test("正常系: role=audience指定でSubscriberトークン生成", async () => {
            if (!hasValidCredentials) {
                console.log("Skipping: AGORA credentials not set");
                return;
            }

            const func = require("../src/functions/agora_token");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    name: "test_channel",
                    uid: 67890,
                    role: "audience",
                },
            });

            expect(result).toHaveProperty("channel", "test_channel");
            expect(result).toHaveProperty("token");
            expect(typeof result.token).toBe("string");
            expect(result.token.length).toBeGreaterThan(0);
        }, 30000);

        test("正常系: role=broadcaster指定でPublisherトークン生成", async () => {
            if (!hasValidCredentials) {
                console.log("Skipping: AGORA credentials not set");
                return;
            }

            const func = require("../src/functions/agora_token");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    name: "test_channel",
                    uid: 11111,
                    role: "broadcaster",
                },
            });

            expect(result).toHaveProperty("channel", "test_channel");
            expect(result).toHaveProperty("token");
            expect(typeof result.token).toBe("string");
            expect(result.token.length).toBeGreaterThan(0);
        }, 30000);

        test("正常系: expirationSeconds指定でカスタム有効期限のトークン生成", async () => {
            if (!hasValidCredentials) {
                console.log("Skipping: AGORA credentials not set");
                return;
            }

            const func = require("../src/functions/agora_token");
            const wrapped = config.wrap(func([], {}, {}));

            const result = await wrapped({
                data: {
                    name: "test_channel",
                    uid: 22222,
                    expirationSeconds: 7200, // 2時間
                },
            });

            expect(result).toHaveProperty("channel", "test_channel");
            expect(result).toHaveProperty("token");
            expect(typeof result.token).toBe("string");
            expect(result.token.length).toBeGreaterThan(0);
        }, 30000);

        test("エラー: チャンネル名なし", async () => {
            const func = require("../src/functions/agora_token");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    uid: 12345,
                },
            })).rejects.toThrow(/Channel is invalid/);
        }, 30000);

        test("エラー: uid/accountなし", async () => {
            const func = require("../src/functions/agora_token");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    name: "test_channel",
                },
            })).rejects.toThrow(/uid or account is required/);
        }, 30000);
    });

    // ============================================================
    // functions/agora_cloud_recording.ts のテスト（onObjectFinalized）
    // ============================================================
    describe("functions/agora_cloud_recording - Storage トリガー", () => {
        const testBucket = "development-for-mathrunet.appspot.com";
        const testDir = "unit/test/agora";
        let uploadedFiles: string[] = [];

        afterAll(async () => {
            // クリーンアップ: テストで生成されたファイルを削除
            const bucket = admin.storage().bucket(testBucket);
            for (const filePath of uploadedFiles) {
                try {
                    await bucket.file(filePath).delete();
                    console.log(`Deleted: ${filePath}`);
                } catch (e) {
                    // 既に削除済みの場合は無視
                }
            }
        });

        test("正常系: スクリーンショットファイル処理", async () => {
            const bucket = admin.storage().bucket(testBucket);

            // テスト用のJPGファイルを作成
            // ファイル名パターン: sid_channelId__uid_s_123__uid_e_video_456.jpg
            const channelId = `testChannel${Date.now()}`;
            const testFileName = `sid_${channelId}__uid_s_123__uid_e_video_456.jpg`;
            const testFilePath = `${testDir}/${testFileName}`;

            // 最小限のJPEGファイル
            const minimalJpeg = Buffer.from([
                0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
                0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9
            ]);

            await bucket.file(testFilePath).save(minimalJpeg, {
                metadata: { contentType: "image/jpeg" },
            });
            uploadedFiles.push(testFilePath);
            console.log(`Uploaded test file: ${testFilePath}`);

            // Cloud Recording関数を実行
            const func = require("../src/functions/agora_cloud_recording");
            const wrapped = config.wrap(func([], {}, {}));

            const event = {
                bucket: testBucket,
                data: {
                    bucket: testBucket,
                    name: testFilePath,
                },
            };

            await wrapped(event);

            // リネーム後のファイルを確認（バケットルートに保存される）
            const targetPath = `${channelId}.jpg`;
            const [exists] = await bucket.file(targetPath).exists();
            expect(exists).toBe(true);
            uploadedFiles.push(targetPath);

            // 元ファイルは削除されていることを確認
            const [originalExists] = await bucket.file(testFilePath).exists();
            expect(originalExists).toBe(false);
            uploadedFiles = uploadedFiles.filter(f => f !== testFilePath);
        }, 60000);

        test("正常系: M3U8ファイル処理", async () => {
            const bucket = admin.storage().bucket(testBucket);

            const channelId = `m3u8Channel${Date.now()}`;
            const testFileName = `sid_${channelId}.m3u8`;
            const testFilePath = `${testDir}/${testFileName}`;

            // 最小限のM3U8ファイル
            const m3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
segment0.ts
#EXT-X-ENDLIST`;

            await bucket.file(testFilePath).save(m3u8Content, {
                metadata: { contentType: "application/x-mpegURL" },
            });
            uploadedFiles.push(testFilePath);
            console.log(`Uploaded test file: ${testFilePath}`);

            // Cloud Recording関数を実行
            const func = require("../src/functions/agora_cloud_recording");
            const wrapped = config.wrap(func([], {}, {}));

            const event = {
                bucket: testBucket,
                data: {
                    bucket: testBucket,
                    name: testFilePath,
                },
            };

            await wrapped(event);

            // リネーム後のファイルを確認（バケットルートに保存される）
            const targetPath = `${channelId}.m3u8`;
            const [exists] = await bucket.file(targetPath).exists();
            expect(exists).toBe(true);
            uploadedFiles.push(targetPath);

            // 元ファイルは削除されていることを確認
            const [originalExists] = await bucket.file(testFilePath).exists();
            expect(originalExists).toBe(false);
            uploadedFiles = uploadedFiles.filter(f => f !== testFilePath);
        }, 60000);

        test("正常系: TSファイル処理", async () => {
            const bucket = admin.storage().bucket(testBucket);

            // TS ファイルのパターン: sid_channelId_segment.ts
            // 注意: 正規表現は /([a-z0-9A-Z]+)_([a-z0-9A-Z]+)_([a-z0-9A-Z]+).ts/
            // target = targetTS[0] (全体マッチ) なのでファイル名自体は変わらない
            const channelId = `tsChannel${Date.now()}`;
            const testFileName = `sid_${channelId}_segment0.ts`;
            const testFilePath = `${testDir}/${testFileName}`;

            // 最小限のTSファイル（188バイトの空パケット）
            const tsContent = Buffer.alloc(188, 0);
            tsContent[0] = 0x47; // Sync byte

            await bucket.file(testFilePath).save(tsContent, {
                metadata: { contentType: "video/MP2T" },
            });
            uploadedFiles.push(testFilePath);
            console.log(`Uploaded test file: ${testFilePath}`);

            // Cloud Recording関数を実行
            const func = require("../src/functions/agora_cloud_recording");
            const wrapped = config.wrap(func([], {}, {}));

            const event = {
                bucket: testBucket,
                data: {
                    bucket: testBucket,
                    name: testFilePath,
                },
            };

            await wrapped(event);

            // TSファイルはtarget = targetTS[0] (ファイル名部分) にコピーされる
            // source = "unit/test/agora/sid_tsChannel..._segment0.ts"
            // target = "sid_tsChannel..._segment0.ts" (ファイル名のみ)
            const targetPath = testFileName; // バケットルートに同じファイル名
            const [exists] = await bucket.file(targetPath).exists();
            expect(exists).toBe(true);
            uploadedFiles.push(targetPath);

            // 元ファイルは削除されていることを確認
            const [originalExists] = await bucket.file(testFilePath).exists();
            expect(originalExists).toBe(false);
            uploadedFiles = uploadedFiles.filter(f => f !== testFilePath);
        }, 60000);

        test("正常系: パターン不一致ファイル", async () => {
            const bucket = admin.storage().bucket(testBucket);

            const testFileName = `random_file_${Date.now()}.txt`;
            const testFilePath = `${testDir}/${testFileName}`;

            await bucket.file(testFilePath).save("test content", {
                metadata: { contentType: "text/plain" },
            });
            uploadedFiles.push(testFilePath);
            console.log(`Uploaded test file: ${testFilePath}`);

            // Cloud Recording関数を実行
            const func = require("../src/functions/agora_cloud_recording");
            const wrapped = config.wrap(func([], {}, {}));

            const event = {
                bucket: testBucket,
                data: {
                    bucket: testBucket,
                    name: testFilePath,
                },
            };

            // エラーなく完了することを確認
            await expect(wrapped(event)).resolves.toBeUndefined();

            // ファイルはそのまま存在
            const [exists] = await bucket.file(testFilePath).exists();
            expect(exists).toBe(true);
        }, 60000);

        test("正常系: sourceがundefined", async () => {
            const func = require("../src/functions/agora_cloud_recording");
            const wrapped = config.wrap(func([], {}, {}));

            const event = {
                bucket: testBucket,
                data: {
                    bucket: testBucket,
                    name: undefined,
                },
            };

            // エラーなく完了することを確認
            await expect(wrapped(event)).resolves.toBeUndefined();
        }, 30000);

        test("エッジケース: 既にリネーム済みのJPGファイル（ルートに直接配置）", async () => {
            const bucket = admin.storage().bucket(testBucket);

            // 既にリネーム後の名前のファイルをルートに直接配置
            // ファイル名がパターンにマッチしないので何もしない
            const testFileName = `alreadyRenamed${Date.now()}.jpg`;

            const minimalJpeg = Buffer.from([
                0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
                0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9
            ]);

            await bucket.file(testFileName).save(minimalJpeg, {
                metadata: { contentType: "image/jpeg" },
            });
            uploadedFiles.push(testFileName);

            const func = require("../src/functions/agora_cloud_recording");
            const wrapped = config.wrap(func([], {}, {}));

            const event = {
                bucket: testBucket,
                data: {
                    bucket: testBucket,
                    name: testFileName,
                },
            };

            // パターン不一致のためエラーなく完了
            await expect(wrapped(event)).resolves.toBeUndefined();

            // ファイルはそのまま存在
            const [exists] = await bucket.file(testFileName).exists();
            expect(exists).toBe(true);
        }, 60000);
    });
});
