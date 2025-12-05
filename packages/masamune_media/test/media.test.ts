import * as admin from "firebase-admin";
import "@mathrunet/masamune";
import * as path from "path";

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

describe("HLS Conversion", () => {
    const testBucket = "development-for-mathrunet.appspot.com";
    const testDir = `unit/test/media`;
    const testFileName = `sample-${Date.now()}.mp4`;
    const testFilePath = `${testDir}/${testFileName}`;
    const testFileNameWithoutExt = path.parse(testFileName).name;
    let uploadedFiles: string[] = [];

    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
    });

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

    test("MP4をアップロードするとHLSファイルが生成される", async () => {
        const bucket = admin.storage().bucket(testBucket);

        // 1. sample.mp4をStorageにアップロード
        const sampleVideoPath = path.resolve(__dirname, "sample.mp4");
        await bucket.upload(sampleVideoPath, {
            destination: testFilePath,
            metadata: {
                contentType: "video/mp4",
            },
        });
        console.log(`Uploaded sample video to: ${testFilePath}`);
        uploadedFiles.push(testFilePath);

        // 2. HLS関数を実行
        const func = require("../src/functions/hls");
        const wrapped = config.wrap(func([], {}, {}));

        // Storage trigger用のeventオブジェクトを作成
        const event = {
            data: {
                bucket: testBucket,
                name: testFilePath,
                contentType: "video/mp4",
            },
        };

        await wrapped(event);
        console.log("HLS conversion completed");

        // 3. 生成されたHLSファイルを確認
        // .m3u8ファイルの存在確認
        const m3u8Path = `${testDir}/${testFileNameWithoutExt}.m3u8`;
        const [m3u8Exists] = await bucket.file(m3u8Path).exists();
        expect(m3u8Exists).toBe(true);
        console.log(`M3U8 file exists: ${m3u8Path}`);
        uploadedFiles.push(m3u8Path);

        // 4. .tsセグメントファイルの存在確認（少なくとも1つは存在するはず）
        const [files] = await bucket.getFiles({ prefix: `${testDir}/${testFileNameWithoutExt}` });
        const tsFiles = files.filter(f => f.name.endsWith(".ts"));
        expect(tsFiles.length).toBeGreaterThan(0);
        console.log(`Found ${tsFiles.length} TS segment files`);

        // クリーンアップ用にtsファイルを追加
        for (const tsFile of tsFiles) {
            uploadedFiles.push(tsFile.name);
        }

        // 5. 元MP4が削除されていることを確認
        const [mp4Exists] = await bucket.file(testFilePath).exists();
        expect(mp4Exists).toBe(false);
        console.log("Original MP4 file was deleted");

        // アップロードリストから削除済みのMP4を除外
        uploadedFiles = uploadedFiles.filter(f => f !== testFilePath);
    }, 600000); // 10分タイムアウト（HLS変換に時間がかかるため）
});
