import * as firestore from "firebase-admin/firestore";
import * as storage from "firebase-admin/storage";
import { Bucket } from '@google-cloud/storage';
import { getApps, initializeApp } from "firebase-admin/app";

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
    if (getApps().length === 0) {
        initializeApp();
    }
    if (!databaseId || databaseId == "" || databaseId == "(default)") {
        const app = getApps()[0];
        if(!app){
            throw new Error("No app found");
        }
        return firestore.getFirestore(app);
    } else {
        const app = getApps()[0];
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
    if (getApps().length === 0) {
        initializeApp();
    }
    const app = getApps()[0];
    if(!app){
        throw new Error("No app found");
    }
    return storage.getStorage(app).bucket(bucketId);
}