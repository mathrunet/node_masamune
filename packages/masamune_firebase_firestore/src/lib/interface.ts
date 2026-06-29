/**
 * Firestore model response interface.
 * 
 * Firestoreモデルレスポンスインターフェース。
 */
export interface FirestoreModelResponse {
    status: number;
    data?: string;
}

/**
 * Firestore delete documents request interface.
 * 
 * Firestoreドキュメント削除リクエストインターフェース。
 */
export interface FirestoreDeleteDocumentsRequest {
    collectionPath: string;
    wheres?: { [key: string]: any }[] | undefined;
    conditions?: { [key: string]: any }[] | undefined;
    firestoreInstance: FirebaseFirestore.Firestore;
}