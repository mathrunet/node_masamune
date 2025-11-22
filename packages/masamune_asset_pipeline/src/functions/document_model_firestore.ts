import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions } from "../lib/src/functions_base";
import { Firestore } from "@google-cloud/firestore";
import { FirestoreModelFieldValueConverterUtils } from "../lib/model_field_value/default_firestore_model_field_value_converter";

/**
 * A function to enable the use of external Firestore Document Models.
 * 
 * 外部のFirestoreのDocumentModelを利用できるようにするためのFunction。
 * 
 * @param {string} process.env.FIRESTORE_SERVICE_ACCOUNT
 * Service account JSON.
 * 
 * サービスアカウントJSON。
 * 
 * @param {string} path
 * The path of the document.
 * 
 * ドキュメントのパス。
 * 
 * @param {string} method
 * The method name.
 * 
 * メソッド名。
 * 
 * @param {{ [key: string]: any }} data
 * Data to be saved.
 * 
 * 保存をするためのデータ。
 * 
 * @param {string} databaseId
 * The database ID.
 * 
 * データベースID。
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
            // クエリパラメータから必要な情報を取得
            const databaseId = query.data.databaseId as string | undefined | null;

            // 環境変数からサービスアカウントJSONを取得
            let serviceAccount;
            try {
                const serviceAccountJson = process.env.FIRESTORE_SERVICE_ACCOUNT ?? process.env.SERVICE_ACCOUNT;
                if (!serviceAccountJson) {
                    throw new functions.https.HttpsError(
                        "failed-precondition",
                        "Service account JSON not found in environment variable: FIRESTORE_SERVICE_ACCOUNT"
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
                    `Invalid service account JSON in environment variable: FIRESTORE_SERVICE_ACCOUNT`
                );
            }

            // Firestoreインスタンスを作成
            // データベースIDが指定されていない場合は "(default)" を使用
            const finalDatabaseId = databaseId || "(default)";
            
            console.log(`Creating Firestore instance with projectId: ${serviceAccount.project_id}, databaseId: ${finalDatabaseId}`);
            
            const firestoreInstance = new Firestore({
                projectId: serviceAccount.project_id,
                databaseId: finalDatabaseId,
                credentials: {
                    client_email: serviceAccount.client_email,
                    private_key: serviceAccount.private_key,
                },
            });
            
            // クエリパラメータから必要な情報を取得
            const path = query.data.path as string | undefined | null;
            const method = query.data.method as string | undefined | null;
            const documentJson = query.data.data as string | undefined | null;
            
            if (!method) {
                throw new functions.https.HttpsError("invalid-argument", "No method specified.");
            }
            if (!path) {
                throw new functions.https.HttpsError("invalid-argument", "No path specified.");
            }
            
            // パスの検証
            if (!path.includes('/')) {
                throw new functions.https.HttpsError(
                    "invalid-argument", 
                    `Invalid document path format: ${path}. Path must include collection and document ID (e.g., 'collection/document')`
                );
            }

            // メソッドに応じて処理を実行
            switch (method) {
                case "get": {
                    console.log(`Attempting to get document at path: ${path}`);
                    try {
                        const doc = await firestoreInstance.doc(path).get();
                        const converted = FirestoreModelFieldValueConverterUtils.convertFrom({ data: doc.data() ?? {}, firestoreInstance });
                        console.log(`Document exists: ${doc.exists}`);
                        return {
                            status: 200,
                            data: JSON.stringify(converted),
                        };
                    } catch (error: any) {
                        console.error(`Error getting document at ${path}:`, error);
                        throw new functions.https.HttpsError(
                            "not-found",
                            `Failed to get document at ${path}: ${error.message}`
                        );
                    }
                }
                case "put":
                case "post": {
                    if (!documentJson) {
                        throw new functions.https.HttpsError("invalid-argument", "No data specified for set operation.");
                    }
                    const documentData = JSON.parse(documentJson) as { [key: string]: any };
                    if (!documentData) {
                        throw new functions.https.HttpsError("invalid-argument", "Invalid data specified for set operation.");
                    }
                    console.log(`Attempting to set document at path: ${path} with data: ${JSON.stringify(documentData)}`);
                    try {
                        const converted = FirestoreModelFieldValueConverterUtils.convertTo({ data: documentData, firestoreInstance });
                        if (!converted) {
                            throw new functions.https.HttpsError("invalid-argument", "Invalid data specified for set operation.");
                        }
                        await firestoreInstance.doc(path).set(
                            {
                                ...converted,
                                "@uid": path.split("/").pop(),
                                "@time": new Date(),
                            },
                            { merge: true }
                        );
                        console.log(`Successfully set document at ${path}`);
                        return {
                            status: 200,
                        };
                    } catch (error: any) {
                        console.error(`Error setting document at ${path}:`, error);
                        throw new functions.https.HttpsError(
                            "internal",
                            `Failed to set document at ${path}: ${error.message}`
                        );
                    }
                }
                case "delete": {
                    console.log(`Attempting to delete document at path: ${path}`);
                    try {
                        await firestoreInstance.doc(path).delete();
                        console.log(`Successfully deleted document at ${path}`);
                        return {
                            status: 200,
                        };
                    } catch (error: any) {
                        console.error(`Error deleting document at ${path}:`, error);
                        throw new functions.https.HttpsError(
                            "internal",
                            `Failed to delete document at ${path}: ${error.message}`
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
