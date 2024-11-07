import * as functions from "firebase-functions/v2";
import * as verifier from "../lib/functions/verify_android";
import * as updater from "../lib/functions/update_unlock";
import { HttpFunctionsOptions } from "../lib/src/functions_base";

/**
 * Performs non-consumable in-app purchases. Unlock by setting the value of the field in the document specified in [path] to `true`.
 * 
 * 非消費型のアプリ内課金を行います。[path]に指定したドキュメント内のフィールドの値を`true`にすることでアンロックを行います。
 * 
 * @param process.env.PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL
 * The email address of your Google service account.
 * Create an OAuth consent screen from the URL below.
 * https://console.cloud.google.com/apis/credentials/consent
 * It is then created from the service account.
 * https://console.cloud.google.com/iam-admin/serviceaccounts
 * 
 * Googleのサービスアカウントのメールアドレス。
 * 下記のURLからOAuthの同意画面を作成します。
 * https://console.cloud.google.com/apis/credentials/consent
 * その後、サービスアカウントから作成します。
 * https://console.cloud.google.com/iam-admin/serviceaccounts
 * 
 * @param process.env.PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY
 * A private key for your Google service account.
 * Create an OAuth consent screen from the URL below.
 * https://console.cloud.google.com/apis/credentials/consent
 * It is then created from the service account.
 * https://console.cloud.google.com/iam-admin/serviceaccounts
 * After creating a service account, create a key in Json format from the Key tab.
 * The private key is described there.
 * 
 * Googleのサービスアカウントのプライベートキー。
 * 下記のURLからOAuthの同意画面を作成します。
 * https://console.cloud.google.com/apis/credentials/consent
 * その後、サービスアカウントから作成します。
 * https://console.cloud.google.com/iam-admin/serviceaccounts
 * サービスアカウント作成後、キーのタブからJson形式でキーを作成します。
 * プライベートキーはそこに記述されています。
 * 
 * @param path
 * The path, including the key, of the field in the document where the unlock information is to be stored.
 * 
 * アンロック情報を保存するドキュメント内のフィールドのキーを含めたパス。
 * 
 * @param packageName
 * Application package name.
 * 
 * アプリケーションのパッケージ名。
 * 
 * @param productId
 * Item ID issued by Google Play.
 * 
 * GooglePlayで発行されたアイテムID。
 * 
 * @param purchaseToken
 * The purchase token issued at the time of purchase.
 * 
 * 購入したときに発行された購入トークン。
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
    },
    async (query) => {
        try {
            /* ==== Android検証ここから ==== */
            const res = await verifier.verifyAndroid({
                type: "products",
                serviceAccountEmail: process.env.PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL ?? "",
                serviceAccountPrivateKey: process.env.PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY ?? "",
                packageName: query.data.packageName,
                productId: query.data.productId,
                purchaseToken: query.data.purchaseToken
            });
            if (res["purchaseState"] !== 0) {
                throw new functions.https.HttpsError("unauthenticated", "Illegal receipt.");
            }
            /* ==== ここまでAndroid検証 ==== */
            if (!query.data.path) {
                throw new functions.https.HttpsError(
                    "invalid-argument", `The required parameters are not set. path: ${query.data.path}`,
                );
                return res;
            }
            /* ==== Firestoreの更新ここから ==== */
            await updater.updateUnlock({
                targetDocumentFieldPath: query.data.path,
                transactionId: query.data.purchaseToken,
                transactionData: res,
            });
            /* ==== ここまでFirestoreの更新 ==== */
            return res;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
);
