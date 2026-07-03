import { Context, Hono } from "hono";
import { HttpError, jsonError } from "@mathrunet/masamune_cloudflare";
import * as verifier from "../lib/verify_ios";
import * as updater from "../lib/update_wallet";
import { PurchaseWorkersOptions, resolveIOSSharedSecret } from "../lib/options";

/**
 * Performs a consumption-type in-app purchase. The value of the field in the document specified in [path] is added to [value].
 *
 * 消費型のアプリ内課金を行います。[path]に指定したドキュメント内のフィールドの値を[value]に加算します。
 *
 * @param {string} PURCHASE_IOS_SHAREDSECRET
 * SharedSecret for AppStore, obtained from [Apps]->[App Info]->[Shared Secret for App] in the AppStore.
 *
 * AppStoreのSharedSecret。AppStoreの[アプリ]->[App情報]->[App用共有シークレット]から取得します。
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
            if (!info || !body.path || !body.value) {
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
