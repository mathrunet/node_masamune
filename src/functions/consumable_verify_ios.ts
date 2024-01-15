import * as functions from "firebase-functions/v2";
import * as verifier from "../lib/verify_ios";
import * as updater from "../lib/update_wallet";
import { FunctionsOptions } from "../lib/functions_base";

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
    options: FunctionsOptions,
    data: { [key: string]: string }
) => functions.https.onCall(
    {
        region: regions,
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances ?? undefined,
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
            if (!query.data.path || !query.data.value) {
                return res;
            }
            /* ==== Firestoreの更新ここから ==== */
            await updater.updateWallet({
                targetDocumentFieldPath: query.data.path,
                value: query.data.value,
            }
            );
            /* ==== ここまでFirestoreの更新 ==== */
            return res;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
