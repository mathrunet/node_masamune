import * as functions from "firebase-functions/v2";
import * as verifier from "../lib/functions/verify_ios";
import * as subscriber from "../lib/functions/update_subscription";
import { HttpFunctionsOptions } from "../lib/src/functions_base";
import { firestoreLoader } from "../lib/src/firebase_loader";

/**
 * Verify subscriptions and add data.
 * 
 * サブスクリプションの検証とデータの追加を行います。
 * 
 * @param process.env.PURCHASE_IOS_SHAREDSECRET
 * SharedSecret for AppStore, obtained from [Apps]->[App Info]->[Shared Secret for App] in the AppStore.
 * 
 * AppStoreのSharedSecret。AppStoreの[アプリ]->[App情報]->[App用共有シークレット]から取得します。
 * 
 * @param process.env.PURCHASE_SUBSCRIPTIONPATH
 * Describes the path to the collection of subscriptions.
 * 
 * サブスクリプションのコレクションのパスを記述します。
 * 
 * @param purchaseId
 * Subscription purchase ID.
 * 
 * サブスクリプションの購入ID。
 * 
 * @param productId
 * Item ID issued by Google Play.
 * 
 * GooglePlayで発行されたアイテムID。
 * 
 * @param receiptData
 * Receipt data for purchases.
 * 
 * 購入の際のレシートデータ。
 * 
 * @param data
 * Document data to be updated.
 * 
 * 更新するドキュメントデータ。
 * 
 * @param userId
 * ID of the user who purchased the subscription.
 * 
 * サブスクリプションを購入したユーザーのID。
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
            if (!query.data.userId) {
                throw new functions.https.HttpsError("invalid-argument", "User is empty.");
            }
            const res = await verifier.verifyIOS({
                receiptData: query.data.receiptData,
                password: process.env.PURCHASE_IOS_SHAREDSECRET ?? "",
            });
            const status = res["status"];
            if (status !== 0) {
                throw new functions.https.HttpsError("not-found", "Illegal receipt.");
            }
            const time = new Date().getTime();
            const info = res["latest_receipt_info"];
            const pending = res["pending_renewal_info"];
            const startTimeMillis = parseInt(info[info.length - 1]["purchase_date_ms"]);
            const expiryTimeMillis = parseInt(info[info.length - 1]["expires_date_ms"]);
            const currentProductId = info[info.length - 1]["product_id"];
            if (res === null || isNaN(startTimeMillis) || isNaN(expiryTimeMillis) || startTimeMillis <= 0) {
                throw new functions.https.HttpsError("not-found", "Illegal receipt.");
            }
            if (expiryTimeMillis <= time) {
                info[info.length - 1]["expired"] = true;
            }
            /* ==== ここまでIOS検証 ==== */
            /* ==== Firestoreの更新ここから ==== */
            let error: any | null = null;
            const firestoreDatabaseIds = options.firestoreDatabaseIds ?? [""];
            for (const databaseId of firestoreDatabaseIds) {
                try {
                    const firestoreInstance = firestoreLoader(databaseId);
                    await subscriber.updateSubscription({
                        targetCollectionPath: query.data.path ?? process.env.PURCHASE_SUBSCRIPTIONPATH,
                        targetDocumentId: info[info.length - 1]["original_transaction_id"],
                        data: info[info.length - 1],
                        additionalData: query.data,
                        userId: query.data.userId,
                        platform: "IOS",
                        orderId: info[info.length - 1]["original_transaction_id"],
                        productId: currentProductId,
                        purchaseId: query.data.purchaseId,
                        packageName: res["receipt"]["bundle_id"],
                        token: query.data.receiptData,
                        expiryDate: expiryTimeMillis,
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
            throw new functions.https.HttpsError("unknown", "Unknown error.");
        }
    }
);
