import { Context, Hono } from "hono";
import { HttpError, jsonError } from "@mathrunet/masamune_cloudflare";
import * as verifier from "../lib/verify_ios";
import * as updater from "../lib/update_unlock";
import { requireAuthenticatedUid, resolveUserFieldPath, rethrowAsHttpError } from "../lib/auth";
import { PurchaseWorkersOptions, resolveIOSBundleId, resolveIOSEnvironment, resolveIOSRootCertificates, resolveIOSSharedSecret, resolveUserDocumentPath } from "../lib/options";

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
 *
 * @param {string} PURCHASE_USERPATH
 * Template of the per-user document (default `plugins/iap/user/{userId}`). `path` must be `<template>/<fieldKey>` of the authenticated user.
 *
 * ユーザー別ドキュメントのテンプレート（デフォルト`plugins/iap/user/{userId}`）。`path`は認証済みユーザーの`<テンプレート>/<フィールドキー>`である必要があります。
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
            // Bind the write target to the authenticated user before contacting the store.
            // ストアへ問い合わせる前に、書き込み先を認証済みユーザーに拘束します。
            const { documentPath, fieldKey } = resolveUserFieldPath(
                body.path,
                uid,
                resolveUserDocumentPath(context, options),
            );
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
                throw new HttpError(401, "Illegal receipt.");
            }
            /* ==== ここまでIOS検証 ==== */
            const info = res["latest_receipt_info"];
            if (!info) {
                throw new HttpError(400, "The required parameters are not set.");
            }
            /* ==== データベースの更新ここから ==== */
            const database = options.database;
            if (database) {
                try {
                    await updater.updateUnlock({
                        targetDocumentFieldPath: `${documentPath}/${fieldKey}`,
                        transactionId: info[info.length - 1].original_transaction_id ?? "",
                        transactionData: info[info.length - 1],
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
