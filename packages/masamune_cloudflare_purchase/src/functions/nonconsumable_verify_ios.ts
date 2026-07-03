import { Context, Hono } from "hono";
import { HttpError, jsonError } from "@mathrunet/masamune_cloudflare";
import * as verifier from "../lib/verify_ios";
import * as updater from "../lib/update_unlock";
import { PurchaseWorkersOptions, resolveIOSSharedSecret } from "../lib/options";

/**
 * Performs non-consumable in-app purchases. `true` is written to the document field specified in [path].
 *
 * 非消費型のアプリ内課金を行います。[path]に指定したドキュメントのフィールドに`true`が書き込まれます。
 *
 * @param {string} PURCHASE_IOS_SHAREDSECRET
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
module.exports = (
    hono: Hono,
    options: PurchaseWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        try {
            const body = await context.req.json() as { [key: string]: any };
            /* ==== IOS検証ここから ==== */
            const res = await verifier.verifyIOS({
                receiptData: body.receiptData,
                password: resolveIOSSharedSecret(context, options),
                transactionId: body.transactionId,
                storeKitVersion: body.storeKitVersion ?? 1,
            });
            const status = res["status"];
            if (status !== 0) {
                throw new HttpError(401, "Illegal receipt.");
            }
            /* ==== ここまでIOS検証 ==== */
            const info = res["latest_receipt_info"];
            if (!info || !body.path) {
                throw new HttpError(
                    400, `The required parameters are not set. path: ${body.path}`,
                );
            }
            /* ==== データベースの更新ここから ==== */
            const database = options.database;
            if (database) {
                try {
                    await updater.updateUnlock({
                        targetDocumentFieldPath: body.path,
                        transactionId: info[info.length - 1].original_transaction_id ?? "",
                        transactionData: info[info.length - 1],
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
