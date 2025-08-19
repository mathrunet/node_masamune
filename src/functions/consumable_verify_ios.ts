import * as functions from "firebase-functions/v2";
import * as verifier from "../lib/functions/verify_ios";
import * as updater from "../lib/functions/update_wallet";
import { HttpFunctionsOptions } from "../lib/src/functions_base";
import { firestoreLoader } from "../lib/src/firebase_loader";

/**
 * Performs a consumption-type in-app purchase. The value of the field in the document specified in [path] is added to [value].
 * 
 * 消費型のアプリ内課金を行います。[path]に指定したドキュメント内のフィールドの値を[value]に加算します。
 * 
 * @param process.env.PURCHASE_IOS_SHAREDSECRET
 * SharedSecret for AppStore, obtained from [Apps]->[App Info]->[Shared Secret for App] in the AppStore.
 * 
 * AppStoreのSharedSecret。AppStoreの[アプリ]->[App情報]->[App用共有シークレット]から取得します。
 * 
 * @param path
 * The path, including the key, of the field in the document that stores the in-app wallet information.
 * 
 * アプリ内ウォレット情報を保存するドキュメント内のフィールドのキーを含めたパス。
 * 
 * @param value
 * Value of the amount to be added.
 * 
 * 加算する金額の値。
 * 
 * @param receiptData
 * Receipt data for purchases.
 * 
 * 購入の際のレシートデータ。
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
            /* ==== IOS検証ここから ==== */
            const res = await verifier.verifyIOS({
                receiptData: query.data.receiptData,
                password: process.env.PURCHASE_IOS_SHAREDSECRET ?? "",
                transactionId: query.data.transactionId,
                storeKitVersion: query.data.storeKitVersion ?? 1,
            });
            const status = res["status"];
            if (status !== 0) {
                throw new functions.https.HttpsError("unauthenticated", "Illegal receipt.");
            }
            /* ==== ここまでIOS検証 ==== */
            const info = res["latest_receipt_info"];
            if (!query.data.path || !query.data.value) {
                throw new functions.https.HttpsError(
                    "invalid-argument", `The required parameters are not set. path: ${query.data.path} value: ${query.data.value}`,
                );
            }
            /* ==== Firestoreの更新ここから ==== */
            let error: any | null = null;
            const firestoreDatabaseIds = options.firestoreDatabaseIds ?? [""];
            for (const databaseId of firestoreDatabaseIds) {
                try {
                    const firestoreInstance = firestoreLoader(databaseId);
                    await updater.updateWallet({
                        targetDocumentFieldPath: query.data.path,
                        value: query.data.value,
                        transactionId: info[info.length - 1]["original_transaction_id"],
                        transactionData: info[info.length - 1],
                        firestoreInstance: firestoreInstance,
                    });
                } catch (err) {
                    error = err;
                }
            }
            if (error) {
                console.error(error);
                throw new functions.https.HttpsError("unknown", "Unknown error.");
            }
            /* ==== ここまでFirestoreの更新 ==== */
            return res;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
