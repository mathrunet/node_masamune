import * as functions from "firebase-functions";
import * as verifier from "../lib/verify_ios";
import * as updater from "../lib/update_unlock";

/**
 * Performs non-consumable in-app purchases. Unlock by setting the value of the field in the document specified in [path] to `true`.
 * 
 * 非消費型のアプリ内課金を行います。[path]に指定したドキュメント内のフィールドの値を`true`にすることでアンロックを行います。
 * 
 * @param purchase.ios.shared_secret
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
module.exports = (regions: string[]) => functions.region(...regions).https.onCall(
    async (query) => {
        try {
            const config = functions.config().purchase;
            /* ==== IOS検証ここから ==== */
            const res = await verifier.verifyIOS({
                receiptData: query.receiptData,
                password: config.ios.shared_secret,
            });
            const status = res["status"];
            if (status !== 0) {
                throw new functions.https.HttpsError("unauthenticated", "Illegal receipt.");
            }
            /* ==== ここまでIOS検証 ==== */
            if (!query.path) {
                return res;
            }
            /* ==== Firestoreの更新ここから ==== */
            await updater.updateUnlock({
                targetDocumentFieldPath: query.path,
            });
            /* ==== ここまでFirestoreの更新 ==== */
            return res;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
