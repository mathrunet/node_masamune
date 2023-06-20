import * as path from "path";
import * as utils from "./utils";
import * as admin from "firebase-admin";

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
export async function updateSubscription({
    targetCollectionPath,
    targetDocumentId,
    data,
    additionalData,
    userId,
    platform,
    orderId,
    productId,
    purchaseId,
    packageName,
    token,
    expiryDate,
}: {
    targetCollectionPath: string,
    targetDocumentId: string,
    data: { [key: string]: any },
    additionalData: { [key: string]: any },
    userId: string,
    platform: string,
    orderId: string,
    productId: string,
    purchaseId: string,
    packageName: string,
    token: string,
    expiryDate: number,
}) {
    const update : {[key: string]: any} = {};
    const firestoreInstance = admin.firestore();
    for (const key in data) {
        if (!data[key]) {
            continue;
        }
        update[key] = utils.parse( data[key] );
    }
    if (additionalData) {
        for (const key in additionalData) {
            if (!additionalData[key]) {
                continue;
            }
            update[key] = utils.parse(additionalData[key]);
        }
    }
    targetCollectionPath = `${targetCollectionPath}/${targetDocumentId}`;
    update["expired"] = false;
    update["token"] = token;
    update["platform"] = platform;
    update["productId"] = productId;
    update["purchaseId"] = purchaseId;
    update["packageName"] = packageName;
    update["expiredTime"] = expiryDate;
    update["orderId"] = orderId;
    if (userId) {
        update["user"] = userId;
    }
    update["@time"] = new Date();
    update["@uid"] = path.basename( targetCollectionPath );
    await firestoreInstance.doc(targetCollectionPath).set(update, {
        merge: true,
    });
}
