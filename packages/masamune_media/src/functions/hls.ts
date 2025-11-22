import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { StorageFunctionsOptions } from "@mathrunet/masamune";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import ffmpeg from "fluent-ffmpeg";

/**
 * Converts videos uploaded to storage to HLS format.
 * 
 * ストレージにアップロードされた動画をHLS形式に変換します。
 */
module.exports = (
    regions: string[],
    options: StorageFunctionsOptions,
    data: { [key: string]: any }
) => functions.storage.onObjectFinalized(
    {
        timeoutSeconds: 540,
        region: options.region ?? regions[0],
        memory: "2GiB",
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
        serviceAccount: options?.serviceAccount ?? undefined,
    },
    async (event) => {
        try {
            const storage = admin.storage();
            // ファイルがアップロードされたバケット
            const fileBucket = event.data.bucket;
            // ファイルのパス
            const filePath = event.data.name;
            // ファイルのディレクトリ
            const fileDir = path.dirname(filePath);
            // ファイルのMIMEタイプ
            const contentType = event.data.contentType;

            // --- トリガー条件のチェック ---

            // 1. ファイルパスが存在しない場合は終了
            if (!filePath) {
                console.log("File path is not available.");
                return;
            }

            // 2. ファイルの拡張子がm3u8かtsの場合は、処理済みファイルなので無限ループを避けるため終了
            if (path.extname(filePath) === ".m3u8" || path.extname(filePath) === ".ts") {
                console.log(`File ${filePath} is already processed. Exiting.`);
                return;
            }

            // 3. 動画ファイルでない場合は終了 (例: 'video/mp4')
            if (!contentType || !contentType.startsWith("video/")) {
                console.log(`File ${filePath} is not a video. Exiting.`);
                return;
            }

            console.log(`New video uploaded: ${filePath}. Starting HLS conversion.`);

            const bucket = storage.bucket(fileBucket);
            const sourceFile = bucket.file(filePath);
            const fileName = path.basename(filePath);
            const fileNameWithoutExt = path.parse(fileName).name;

            // --- ファイルのダウンロード ---

            // 一時ディレクトリを作成
            const tempFilePath = path.join(os.tmpdir(), fileName);
            await sourceFile.download({ destination: tempFilePath });
            console.log(`Downloaded ${fileName} to ${tempFilePath}.`);

            // HLS ファイルの出力先となる一時ディレクトリを作成
            const tempHlsDir = path.join(os.tmpdir(), "hls");
            if (!fs.existsSync(tempHlsDir)) {
                fs.mkdirSync(tempHlsDir);
            }

            // --- FFmpegによるエンコード処理 ---

            await new Promise<void>((resolve, reject) => {
                ffmpeg(tempFilePath)
                    // ビデオコーデック（H.264エンコーダー使用、リサイズのため再エンコードが必要）
                    .addOption("-c:v", "libx264")
                    // オーディオコーデックもコピー
                    .addOption("-c:a", "copy")
                    // 動画サイズを最大1920pxに制限（アスペクト比維持）
                    .addOption("-vf", "scale=1920:1920:force_original_aspect_ratio=decrease")
                    // エンコード品質を設定（CRF値、低いほど高品質）
                    .addOption("-crf", "23")
                    // エンコードプリセット（速度と品質のバランス）
                    .addOption("-preset", "medium")
                    // HLSセグメントの長さを10秒に設定
                    .addOption("-hls_time", "10")
                    // HLSプレイリストのタイプをVOD (Video On Demand) に設定
                    .addOption("-hls_playlist_type", "vod")
                    // HLSセグメントのファイル名のフォーマット
                    .addOption("-hls_segment_filename", `${tempHlsDir}/${fileNameWithoutExt}%04d.ts`)
                    // 出力するマスタープレイリストファイル
                    .output(`${tempHlsDir}/${fileNameWithoutExt}.m3u8`)
                    .on("end", () => {
                        console.log("FFmpeg processing finished successfully.");
                        resolve();
                    })
                    .on("error", (err) => {
                        console.error("Error during FFmpeg processing:", err);
                        reject(err);
                    })
                    .run();
            });

            // --- HLSファイルのアップロード ---

            const outputDir = fileDir;
            const files = fs.readdirSync(tempHlsDir);
            const uploadPromises = files.map((file) => {
                const localPath = path.join(tempHlsDir, file);
                const remotePath = `${outputDir}/${file}`;
                return bucket.upload(localPath, {
                    destination: remotePath,
                    public: true, // 公開アクセス可能にする場合
                });
            });

            await Promise.all(uploadPromises);
            console.log(`Uploaded HLS files to ${outputDir}.`);

            // --- 一時ファイルのクリーンアップ ---

            fs.unlinkSync(tempFilePath);
            fs.rmSync(tempHlsDir, { recursive: true, force: true });
            console.log("Cleaned up temporary files.");

            // (オプション) 元のMP4ファイルを削除する場合
            await sourceFile.delete();
            console.log(`Deleted original file: ${filePath}`);
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
