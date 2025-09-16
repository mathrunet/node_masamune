import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions } from "../lib/src/functions_base";
import { Firestore } from "@google-cloud/firestore";
import { AggregateField } from "firebase-admin/firestore";

/**
 * Functions for enabling external Firestore Aggregate methods.
 * 
 * 外部のFirestoreのAggregateメソッドを利用できるようにするFunctions。
 * 
 * @param {string} process.env.FIRESTORE_SERVICE_ACCOUNT
 * Service account JSON.
 * 
 * サービスアカウントJSON。
 * 
 * @param {string} path
 * The path of the collection.
 * 
 * コレクションのパス。
 * 
 * @param {string} method
 * The method name.
 * 
 * メソッド名。
 * 
 * @param {{ [key: string]: { [key: string]: any } }} data
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
            let path = query.data.path as string | undefined | null;
            const method = query.data.method as string | undefined | null;
            
            if (!method) {
                throw new functions.https.HttpsError("invalid-argument", "No method specified.");
            }
            if (!path) {
                throw new functions.https.HttpsError("invalid-argument", "No path specified.");
            }          
            
            // メソッドに応じて処理を実行
            switch (method) {
                case "count": {
                    console.log(`Attempting to get count aggregation at path: ${path}`);
                    try {
                        const aggregation = await firestoreInstance.collection(path).count().get();
                        const data: { [key: string]: any } = {
                            value: aggregation.data().count,
                        };
                        console.log(`Successfully retrieved count aggregation at path: ${path}`);
                        return {
                            status: 200,
                            data: data,
                        };
                    } catch (error: any) {
                        console.error(`Error getting count aggregation at ${path}:`, error);
                        throw new functions.https.HttpsError(
                            "not-found",
                            `Failed to get collection at ${path}: ${error.message}`
                        );
                    }
                }
                case "sum": {
                    const field = path?.split("/").pop();
                    path = path?.split("/").slice(0, -1).join("/");  
                    if (!field) {
                        throw new functions.https.HttpsError("invalid-argument", "No field specified.");
                    }
                    console.log(`Attempting to get sum aggregation at path: ${path}/${field}`);
                    try {
                        const aggregation = await firestoreInstance.collection(path).aggregate({
                            "@sum": AggregateField.sum(field),
                        }).get();
                        const data: { [key: string]: any } = {
                            value: aggregation.data()["@sum"],
                        };
                        console.log(`Successfully retrieved sum aggregation at path: ${path}/${field}`);
                        return {
                            status: 200,
                            data: data,
                        };
                    } catch (error: any) {
                        console.error(`Error getting sum aggregation at ${path}/${field}:`, error);
                        throw new functions.https.HttpsError(
                            "not-found",
                            `Failed to get collection at ${path}: ${error.message}`
                        );
                    }
                }
                case "average": {
                    const field = path?.split("/").pop();
                    path = path?.split("/").slice(0, -1).join("/");  
                    if (!field) {
                        throw new functions.https.HttpsError("invalid-argument", "No field specified.");
                    }
                    console.log(`Attempting to get average aggregation at path: ${path}/${field}`);
                    try {
                        const aggregation = await firestoreInstance.collection(path).aggregate({
                            "@average": AggregateField.average(field),
                        }).get();
                        const data: { [key: string]: any } = {
                            value: aggregation.data()["@average"],
                        };
                        console.log(`Successfully retrieved average aggregation at path: ${path}/${field}`);
                        return {
                            status: 200,
                            data: data,
                        };
                    } catch (error: any) {
                        console.error(`Error getting average aggregation at ${path}/${field}:`, error);
                        throw new functions.https.HttpsError(
                            "not-found",
                            `Failed to get collection at ${path}: ${error.message}`
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
