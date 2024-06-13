import * as admin from "firebase-admin";
import * as delete_documents from "../functions/delete_documents";

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
 * @param firestore
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
    firestore,
    params,
}: {
    doc: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData, admin.firestore.DocumentData>,
    firestore: admin.firestore.Firestore,
    params: { [key: string]: any },
}): Promise<{ [key: string]: any }> {
    const collectionPath = params["collectionPath"] as string;
    const wheres = params["wheres"] as { [key: string]: any }[] | undefined;
    const conditions = params["conditions"] as { [key: string]: any }[] | undefined;
    await delete_documents.deleteDocuments({
        collectionPath: collectionPath,
        wheres: wheres,
        conditions: conditions,
    });
    return {};
}