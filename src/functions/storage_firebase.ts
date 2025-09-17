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
                
                // サービスアカウントの必須フィールドを検証
                if (!serviceAccount.project_id) {
                    throw new functions.https.HttpsError(
                        "invalid-argument",
                        "Service account JSON is missing 'project_id' field"
                    );
                }
                if (!serviceAccount.client_email) {
                    throw new functions.https.HttpsError(
                        "invalid-argument",
                        "Service account JSON is missing 'client_email' field"
                    );
                }
                if (!serviceAccount.private_key) {
                    throw new functions.https.HttpsError(
                        "invalid-argument",
                        "Service account JSON is missing 'private_key' field"
                    );
                }
                
                console.log(`Using service account for project: ${serviceAccount.project_id}`);
            } catch (error) {
                if (error instanceof functions.https.HttpsError) {
                    throw error;
                }
                throw new functions.https.HttpsError(
                    "invalid-argument",
                    `Invalid service account JSON in environment variable: STORAGE_SERVICE_ACCOUNT`
                );
            }

            // Storageインスタンスを作成
            console.log(`Creating Storage instance with projectId: ${serviceAccount.project_id}`);
            
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
            
            console.log(`Processing ${method} operation for bucket: ${bucketName}, filePath: ${filePath}`);
            
            // バケットの参照を取得
            const bucket = storageInstance.bucket(bucketName);
            const file = bucket.file(filePath);
            
            // メソッドに応じて処理を実行
            switch (method) {
                case "get": {
                    console.log(`Attempting to get file: ${bucketName}/${filePath}`);
                    try {
                        // ファイルの存在確認
                        const [exists] = await file.exists();
                        if (!exists) {
                            console.log(`File not found: ${bucketName}/${filePath}`);
                            return {
                                status: 404,
                                binary: null,
                                error: "File not found"
                            };
                        }
                        
                        console.log(`File exists, downloading: ${bucketName}/${filePath}`);
                        
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
                        
                        console.log(`Successfully downloaded file: ${bucketName}/${filePath}, size: ${metadata.size} bytes`);
                        
                        return {
                            status: 200,
                            binary: base64Data,
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
                    } catch (error: any) {
                        console.error(`Error downloading file ${bucketName}/${filePath}:`, error);
                        throw new functions.https.HttpsError(
                            "internal", 
                            `Failed to download file ${bucketName}/${filePath}: ${error.message}`
                        );
                    }
                }
                case "put":
                case "post": {
                    if (!binary) {
                        throw new functions.https.HttpsError("invalid-argument", "No binary data specified for upload operation.");
                    }
                    
                    console.log(`Attempting to upload file: ${bucketName}/${filePath}`);
                    
                    try {
                        // Base64データをBufferに変換
                        const buffer = Buffer.from(binary, "base64");
                        console.log(`Converting base64 data to buffer, size: ${buffer.length} bytes`);
                        
                        // メタデータの設定
                        const options: any = {};
                        if (meta) {
                            // contentTypeの設定
                            if (meta.contentType) {
                                options.contentType = meta.contentType;
                                console.log(`Setting content type: ${meta.contentType}`);
                            }
                            
                            // contentType以外のメタデータを設定
                            const customMetadata = { ...meta };
                            delete customMetadata.contentType;
                            
                            // カスタムメタデータが存在する場合のみ設定
                            if (Object.keys(customMetadata).length > 0) {
                                options.metadata = {
                                    metadata: customMetadata
                                };
                                console.log(`Setting custom metadata:`, customMetadata);
                            }
                        }
                        
                        // ファイルをアップロード
                        await file.save(buffer, options);
                        console.log(`File saved successfully: ${bucketName}/${filePath}`);
                        
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
                        
                        console.log(`Successfully uploaded file: ${bucketName}/${filePath}, final size: ${uploadedMetadata.size} bytes`);
                        
                        return {
                            status: 200,
                            message: "File uploaded successfully",
                            meta: {
                                contentType: uploadedMetadata.contentType || options.contentType || "application/octet-stream",
                                downloadUri: downloadUrl,
                                publicUri: publicUrl
                            }
                        };
                    } catch (error: any) {
                        console.error(`Error uploading file ${bucketName}/${filePath}:`, error);
                        throw new functions.https.HttpsError(
                            "internal", 
                            `Failed to upload file ${bucketName}/${filePath}: ${error.message}`
                        );
                    }
                }
                case "delete": {
                    console.log(`Attempting to delete file: ${bucketName}/${filePath}`);
                    
                    try {
                        // ファイルの存在確認
                        const [exists] = await file.exists();
                        if (!exists) {
                            console.log(`File not found for deletion: ${bucketName}/${filePath}`);
                            return {
                                status: 404,
                                error: "File not found"
                            };
                        }
                        
                        // ファイルを削除
                        await file.delete();
                        console.log(`Successfully deleted file: ${bucketName}/${filePath}`);
                        
                        return {
                            status: 200,
                            message: "File deleted successfully"
                        };
                    } catch (error: any) {
                        console.error(`Error deleting file ${bucketName}/${filePath}:`, error);
                        throw new functions.https.HttpsError(
                            "internal", 
                            `Failed to delete file ${bucketName}/${filePath}: ${error.message}`
                        );
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
