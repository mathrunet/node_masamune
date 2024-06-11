
import * as admin from "firebase-admin";
import { splitArray } from "../utils";
import * as firestore from "./firestore";

/**
 * Loads related collections and deletes data matching the criteria.
 * 
 * 関連するコレクションをロードし、条件に一致するデータを削除します。
 * 
 * @param collectionPath
 * Specify the path of the collection to be deleted.
 * 
 * 削除対象のコレクションのパスを指定します。
 * 
 * @param wheres
 * Specifies the conditions under which collections to be deleted are retrieved.
 * 
 * 削除対象のコレクションを取得する際の条件を指定します。
 * 
 * @param conditions
 * Specify the conditions under which data is to be deleted.
 * 
 * データを削除対象とする条件を指定します。
 */
export async function deleteDocuments({
    collectionPath,
    wheres,
    conditions,
}:  {
        collectionPath: string,
        wheres?: { [key: string]: string }[] | undefined,
        conditions?: { [key: string]: string }[] | undefined,
    }) : Promise<{ [key: string]: any }> {
    const res: { [key: string]: any } = {};
    try {
        const firestoreInstance = admin.firestore();
        const collectionRef = firestore.where({
            query: firestoreInstance.collection(collectionPath),
            wheres: wheres
        });
        let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
        let collection: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData> | null = null;
        do {
            collection = await firestore.cursor({ query: collectionRef, limit: 500, cursor: cursor }).get();
            const deleteList: admin.firestore.DocumentReference<admin.firestore.DocumentData, admin.firestore.DocumentData>[] = [];
            for (let doc of collection.docs) {
                const data = doc.data() as { [key: string]: any };
                if (!await firestore.hasMatch({ data: data, conditions: conditions })) {
                    continue;
                }
                deleteList.push(doc.ref);
            }
            const splitted = splitArray(deleteList, 500);
            for (let list of splitted) {
                const batch = firestoreInstance.batch();
                for (let doc of list) {
                    batch.delete(doc);
                }
                await batch.commit();
            }
            if (collection.docs.length < 500) {
                break;
            }
            cursor = collection.docs[collection.docs.length - 1];
        } while (collection.docs.length >= 500);
    } catch (err) {
        throw err;
    }
    return {
        success: true,
        results: res,
    };
}