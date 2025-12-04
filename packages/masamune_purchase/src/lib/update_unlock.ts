import * as path from "path";
import * as admin from "firebase-admin";

/**
 * Unlock function. Unlock information is stored in the form of an overwrite of the user data.
 * 
 * 機能をアンロックします。アンロックの情報はユーザーデータに上書きされる形で保存されます。
 * 
 * @param {String} targetDocumentFieldPath
 * The path, including the key, of the field in the document where the unlock information is to be stored.
 * 
 * アンロック情報を保存するドキュメント内のフィールドのキーを含めたパス。
 * 
 * @param {String} transactionId
 * Specify the ID of the log.
 * 
 * ログのIDを指定します。
 * 
 * @param {[key: string]: any} transactionData
 * Log data to be updated.
 * 
 * 更新するログデータ。
 */
export async function updateUnlock({
    targetDocumentFieldPath,
    transactionId,
    transactionData,
    firestoreInstance,
}: {
    targetDocumentFieldPath: string,
    transactionId: string,
    transactionData: { [key: string]: any },
    firestoreInstance: FirebaseFirestore.Firestore,
}) {
    const update: { [key: string]: any } = {};
    const key = path.basename(targetDocumentFieldPath);
    const parent = targetDocumentFieldPath.replace(`/${key}`, "");
    const uid = path.basename(parent);
    update[key] = true;
    update["@uid"] = uid;
    update["@time"] = new Date();
    await firestoreInstance.doc(parent).save(
        update, { merge: true }
    );
    await firestoreInstance.doc(`${parent}/transaction/${transactionId}`).save(
        transactionData, { merge: true }
    );
}
