import * as functions from "firebase-functions/v2";
import * as verifier from "../lib/verify_ios";
import * as updater from "../lib/update_unlock";
import { HttpFunctionsOptions } from "../lib/functions_base";

/**
 * Performs non-consumable in-app purchases. Unlock by setting the value of the field in the document specified in [path] to `true`.
 * 
 * 非消費型のアプリ内課金を行います。[path]に指定したドキュメント内のフィールドの値を`true`にすることでアンロックを行います。
 * 
 * @param process.env.PURCHASE_IOS_SHAREDSECRET
 * SharedSecret for AppStore, obtained from [Apps]->[App Info]->[Shared Secret for App] in the AppStore.
 * 
 * AppStoreのSharedSecret。AppStoreの[アプリ]->[App情報]->[App用共有シークレット]から取得します。
 * 
 * @param path
 * The path, including the key, of the field in the document where the unlock information is to be stored.
 * 
 * アンロック情報を保存するドキュメント内のフィールドのキーを含めたパス。
 * 
 * @param receiptData
 * Receipt data for purchases.
 * 
 * 購入の際のレシートデータ。
 */
module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: string }
) => functions.https.onCall(
    {
        region: options.region ?? regions,
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
    },
    async (query) => {
        try {
            /* ==== IOS検証ここから ==== */
            const res = await verifier.verifyIOS({
                receiptData: query.data.receiptData,
                password: process.env.PURCHASE_IOS_SHAREDSECRET ?? "",
            });
            const status = res["status"];
            if (status !== 0) {
                throw new functions.https.HttpsError("unauthenticated", "Illegal receipt.");
            }
            /* ==== ここまでIOS検証 ==== */
            if (!query.data.path) {
                return res;
            }
            /* ==== Firestoreの更新ここから ==== */
            await updater.updateUnlock({
                targetDocumentFieldPath: query.data.path,
            });
            /* ==== ここまでFirestoreの更新 ==== */
            return res;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
