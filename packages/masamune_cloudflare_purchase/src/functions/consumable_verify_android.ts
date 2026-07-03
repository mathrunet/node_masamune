import { Context, Hono } from "hono";
import { HttpError, jsonError } from "@mathrunet/masamune_cloudflare";
import * as verifier from "../lib/verify_android";
import * as updater from "../lib/update_wallet";
import { PurchaseWorkersOptions, resolveAndroidServiceAccount } from "../lib/options";

/**
 * Performs a consumption-type in-app purchase. The value of the field in the document specified in [path] is added to [value].
 *
 * 消費型のアプリ内課金を行います。[path]に指定したドキュメント内のフィールドの値を[value]に加算します。
 *
 * @param {string} PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL
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
 * @param {string} PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY
 * A private key for your Google service account.
 * After creating a service account, create a key in Json format from the Key tab.
 * The private key is described there.
 *
 * Googleのサービスアカウントのプライベートキー。
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
    hono: Hono,
    options: PurchaseWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        try {
            const body = await context.req.json() as { [key: string]: any };
            /* ==== Android検証ここから ==== */
            const serviceAccount = resolveAndroidServiceAccount(context, options);
            const res = await verifier.verifyAndroid({
                type: "products",
                serviceAccountEmail: serviceAccount.email,
                serviceAccountPrivateKey: serviceAccount.privateKey,
                packageName: body.packageName,
                productId: body.productId,
                purchaseToken: body.purchaseToken,
            });
            if (res.purchaseState !== 0) {
                throw new HttpError(401, "Illegal receipt.");
            }
            /* ==== ここまでAndroid検証 ==== */
            if (!body.path || !body.value) {
                throw new HttpError(
                    400, `The required parameters are not set. path: ${body.path} value: ${body.value}`,
                );
            }
            /* ==== データベースの更新ここから ==== */
            const database = options.database;
            if (database) {
                try {
                    await updater.updateWallet({
                        targetDocumentFieldPath: body.path,
                        value: body.value,
                        transactionId: body.purchaseToken,
                        transactionData: res,
                        database: database,
                    });
                } catch (err) {
                    console.error(err);
                    throw new HttpError(500, "Unknown error.");
                }
            }
            /* ==== ここまでデータベースの更新 ==== */
            return context.json(res);
        } catch (err) {
            return jsonError(context, err);
        }
    });
    return hono;
};
