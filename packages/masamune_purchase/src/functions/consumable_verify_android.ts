import * as functions from "firebase-functions/v2";
import * as verifier from "../lib/verify_android";
import * as updater from "../lib/update_wallet";
import { HttpFunctionsOptions, firestoreLoader } from "@mathrunet/masamune";

/**
 * Performs a consumption-type in-app purchase. The value of the field in the document specified in [path] is added to [value].
 * 
 * 消費型のアプリ内課金を行います。[path]に指定したドキュメント内のフィールドの値を[value]に加算します。
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
 * The path, including the key, of the field in the document that stores the in-app wallet information.
 * 
 * アプリ内ウォレット情報を保存するドキュメント内のフィールドのキーを含めたパス。
 * 
 * @param value
 * Value of the amount to be added.
 * 
 * 加算する金額の値。
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
        serviceAccount: options?.serviceAccount ?? undefined,
        enforceAppCheck: options.enforceAppCheck ?? undefined,
        consumeAppCheckToken: options.consumeAppCheckToken ?? undefined,
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
                purchaseToken: query.data.purchaseToken,
            });
            if (res.purchaseState !== 0) {
                throw new functions.https.HttpsError("unauthenticated", "Illegal receipt.");
            }
            /* ==== ここまでAndroid検証 ==== */
            if (!query.data.path || !query.data.value) {
                throw new functions.https.HttpsError(
                    "invalid-argument", `The required parameters are not set. path: ${query.data.path} value: ${query.data.value}`,
                );
                return res;
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
                        transactionId: query.data.purchaseToken,
                        transactionData: res,
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
