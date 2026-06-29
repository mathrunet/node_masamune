import * as firestore from "firebase-admin/firestore";
import * as storage from "firebase-admin/storage";
import { Bucket } from '@google-cloud/storage';
import * as admin from "firebase-admin";

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
    if (admin.apps.length === 0) {
        admin.initializeApp();
    }
    if (!databaseId || databaseId == "" || databaseId == "(default)") {
        const app = admin.apps[0];
        if(!app){
            throw new Error("No app found");
        }
        return firestore.getFirestore(app);
    } else {
        const app = admin.apps[0];
        if(!app){
            throw new Error("No app found");
        }
        return firestore.getFirestore(app, databaseId);
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
    if (admin.apps.length === 0) {
        admin.initializeApp();
    }
    const app = admin.apps[0];
    if(!app){
        throw new Error("No app found");
    }
    return storage.getStorage(app).bucket(bucketId);
}