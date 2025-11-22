import * as admin from "firebase-admin";

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
export async function copyDocument({
    doc,
    firestoreInstance,
    params,
}: {
    doc: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData, admin.firestore.DocumentData>,
    firestoreInstance: admin.firestore.Firestore,
    params: { [key: string]: any },
}): Promise<{ [key: string]: any }> {
    const path = params["path"] as string;
    const paths = path.split("/");
    const id = paths[paths.length - 1];
    const docData = doc.data();
    const docKeys = Object.keys(docData);
    const update: { [key: string]: any } = {};
    for (const key of docKeys) {
        if (key.startsWith("_") || key == "command" || key == "#command" || key == "@uid") {
            continue;
        }
        update[key] = docData[key];
    }
    update["@uid"] = id;
    await firestoreInstance.doc(path).set(
        update, {
        merge: true
    }
    );
    return {};
}