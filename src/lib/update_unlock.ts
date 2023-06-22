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
 */
export async function updateUnlock({
    targetDocumentFieldPath,
}: {
    targetDocumentFieldPath: string,
}) {
    const update: { [key: string]: any } = {};
    const key = path.basename(targetDocumentFieldPath);
    const parent = targetDocumentFieldPath.replace(`/${key}`, "");
    const uid = path.basename(parent);
    const firestoreInstance = admin.firestore();
    update[key] = true;
    update["@uid"] = uid;
    update["@time"] = new Date();
    await firestoreInstance.doc(parent).set(update, {
        merge: true,
    });
}
