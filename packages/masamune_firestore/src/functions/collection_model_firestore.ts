import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions, FirestoreModelFieldValueConverterUtils } from "@mathrunet/katana";
import { Firestore } from "@google-cloud/firestore";

/**
 * A function to enable the use of external Firestore Collection Models.
 * 
 * 外部のFirestoreのCollectionModelを利用できるようにするためのFunction。
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
            const path = query.data.path as string | undefined | null;
            const method = query.data.method as string | undefined | null;
            const collectionJson = query.data.data as string | undefined | null;

            if (!method) {
                throw new functions.https.HttpsError("invalid-argument", "No method specified.");
            }
            if (!path) {
                throw new functions.https.HttpsError("invalid-argument", "No path specified.");
            }

            // メソッドに応じて処理を実行
            switch (method) {
                case "get": {
                    console.log(`Attempting to get collection at path: ${path}`);
                    try {
                        const col = await firestoreInstance.collection(path).get();
                        const data: { [key: string]: { [key: string]: any } } = {};
                        for (const doc of col.docs) {
                            if (doc.exists) {
                                data[doc.id] = FirestoreModelFieldValueConverterUtils.convertFrom({ data: doc.data(), firestoreInstance });
                            }
                        }
                        console.log(`Successfully retrieved ${col.size} documents from ${path}`);
                        return {
                            status: 200,
                            data: JSON.stringify(data),
                        };
                    } catch (error: any) {
                        console.error(`Error getting collection at ${path}:`, error);
                        throw new functions.https.HttpsError(
                            "not-found",
                            `Failed to get collection at ${path}: ${error.message}`
                        );
                    }
                }
                case "put":
                case "post": {
                    if (!collectionJson) {
                        throw new functions.https.HttpsError("invalid-argument", "No data specified for set operation.");
                    }
                    const collectionData = JSON.parse(collectionJson) as { [key: string]: { [key: string]: any } };
                    if (!collectionData) {
                        throw new functions.https.HttpsError("invalid-argument", "No data specified for set operation.");
                    }
                    console.log(`Attempting to set documents in collection at path: ${path} with data: ${JSON.stringify(collectionData)}`);
                    try {
                        // NullはFieldValue.delete()に変換される
                        for (const docId in collectionData) {
                            collectionData[docId] = FirestoreModelFieldValueConverterUtils.convertTo({ data: collectionData[docId], firestoreInstance });
                            await firestoreInstance.doc(path + "/" + docId).set(
                                {
                                    ...collectionData[docId],
                                    "@uid": docId,
                                    "@time": new Date(),
                                },
                                { merge: true }
                            );
                        }
                        console.log(`Successfully set ${Object.keys(collectionData).length} documents in ${path}`);
                        return {
                            status: 200,
                        };
                    } catch (error: any) {
                        console.error(`Error setting documents in ${path}:`, error);
                        throw new functions.https.HttpsError(
                            "internal",
                            `Failed to set documents in ${path}: ${error.message}`
                        );
                    }
                }
                case "delete": {
                    console.log(`Attempting to delete collection at path: ${path}`);
                    try {
                        const col = await firestoreInstance.collection(path).get();
                        for (const doc of col.docs) {
                            await doc.ref.delete();
                        }
                        console.log(`Successfully deleted ${col.size} documents from ${path}`);
                        return {
                            status: 200,
                        };
                    } catch (error: any) {
                        console.error(`Error deleting collection at ${path}:`, error);
                        throw new functions.https.HttpsError(
                            "internal",
                            `Failed to delete collection at ${path}: ${error.message}`
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
