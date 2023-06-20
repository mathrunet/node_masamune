import * as functions from "firebase-functions";
import * as verifier from "../lib/verify_ios";
import * as subscriber from "../lib/update_subscription";

/**
 * Verify subscriptions and add data.
 * 
 * サブスクリプションの検証とデータの追加を行います。
 * 
 * @param purchase.ios.shared_secret
 * SharedSecret for AppStore, obtained from [Apps]->[App Info]->[Shared Secret for App] in the AppStore.
 * 
 * AppStoreのSharedSecret。AppStoreの[アプリ]->[App情報]->[App用共有シークレット]から取得します。
 * 
 * @param purchase.android.subscription_path
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
 * @param user
 * ID of the user who purchased the subscription.
 * 
 * サブスクリプションを購入したユーザーのID。
 */
module.exports = (regions: string[]) => functions.region(...regions).https.onCall(
    async (query, context) => {
        try {
            /* ==== IOS検証ここから ==== */
            if (!query.user) {
                throw new functions.https.HttpsError("invalid-argument", "User is empty.");
            }
            const config = functions.config().purchase;
            const res = await verifier.verifyIOS({
                receiptData: query.receiptData,
                password: config.ios.shared_secret,
            });
            const status = res["status"];
            if (status !== 0) {
                throw new functions.https.HttpsError("not-found", "Illegal receipt.");
            }
            const time = new Date().getTime();
            const info = res["latest_receipt_info"];
            const startTimeMillis = parseInt(info[info.length - 1]["purchase_date_ms"]);
            const expiryTimeMillis = parseInt(info[info.length - 1]["expires_date_ms"]);
            if (res === null || isNaN(startTimeMillis) || isNaN(expiryTimeMillis) || startTimeMillis <= 0) {
                throw new functions.https.HttpsError("not-found", "Illegal receipt.");
            }
            if (expiryTimeMillis <= time) {
                info[info.length - 1]["expired"] = true;
            }
            /* ==== ここまでIOS検証 ==== */
            /* ==== Firestoreの更新ここから ==== */
            await subscriber.updateSubscription({
                targetCollectionPath: query.path ?? config.subscription_path,
                targetDocumentId: info[info.length - 1]["original_transaction_id"],
                data: info[info.length - 1],
                additionalData: query.data,
                userId: query.user,
                platform: "IOS",
                orderId: info[info.length - 1]["original_transaction_id"],
                productId: query.productId,
                purchaseId: query.purchaseId,
                packageName: res["receipt"]["bundle_id"],
                token: query.receiptData,
                expiryDate: expiryTimeMillis,
            });
            /* ==== ここまでFirestoreの更新 ==== */
            return res;
        } catch (err) {
            console.error(err);
            throw new functions.https.HttpsError("unknown", "Unknown error.");
        }
    }
);
