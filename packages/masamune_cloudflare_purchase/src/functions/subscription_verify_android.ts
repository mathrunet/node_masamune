import { Context, Hono } from "hono";
import { HttpError, jsonError } from "@mathrunet/masamune_cloudflare";
import * as verifier from "../lib/verify_android";
import * as subscription from "../lib/update_subscription";
import { assertUserIdMatches, requireAuthenticatedUid, rethrowAsHttpError, sanitizeAdditionalData } from "../lib/auth";
import { PurchaseWorkersOptions, resolveAndroidPackageName, resolveAndroidServiceAccount, resolveSubscriptionPath } from "../lib/options";

/**
 * Verify Android subscriptions and save subscription data.
 *
 * Androidのサブスクリプションの検証を行いサブスクリプションデータを保存します。
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
 * @param {string} PURCHASE_SUBSCRIPTIONPATH
 * Describes the path to the collection of subscriptions.
 *
 * サブスクリプションのコレクションのパスを記述します。
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
 *
 * @param userId
 * ID of the user who purchased the subscription.
 *
 * サブスクリプションを購入したユーザーのID。
 *
 * The authenticated user ID (from the auth adapter) is always used as the owner. `userId` in the body, when present, must match it.
 * `path` in the body is ignored; only `PURCHASE_SUBSCRIPTIONPATH` is used. Extra fields must be sent under `data`.
 *
 * 所有者には常に認証アダプターの認証済みユーザーIDを使用します。ボディの`userId`がある場合は一致が必要です。
 * ボディの`path`は無視され`PURCHASE_SUBSCRIPTIONPATH`のみを使用します。追加フィールドは`data`に入れてください。
 *
 * @param {string} PURCHASE_ANDROID_PACKAGENAME
 * Android package name. When set, requests for other packages are rejected.
 *
 * Androidのパッケージ名。設定した場合、他パッケージのリクエストは拒否されます。
 */
module.exports = (
    hono: Hono,
    options: PurchaseWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        try {
            const uid = requireAuthenticatedUid(context);
            const body = await context.req.json() as { [key: string]: any };
            assertUserIdMatches(uid, body.userId);
            /* ==== Android検証ここから ==== */
            const expectedPackageName = resolveAndroidPackageName(context, options);
            if (expectedPackageName && body.packageName !== expectedPackageName) {
                throw new HttpError(403, "Package name mismatch.");
            }
            const serviceAccount = resolveAndroidServiceAccount(context, options);
            const res = await verifier.verifyAndroid({
                type: "subscriptions",
                serviceAccountEmail: serviceAccount.email,
                serviceAccountPrivateKey: serviceAccount.privateKey,
                packageName: body.packageName,
                productId: body.productId,
                purchaseToken: body.purchaseToken,
            });
            const time = new Date().getTime();
            const startTimeMillis = parseInt(res.startTimeMillis ?? "0");
            const expiryTimeMillis = parseInt(res.expiryTimeMillis ?? "0");
            if (res === null || isNaN(startTimeMillis) || isNaN(expiryTimeMillis) || startTimeMillis <= 0) {
                throw new HttpError(404, "Illegal receipt.");
            }
            if (expiryTimeMillis <= time) {
                res["expired"] = true;
            }
            /* ==== ここまでAndroid検証 ==== */
            /* ==== データベースの更新ここから ==== */
            const database = options.database;
            if (database) {
                try {
                    // The collection path is server configuration only; `body.path` is never honored.
                    // コレクションパスはサーバー設定のみで決まり、`body.path`は使用しません。
                    const targetPath = resolveSubscriptionPath(context, options);
                    if (!targetPath) {
                        throw new HttpError(500, "PURCHASE_SUBSCRIPTIONPATH is not set.");
                    }
                    await subscription.updateSubscription({
                        targetCollectionPath: targetPath,
                        targetDocumentId: body.purchaseToken,
                        data: res,
                        additionalData: sanitizeAdditionalData(body.data),
                        userId: uid,
                        platform: "Android",
                        orderId: res.orderId ?? "",
                        productId: body.productId,
                        purchaseId: body.purchaseId,
                        packageName: body.packageName,
                        token: body.purchaseToken,
                        expiryDate: expiryTimeMillis,
                        database: database,
                    });
                } catch (err) {
                    rethrowAsHttpError(err);
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
