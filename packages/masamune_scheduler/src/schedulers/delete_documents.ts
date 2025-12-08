import { lib } from "@mathrunet/masamune_firestore";
import { SchedulerDeleteDocumentsRequest } from "../lib/interface";

/**
 * Processes scheduler commands for document deletion.
 * 
 * ドキュメント削除用のスケジューラーコマンドを処理します。
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
export async function deleteDocuments(request: SchedulerDeleteDocumentsRequest): Promise<{ [key: string]: any }> {
    await lib.deleteDocuments({
        ...request.params,
        firestoreInstance: request.firestoreInstance,
    });
    return {};
}