import * as admin from "firebase-admin";
import { lib } from "@mathrunet/masamune_firestore";

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
export async function deleteDocuments({
    doc,
    firestoreInstance,
    params,
}: {
    doc: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData, admin.firestore.DocumentData>,
    firestoreInstance: admin.firestore.Firestore,
    params: { [key: string]: any },
}): Promise<{ [key: string]: any }> {
    const collectionPath = params["collectionPath"] as string;
    const wheres = params["wheres"] as { [key: string]: any }[] | undefined;
    const conditions = params["conditions"] as { [key: string]: any }[] | undefined;
    await lib.deleteDocuments({
        collectionPath: collectionPath,
        wheres: wheres,
        conditions: conditions,
        firestoreInstance: firestoreInstance,
    });
    return {};
}