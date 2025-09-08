import * as functions from "firebase-functions/v2";
import { sendNotification } from "../lib/functions/send_notification";
import { HttpFunctionsOptions } from "../lib/src/functions_base";
import { firestoreLoader } from "../lib/src/firebase_loader";

/**
 * Define the process for PUSH notification.
 * 
 * PUSH通知を行うための処理を定義します。
 * 
 * @param title
 * The title of the notice should be listed.
 * 
 * 通知タイトルを記載します。
 * 
 * @param body
 * The contents of the notice will be described.
 * 
 * 通知内容を記載します。
 * 
 * @param channel_id
 * Describe ChannelId for Android.
 * 
 * Android向けのChannelIdを記載します。
 * 
 * @param data
 * Specify the data to be placed on the notification.
 * 
 * 通知に乗せるデータを指定します。
 * 
 * @param badgeCount
 * Specifies the badge count of the notification.
 * 
 * 通知のバッジカウントを指定します。
 * 
 * @param sound
 * Specifies the sound of the notification.
 * 
 * 通知のサウンドを指定します。
 * 
 * @param targetToken
 * Specifies the FCM token.
 * 
 * FCMトークンを指定します。
 * 
 * @param targetTopic
 * Specifies the topic of the FCM.
 * 
 * FCMのトピックを指定します。
 * 
 * @param targetCollectionPath
 * Specifies the path of the collection to be notified.
 * 
 * 通知対象のコレクションのパスを指定します。
 * 
 * @param targetTokenField
 * Specifies the key of the field used to retrieve the token to be notified.
 * 
 * 通知対象のトークンを取得する際のフィールドのキーを指定します。
 * 
 * @param targetWheres
 * Specify the conditions for retrieving the collections to be notified.
 * 
 * 通知対象のコレクションを取得する際の条件を指定します。
 * 
 * @param targetConditions
 * Specify the conditions under which data is to be notified.
 * 
 * データを通知対象とする条件を指定します。
 * 
 * @param responseTokenList
 * Specifies whether to return the token list for debugging.
 * 
 * デバッグ用にトークンリストを返すかどうかを指定します。
 */
module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => functions.https.onCall(
    {
        region: options.region ?? regions,
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
        serviceAccount: options?.serviceAccount ?? undefined,
        enforceAppCheck: options.enforceAppCheck ?? undefined,
        consumeAppCheckToken: options.consumeAppCheckToken ?? undefined,
    },
    async (query) => {
        try {
            const results: any[] = [];
            const title = query.data.title as string | undefined | null;
            const body = query.data.body as string | undefined | null;
            const channelId = query.data.channel_id as string | undefined | null;
            const data = query.data.data as { [key: string]: any } | undefined;
            const sound = query.data.sound as string | undefined | null;
            const badgeCount = query.data.badgeCount as number | undefined | null;
            const targetToken = query.data.targetToken as string | string[] | undefined | null;
            const targetTopic = query.data.targetTopic as string | undefined | null;
            const targetCollectionPath = query.data.targetCollectionPath as string | undefined | null;
            const targetTokenField = query.data.targetTokenField as string | { [key: string]: any } | undefined | null;
            const targetWheres = query.data.targetWheres as { [key: string]: any }[] | undefined;
            const targetConditions = query.data.targetConditions as { [key: string]: any }[] | undefined;
            const responseTokenList = query.data.responseTokenList as boolean | undefined;
            if (!title || !body) {
                throw new functions.https.HttpsError("invalid-argument", "Query parameter is invalid.");
            }
            let error: any | null = null;
            const firestoreDatabaseIds = options.firestoreDatabaseIds ?? [""];
            for (const databaseId of firestoreDatabaseIds) {
                try {
                    const firestoreInstance = firestoreLoader(databaseId);
                    const resItem = await sendNotification({
                        title: title,
                        body: body,
                        channelId: channelId,
                        data: data,
                        badgeCount: badgeCount,
                        sound: sound,
                        targetToken: targetToken,
                        targetTopic: targetTopic,
                        targetCollectionPath: targetCollectionPath,
                        targetTokenField: targetTokenField,
                        targetWheres: targetWheres,
                        targetConditions: targetConditions,
                        responseTokenList: responseTokenList,
                        firestoreInstance: firestoreInstance,
                    });
                    if (resItem.results) {
                        // 配列かどうかを確認してから反復処理
                        if (Array.isArray(resItem.results)) {
                            for (const result of resItem.results) {
                                results.push(result);
                            }
                        } else if (typeof resItem.results === "object") {
                            // オブジェクトの場合は、値を配列に追加
                            results.push(resItem.results);
                        } else {
                            // その他の型（文字列など）の場合
                            results.push(resItem.results);
                        }
                    }
                } catch (err) {
                    error = err;
                }
            }
            if (error) {
                console.error(error);
                throw new functions.https.HttpsError("unknown", "Unknown error.");
            }
            return {
                success: true,
                results: results,
            };
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
);
