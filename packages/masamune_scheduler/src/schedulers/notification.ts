import { lib, ModelToken } from "@mathrunet/masamune_notification";
import { SchedulerNotificationRequest } from "../lib/interface";

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
export async function notification(request: SchedulerNotificationRequest): Promise<{ [key: string]: any }> {
    const responseTokenList = request.params.responseTokenList;
    const res = await lib.sendNotification({
        ...request.params,
        firestoreInstance: request.firestoreInstance,
    });
    if (responseTokenList) {
        return { results: JSON.stringify(res.results) };
    }
    return {};
}