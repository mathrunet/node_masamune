import { SendNotificationRequest } from "@mathrunet/masamune_notification";
import { FirestoreDeleteDocumentsRequest } from "@mathrunet/masamune_firestore";
import * as admin from "firebase-admin";

/**
 * Scheduler copy document request interface.
 * 
 * スケジューラーのドキュメントコピーリクエストインターフェース。
 */
export interface SchedulerCopyDocumentRequest {
    doc: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData, admin.firestore.DocumentData>,
    firestoreInstance: admin.firestore.Firestore,
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
    doc: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData, admin.firestore.DocumentData>,
    firestoreInstance: admin.firestore.Firestore,
    params: FirestoreDeleteDocumentsRequest;
}

/**
 * Scheduler notification request interface.
 * 
 * スケジューラーの通知リクエストインターフェース。
 */
export interface SchedulerNotificationRequest {
    doc: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData, admin.firestore.DocumentData>;
    firestoreInstance: admin.firestore.Firestore;
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