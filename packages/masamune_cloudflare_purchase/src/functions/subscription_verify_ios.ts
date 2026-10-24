import { Context, Hono } from "hono";
import { HttpError, jsonError } from "@mathrunet/masamune_cloudflare";
import * as verifier from "../lib/verify_ios";
import * as subscription from "../lib/update_subscription";
import { assertUserIdMatches, requireAuthenticatedUid, rethrowAsHttpError, sanitizeAdditionalData } from "../lib/auth";
import { PurchaseWorkersOptions, resolveIOSBundleId, resolveIOSEnvironment, resolveIOSRootCertificates, resolveIOSSharedSecret, resolveSubscriptionPath } from "../lib/options";

/**
 * Verify IOS subscriptions and save subscription data.
 *
 * IOSのサブスクリプションの検証を行いサブスクリプションデータを保存します。
 *
 * @param {string} PURCHASE_IOS_SHAREDSECRET
 * SharedSecret for AppStore, obtained from [Apps]->[App Info]->[Shared Secret for App] in the AppStore.
 *
 * AppStoreのSharedSecret。AppStoreの[アプリ]->[App情報]->[App用共有シークレット]から取得します。
 *
 * @param {string} PURCHASE_SUBSCRIPTIONPATH
 * Describes the path to the collection of subscriptions.
 *
 * サブスクリプションのコレクションのパスを記述します。
 *
 * @param receiptData
 * Receipt data for purchases (for StoreKit1) or JWT token (for StoreKit2).
 *
 * 購入の際のレシートデータ（StoreKit1の場合）またはJWTトークン（StoreKit2の場合）。
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
 * @param {string} PURCHASE_IOS_BUNDLEID
 * App bundle ID. Required for StoreKit 2; signed transactions of other apps are rejected.
 *
 * アプリのバンドルID。StoreKit 2では必須で、他アプリの署名付きトランザクションは拒否されます。
 *
 * @param {string} PURCHASE_IOS_ENVIRONMENT
 * Accepted App Store environment (`Production` or `Sandbox`). Both are accepted when unset.
 *
 * 受け入れるApp Store環境（`Production`または`Sandbox`）。未設定の場合は両方を受け入れます。
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
            /* ==== IOS検証ここから ==== */
            const res = await verifier.verifyIOS({
                receiptData: body.receiptData,
                password: resolveIOSSharedSecret(context, options),
                transactionId: body.transactionId,
                storeKitVersion: body.storeKitVersion ?? 1,
                bundleId: resolveIOSBundleId(context, options),
                environment: resolveIOSEnvironment(context, options),
                rootCertificates: resolveIOSRootCertificates(options),
            });
            const status = res["status"];
            if (status !== 0) {
                throw new HttpError(404, "Illegal receipt.");
            }
            const time = new Date().getTime();
            const info = res.latest_receipt_info;
            if (!info) {
                throw new HttpError(404, "Illegal receipt.");
            }
            const startTimeMillis = parseInt(info[info.length - 1].purchase_date_ms ?? "0");
            const expiryTimeMillis = parseInt(info[info.length - 1].expires_date_ms ?? "0");
            const currentProductId = info?.[info.length - 1].product_id;
            if (res === null || isNaN(startTimeMillis) || isNaN(expiryTimeMillis) || startTimeMillis <= 0) {
                throw new HttpError(404, "Illegal receipt.");
            }
            if (expiryTimeMillis <= time) {
                info[info.length - 1]["expired"] = true;
            }
            /* ==== ここまでIOS検証 ==== */
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
                        targetDocumentId: info[info.length - 1].original_transaction_id ?? "",
                        data: info[info.length - 1],
                        additionalData: sanitizeAdditionalData(body.data),
                        userId: uid,
                        platform: "IOS",
                        orderId: info[info.length - 1].original_transaction_id ?? "",
                        productId: currentProductId ?? "",
                        purchaseId: body.purchaseId,
                        packageName: res.receipt?.bundle_id ?? "",
                        token: body.receiptData,
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
