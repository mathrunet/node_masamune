import { ModelToken } from "@mathrunet/masamune";

/**
 * Send notification request interface.
 * 
 * 通知送信リクエストインターフェース。
 */
export interface SendNotificationRequest {
    title: string;
    body: string;
    link?: string | undefined | null;
    channelId?: string | undefined | null;
    data?: { [key: string]: any } | undefined;
    badgeCount?: number | undefined | null;
    sound?: string | undefined | null;
    targetToken?: string | string[] | ModelToken | undefined | null;
    targetTopic?: string | undefined | null;
    targetCollectionPath?: string | undefined | null;
    targetDocumentPath?: string | undefined | null;
    targetTokenField?: string | { [key: string]: any } | undefined | null;
    targetWheres?: { [key: string]: any }[] | undefined;
    targetConditions?: { [key: string]: any }[] | undefined;
    responseTokenList?: boolean | undefined | null;
    firestoreInstance: FirebaseFirestore.Firestore,
    showLog?: boolean | undefined | null;
    dryRun?: boolean | undefined | null;
}

/**
 * Send notification response interface.
 * 
 * 通知送信レスポンスインターフェース。
 */
export interface SendNotificationResponse {
    success: boolean;
    results: any[] | string | { [key: string]: any } | undefined | null;
}