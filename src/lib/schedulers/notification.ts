import { sendNotification } from "../functions/send_notification";
import * as admin from "firebase-admin";

/**
 * Processes scheduler commands for notification.
 * 
 * 通知用のスケジューラーコマンドを処理します。
 * 
 * @param params
 * Private parameters.
 * 
 * プライベートパラメーター。
 * 
 * @param doc
 * Document data.
 * 
 * ドキュメントデータ。
 * 
 * @param firestoreInstance
 * Firestore instance.
 * 
 * Firestoreインスタンス。
 * 
 * @returns 
 * Response. All data will be overwritten into the document.
 * 
 * レスポンス。データがすべてドキュメントに上書きされます。
 */
export async function notification({
    doc,
    firestoreInstance,
    params,
}: {
    doc: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData, admin.firestore.DocumentData>,
    firestoreInstance: admin.firestore.Firestore,
    params: { [key: string]: any },
}): Promise<{ [key: string]: any }> {    
    const title = params["title"] as string;
    const body = params["text"] as string;
    const channelId = params["channel"] as string | undefined | null;
    const data = params["data"] as { [key: string]: any } | undefined;
    const badgeCount = params["badgeCount"] as number | undefined | null;
    const sound = params["sound"] as string | undefined | null;
    const targetToken = params["targetToken"] as string | string[] | undefined | null;
    const targetTopic = params["targetTopic"] as string | undefined | null;
    const targetCollectionPath = params["targetCollectionPath"] as string | undefined | null;
    const targetDocumentPath = params["targetDocumentPath"] as string | undefined | null;
    const targetTokenField = params["targetTokenField"] as string | { [key: string]: any } | undefined | null;
    const targetWheres = params["targetWheres"] as { [key: string]: any }[] | undefined;
    const targetConditions = params["targetConditions"] as { [key: string]: any }[] | undefined;
    const responseTokenList = params["responseTokenList"] as boolean | undefined;
    const res = await sendNotification({
        title: title,
        body: body,
        channelId: channelId,
        data: data,
        badgeCount: badgeCount,
        sound: sound,
        targetToken: targetToken,
        targetTopic: targetTopic,
        targetCollectionPath: targetCollectionPath,
        targetDocumentPath: targetDocumentPath,
        targetTokenField: targetTokenField,
        targetWheres: targetWheres,
        targetConditions: targetConditions,
        responseTokenList: responseTokenList,
        firestoreInstance: firestoreInstance,
    });
    if (responseTokenList) {
        return { results: JSON.stringify(res.results) };
    }
    return {};
}