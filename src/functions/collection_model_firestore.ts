import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions } from "../lib/src/functions_base";
import { Firestore, FieldValue } from "@google-cloud/firestore";

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
                const serviceAccountJson = process.env.FIRESTORE_SERVICE_ACCOUNT ?? process.env.FIREBASE_SERVICE_ACCOUNT;
                if (!serviceAccountJson) {
                    throw new functions.https.HttpsError(
                        "failed-precondition",
                        "Service account JSON not found in environment variable: FIRESTORE_SERVICE_ACCOUNT"
                    );
                }
                serviceAccount = JSON.parse(serviceAccountJson);
            } catch (error) {
                throw new functions.https.HttpsError(
                    "invalid-argument",
                    `Invalid service account JSON in environment variable: FIRESTORE_SERVICE_ACCOUNT`
                );
            }

            // Firestoreインスタンスを作成
            const firestoreInstance = new Firestore({
                projectId: serviceAccount.project_id,
                credentials: {
                    client_email: serviceAccount.client_email,
                    private_key: serviceAccount.private_key,
                },
            });
            
            // クエリパラメータから必要な情報を取得
            const path = query.data.path as string | undefined | null;
            const method = query.data.method as string | undefined | null;
            const collectionData = query.data.data as { [key: string]: { [key: string]: any } } | undefined | null;
            
            if (!method) {
                throw new functions.https.HttpsError("invalid-argument", "No method specified.");
            }
            if (!path) {
                throw new functions.https.HttpsError("invalid-argument", "No path specified.");
            }
            
            // メソッドに応じて処理を実行
            switch (method) {
                case "get": {
                    const col = await firestoreInstance.collection(path).get();
                    const data: { [key: string]: { [key: string]: any } } = {};
                    for (const doc of col.docs) {
                        if (doc.exists) {
                            data[doc.id] = doc.data();
                        }
                    }
                    return {
                        status: 200,
                        data: data,
                    };
                }
                case "put":
                case "post": {
                    if (!collectionData) {
                        throw new functions.https.HttpsError("invalid-argument", "No data specified for set operation.");
                    }
                    // NullはFieldValue.delete()に変換される
                    for (const docId in collectionData) {
                        for(const key in collectionData[docId]) {
                            if (collectionData[docId][key] === null) {
                                collectionData[docId][key] = FieldValue.delete();
                            }
                        }
                        await firestoreInstance.doc(path + "/" + docId).set(
                            collectionData[docId],
                            { merge: true }
                        );
                    }
                    return {
                        status: 200,
                    };
                }
                case "delete": {
                    const col = await firestoreInstance.collection(path).get();
                    for (const doc of col.docs) {
                        await doc.ref.delete();
                    }
                    return {
                        status: 200,
                    };
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
