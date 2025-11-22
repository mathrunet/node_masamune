import * as firestore from "firebase-admin/firestore";
import * as storage from "firebase-admin/storage";
import { Bucket } from '@google-cloud/storage';

/**
 * Loads the Firestore instance.
 * 
 * Firestoreインスタンスを読み込みます。
 * 
 * @param databaseId
 * Firestore Database ID.
 * 
 * FirestoreのデータベースID。
 * 
 * @returns
 * Firestore instance.
 * 
 * Firestoreインスタンス。
 */
export function firestoreLoader(databaseId: string | null | undefined): firestore.Firestore {
    if (!databaseId || databaseId == "" || databaseId == "(default)") {
        return firestore.getFirestore();
    } else {
        return firestore.getFirestore(databaseId);
    }
}

/**
 * Loads the Storage instance.
 * 
 * Storageインスタンスを読み込みます。
 * 
 * @param bucketId
 * StorageのバケットID。
 * 
 * @returns
 * Storageインスタンス。
 */
export function storageLoader(bucketId: string): Bucket {
    return storage.getStorage().bucket(bucketId);
}