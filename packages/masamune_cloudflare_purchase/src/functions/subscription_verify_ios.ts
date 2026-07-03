import { Context, Hono } from "hono";
import { HttpError, jsonError } from "@mathrunet/masamune_cloudflare";
import * as verifier from "../lib/verify_ios";
import * as subscription from "../lib/update_subscription";
import { PurchaseWorkersOptions, resolveIOSSharedSecret, resolveSubscriptionPath } from "../lib/options";

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
 */
module.exports = (
    hono: Hono,
    options: PurchaseWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        try {
            const body = await context.req.json() as { [key: string]: any };
            /* ==== IOS検証ここから ==== */
            if (!body.userId) {
                throw new HttpError(400, "User is empty.");
            }
            const res = await verifier.verifyIOS({
                receiptData: body.receiptData,
                password: resolveIOSSharedSecret(context, options),
                transactionId: body.transactionId,
                storeKitVersion: body.storeKitVersion ?? 1,
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
                    const targetPath = body.path ?? resolveSubscriptionPath(context, options);
                    if (!targetPath) {
                        throw new HttpError(500, "PURCHASE_SUBSCRIPTIONPATH is not set.");
                    }
                    await subscription.updateSubscription({
                        targetCollectionPath: targetPath,
                        targetDocumentId: info[info.length - 1].original_transaction_id ?? "",
                        data: info[info.length - 1],
                        additionalData: body,
                        userId: body.userId,
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
