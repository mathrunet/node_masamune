import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions } from "../lib/src/functions_base";
import { Storage } from "@google-cloud/storage";

/**
 * A function to enable the use of external Firebase Storage.
 * 
 * 外部のFirebase Storageを利用できるようにするためのFunction。
 * 
 * @param {string} process.env.STORAGE_SERVICE_ACCOUNT
 * Service account JSON.
 * 
 * サービスアカウントJSON。
 * 
 * @param {string} path
 * The path of the file in format: bucket-name/path/to/file.
 * 
 * ファイルのパス（形式: bucket-name/path/to/file）。
 * 
 * @param {string} method
 * The method name (get, put, post, delete).
 * 
 * メソッド名（get, put, post, delete）。
 * 
 * @param {string} binary
 * Base64 encoded binary data for upload.
 * 
 * アップロード用のBase64エンコードされたバイナリデータ。
 * 
 * @param {{ [key: string]: any }} meta
 * Metadata for the file.
 * 
 * ファイルのメタデータ。
 */
module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => functions.https.onCall(
    {
        region: options.region ?? regions,
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
        serviceAccount: options?.serviceAccount ?? undefined,
        enforceAppCheck: options.enforceAppCheck ?? undefined,
        consumeAppCheckToken: options.consumeAppCheckToken ?? undefined,
    },
    async (query) => {
        try {
            // 環境変数からサービスアカウントJSONを取得
            let serviceAccount;
            try {
                const serviceAccountJson = process.env.STORAGE_SERVICE_ACCOUNT ?? process.env.SERVICE_ACCOUNT;
                if (!serviceAccountJson) {
                    throw new functions.https.HttpsError(
                        "failed-precondition",
                        "Service account JSON not found in environment variable: STORAGE_SERVICE_ACCOUNT"
                    );
                }
                serviceAccount = JSON.parse(serviceAccountJson);
            } catch (error) {
                throw new functions.https.HttpsError(
                    "invalid-argument",
                    `Invalid service account JSON in environment variable: STORAGE_SERVICE_ACCOUNT`
                );
            }

            // Storageインスタンスを作成
            const storageInstance = new Storage({
                projectId: serviceAccount.project_id,
                credentials: {
                    client_email: serviceAccount.client_email,
                    private_key: serviceAccount.private_key,
                },
            });
            
            // クエリパラメータから必要な情報を取得
            const path = query.data.path as string | undefined | null;
            const method = query.data.method as string | undefined | null;
            const meta = query.data.meta as { [key: string]: any } | undefined | null;
            const binary = query.data.binary as string | undefined | null;
            
            if (!method) {
                throw new functions.https.HttpsError("invalid-argument", "No method specified.");
            }
            if (!path) {
                throw new functions.https.HttpsError("invalid-argument", "No path specified.");
            }
            
            // パスをバケット名とファイルパスに分割
            const pathParts = path.split("/");
            if (pathParts.length < 2) {
                throw new functions.https.HttpsError("invalid-argument", "Invalid path format. Expected: bucket-name/path/to/file");
            }
            const bucketName = pathParts[0];
            const filePath = pathParts.slice(1).join("/");
            
            // バケットの参照を取得
            const bucket = storageInstance.bucket(bucketName);
            const file = bucket.file(filePath);
            
            // メソッドに応じて処理を実行
            switch (method) {
                case "get": {
                    try {
                        // ファイルの存在確認
                        const [exists] = await file.exists();
                        if (!exists) {
                            return {
                                status: 404,
                                data: null,
                                error: "File not found"
                            };
                        }
                        
                        // ファイルをダウンロードしてBase64エンコード
                        const [fileBuffer] = await file.download();
                        const base64Data = fileBuffer.toString("base64");
                        
                        // メタデータを取得
                        const [metadata] = await file.getMetadata();
                        
                        // ダウンロードURLを生成（署名付きURL、7日間有効）
                        const [downloadUrl] = await file.getSignedUrl({
                            action: "read",
                            expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7日間
                        });
                        
                        // 公開URLを生成（Firebase Storage形式）
                        const encodedFilePath = encodeURIComponent(filePath);
                        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedFilePath}?alt=media`;
                        
                        return {
                            status: 200,
                            data: base64Data,
                            meta: {
                                contentType: metadata.contentType,
                                size: metadata.size,
                                updated: metadata.updated,
                                created: metadata.timeCreated,
                                ...metadata.metadata,
                                downloadUri: downloadUrl,
                                publicUri: publicUrl
                            }
                        };
                    } catch (error) {
                        console.error("Error downloading file:", error);
                        throw new functions.https.HttpsError("internal", "Failed to download file.");
                    }
                }
                case "put":
                case "post": {
                    if (!binary) {
                        throw new functions.https.HttpsError("invalid-argument", "No binary data specified for upload operation.");
                    }
                    
                    try {
                        // Base64データをBufferに変換
                        const buffer = Buffer.from(binary, "base64");
                        
                        // メタデータの設定
                        const options: any = {};
                        if (meta) {
                            // contentTypeの設定
                            if (meta.contentType) {
                                options.contentType = meta.contentType;
                            }
                            
                            // contentType以外のメタデータを設定
                            const customMetadata = { ...meta };
                            delete customMetadata.contentType;
                            
                            // カスタムメタデータが存在する場合のみ設定
                            if (Object.keys(customMetadata).length > 0) {
                                options.metadata = {
                                    metadata: customMetadata
                                };
                            }
                        }
                        
                        // ファイルをアップロード
                        await file.save(buffer, options);
                        
                        // アップロード後のメタデータを取得
                        const [uploadedMetadata] = await file.getMetadata();
                        
                        // ダウンロードURLを生成（署名付きURL、7日間有効）
                        const [downloadUrl] = await file.getSignedUrl({
                            action: "read",
                            expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7日間
                        });
                        
                        // 公開URLを生成（Firebase Storage形式）
                        const encodedFilePath = encodeURIComponent(filePath);
                        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedFilePath}?alt=media`;
                        
                        return {
                            status: 200,
                            message: "File uploaded successfully",
                            meta: {
                                contentType: uploadedMetadata.contentType || options.contentType || "application/octet-stream",
                                downloadUri: downloadUrl,
                                publicUri: publicUrl
                            }
                        };
                    } catch (error) {
                        console.error("Error uploading file:", error);
                        throw new functions.https.HttpsError("internal", "Failed to upload file.");
                    }
                }
                case "delete": {
                    try {
                        // ファイルの存在確認
                        const [exists] = await file.exists();
                        if (!exists) {
                            return {
                                status: 404,
                                error: "File not found"
                            };
                        }
                        
                        // ファイルを削除
                        await file.delete();
                        
                        return {
                            status: 200,
                            message: "File deleted successfully"
                        };
                    } catch (error) {
                        console.error("Error deleting file:", error);
                        throw new functions.https.HttpsError("internal", "Failed to delete file.");
                    }
                }
                default:
                    throw new functions.https.HttpsError("invalid-argument", `Unknown method: ${method}`);
            }
        } catch (err) {
            console.error(err);
            if (err instanceof functions.https.HttpsError) {
                throw err;
            }
            throw new functions.https.HttpsError("internal", "An error occurred while processing the request.");
        }
    }
);
