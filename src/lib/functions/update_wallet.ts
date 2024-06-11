import * as path from "path";
import * as admin from "firebase-admin";

/**
 * The amount of money in the in-app wallet is added to the in-app wallet due to in-app purchases. In-app wallet information is stored in a form that overwrites user data.
 * 
 * アプリ内課金によるアプリ内ウォレットの金額の加算を行います。アプリ内ウォレットの情報はユーザーデータに上書きされる形で保存されます。
 * 
 * @param {String} targetDocumentFieldPath
 * The path, including the key, of the field in the document that stores the in-app wallet information.
 * 
 * アプリ内ウォレット情報を保存するドキュメント内のフィールドのキーを含めたパス。
 * 
 * @param {number} value
 * Value of the amount to be added.
 * 
 * 加算する金額の値。
 */
export async function updateWallet({
    targetDocumentFieldPath,
    value,
}: {
    targetDocumentFieldPath: string,
    value: number,
}) {
    const update: { [key: string]: any } = {};
    const key = path.basename( targetDocumentFieldPath );
    const parent = targetDocumentFieldPath.replace( `/${key}`, "" );
    const uid = path.basename(parent);
    const firestoreInstance = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;
    update[key] = FieldValue.increment(value);
    update["@uid"] = uid;
    update["@time"] = new Date();
    await firestoreInstance.doc(parent).set(update, {
        merge: true,
    });
}
