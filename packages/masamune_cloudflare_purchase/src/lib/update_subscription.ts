import { utils } from "@mathrunet/masamune";
import { HttpError } from "@mathrunet/masamune_cloudflare";
import { UpdateSubscriptionData, UpdateSubscriptionRequest } from "./interface";

/**
 * Processes subscription updates.
 *
 * サブスクリプションのアップデート処理を行います。
 *
 * @param {String} targetCollectionPath
 * Specify the path of the collection to be updated.
 *
 * アップデートを行うコレクションのパスを指定します。
 *
 * @param {String} targetDocumentId
 * Specifies the ID of the document to be updated.
 *
 * アップデートを行うドキュメントのIDを指定します。
 *
 * @param {[key: string]: any} data
 * Document data to be updated.
 *
 * 更新するドキュメントデータ。
 *
 * @param {[key: string]: any} additionalData
 * Additional documentation data.
 *
 * 追加のドキュメントデータ。
 *
 * @param {String} userId
 * ID of the user who purchased the subscription.
 *
 * サブスクリプションを購入したユーザーのID。
 *
 * @param {String} platform
 * Subscription-based platform.
 *
 * サブスクリプションを利用するプラットフォーム。
 *
 * @param {String} orderId
 * Subscription Order ID.
 *
 * サブスクリプションの注文ID。
 *
 * @param {String} productId Product ID.
 * Subscription product ID.
 *
 * サブスクリプションのプロダクトID。
 *
 * @param {String} purchaseId
 * Subscription purchase ID.
 *
 * サブスクリプションの購入ID。
 *
 * @param {String} packageName
 * The package name of the application.
 *
 * アプリケーションのパッケージ名。
 *
 * @param {String} token
 * Token issued at the time of purchase.
 *
 * 購入時に発行されたトークン。
 *
 * @param {number} expiryDate
 * Subscription expiration date.
 *
 * サブスクリプションの有効期限。
 */
export async function updateSubscription(request: UpdateSubscriptionRequest): Promise<void> {
    const update: { [key: string]: any } = {};
    for (const key in request.data) {
        if (!request.data[key]) {
            continue;
        }
        update[key] = utils.parse(request.data[key]);
    }
    if (request.additionalData) {
        for (const key in request.additionalData) {
            if (!request.additionalData[key]) {
                continue;
            }
            update[key] = utils.parse(request.additionalData[key]);
        }
    }
    const targetDocumentPath = `${request.targetCollectionPath}/${request.targetDocumentId}`;
    const segments = targetDocumentPath.split("/").filter((segment) => segment.length > 0);
    // A transaction already claimed by another user must not be re-bound.
    // 既に別のユーザーに紐付いたトランザクションを付け替えさせません。
    const existing = await request.database.getDocument(targetDocumentPath);
    const owner = existing?.data?.["userId"];
    if (typeof owner === "string" && owner.length > 0 && owner !== request.userId) {
        throw new HttpError(403, "This subscription belongs to another user.");
    }
    const data: UpdateSubscriptionData = {
        ...update,
        expired: false,
        paused: false,
        token: request.token,
        platform: request.platform,
        productId: request.productId,
        purchaseId: request.purchaseId,
        packageName: request.packageName,
        expiredTime: request.expiryDate,
        orderId: request.orderId,
        userId: request.userId,
        "@time": new Date(),
        "@uid": segments[segments.length - 1],
    };
    await request.database.saveDocument(targetDocumentPath, data, { merge: true });
}
