import { SendNotificationRequest } from "@mathrunet/masamune_firebase_notification";
import { FirestoreDeleteDocumentsRequest } from "@mathrunet/masamune_firebase_firestore";
import { DocumentData, Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

/**
 * Scheduler copy document request interface.
 * 
 * スケジューラーのドキュメントコピーリクエストインターフェース。
 */
export interface SchedulerCopyDocumentRequest {
    doc: QueryDocumentSnapshot<DocumentData, DocumentData>,
    firestoreInstance: Firestore,
    params: {
        path?: string;
        [key: string]: any;
    },
}

/**
 * Scheduler copy document response interface.
 * 
 * スケジューラーのドキュメントコピーレスポンスインターフェース。
 */
export interface SchedulerCopyDocumentResponse {
    "@uid": string;
    [key: string]: any;
}

/**
 * Scheduler delete document response interface.
 * 
 * スケジューラーのドキュメント削除レスポンスインターフェース。
 */
export interface SchedulerDeleteDocumentsRequest {
    doc: QueryDocumentSnapshot<DocumentData, DocumentData>,
    firestoreInstance: Firestore,
    params: FirestoreDeleteDocumentsRequest;
}

/**
 * Scheduler notification request interface.
 * 
 * スケジューラーの通知リクエストインターフェース。
 */
export interface SchedulerNotificationRequest {
    doc: QueryDocumentSnapshot<DocumentData, DocumentData>;
    firestoreInstance: Firestore;
    params: SendNotificationRequest;
}

export interface SchedulerData {
    "_data"?: boolean;
    "#command"?: {
        "@command"?: string;
        "@private"?: { [key: string]: any };
    };
    [key: string]: any;
}