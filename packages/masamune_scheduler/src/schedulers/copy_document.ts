import * as admin from "firebase-admin";
import "@mathrunet/masamune";
import { SchedulerCopyDocumentRequest, SchedulerCopyDocumentResponse } from "../lib/interface";

/**
 * Processes scheduler commands for document copying.
 * 
 * ドキュメントコピー用のスケジューラーコマンドを処理します。
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
export async function copyDocument(request: SchedulerCopyDocumentRequest): Promise<{ [key: string]: any }> {
    const path = request.params.path;
    if (!path) {
        throw new Error("Path is required.");
    }
    const paths = path.split("/");
    const id = paths[paths.length - 1];
    const docData = request.doc.data();
    const docKeys = Object.keys(docData);
    const update: { [key: string]: any } = {};
    for (const key of docKeys) {
        if (key.startsWith("_") || key == "command" || key == "#command" || key == "@uid") {
            continue;
        }
        update[key] = docData[key];
    }
    const data: SchedulerCopyDocumentResponse = {
        ...update,
        "@uid": id,
    };
    await request.firestoreInstance.doc(path).save(
        data, { merge: true }
    );
    return {};
}