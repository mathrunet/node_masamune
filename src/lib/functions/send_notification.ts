import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import * as firestore from "./firestore";
import { splitArray } from "../utils";

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
 * @param targetDocumentPath
 * Specifies the path of the document to be notified.
 * 
 * 通知対象のドキュメントのパスを指定します。
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
export async function sendNotification({
    title,
    body,
    data,
    channelId,
    badgeCount,
    sound,
    targetToken,
    targetTopic,
    targetCollectionPath,
    targetDocumentPath,
    targetTokenField,
    targetWheres,
    targetConditions,
    responseTokenList,
}: {
        title: string,
        body: string,
        channelId?: string | undefined | null,
        data?: { [key: string]: any } | undefined,
        badgeCount?: number | undefined | null,
        sound?: string | undefined | null,
        targetToken?: string | string[] | undefined | null,
        targetTopic?: string | undefined | null,
        targetCollectionPath?: string | undefined | null,
        targetDocumentPath?: string | undefined | null,
        targetTokenField?: string | { [key: string]: any } | undefined | null,
        targetWheres?: { [key: string]: any }[] | undefined,
        targetConditions?: { [key: string]: any }[] | undefined,
        responseTokenList?: boolean | undefined | null,
    }) : Promise<{ [key: string]: any }> {
    const res: { [key: string]: any } = {};
    try {
        if ((targetToken === undefined || targetToken === null) && (targetTopic === undefined || targetTopic === null) && (targetCollectionPath === undefined || targetCollectionPath === null) && (targetDocumentPath === undefined || targetDocumentPath === null)) {
            throw new functions.https.HttpsError("invalid-argument", "Either [token] or [topic], [targetCollectionPath], [targetDocumentPath] must be specified.");
        }
        if (targetToken !== undefined && targetToken !== null) {
            if (typeof targetToken === "string") {
                targetToken = [targetToken];
            }
            const tokenList = splitArray([...new Set(targetToken)], 500);
            if (responseTokenList) {
                return {
                    success: true,
                    results: tokenList,
                };
            }
            for (let t in tokenList) {
                try {
                    const messageId = await admin.messaging().sendEachForMulticast(
                        {
                            notification: {
                                title: title,
                                body: body,
                            },
                            android: {
                                priority: "high",
                                notification: {
                                    title: title,
                                    body: body,
                                    clickAction: "FLUTTER_NOTIFICATION_CLICK",
                                    channelId: channelId ?? undefined,
                                    sound: sound ?? undefined,
                                },
                            },
                            apns: {
                                payload: {
                                    aps: {
                                        sound: sound ?? undefined,
                                        badge: badgeCount ?? undefined,
                                    },
                                }
                            },
                            data: data,
                            tokens: tokenList[t],
                        }
                    );
                    res[t] = messageId;
                } catch (e) {
                    console.log(e);
                    console.log({
                        notification: {
                            title: title,
                            body: body,
                        },
                        android: {
                            priority: "high",
                            notification: {
                                title: title,
                                body: body,
                                clickAction: "FLUTTER_NOTIFICATION_CLICK",
                                channelId: channelId ?? undefined,
                                sound: sound ?? undefined,
                            },
                        },
                        apns: {
                            payload: {
                                aps: {
                                    sound: sound ?? undefined,
                                    badge: badgeCount ?? undefined,
                                },
                            }
                        },
                        data: data,
                        tokens: tokenList[t],
                    });
                }
            }
            return {
                success: true,
                results: res,
            };
        } else if (targetTopic !== undefined && targetTopic !== null) {
            if (responseTokenList) {
                return {
                    success: true,
                    results: targetTopic,
                };
            }
            try {
                const messageId = await admin.messaging().send(
                    {
                        notification: {
                            title: title,
                            body: body,
                        },
                        android: {
                            priority: "high",
                            notification: {
                                title: title,
                                body: body,
                                clickAction: "FLUTTER_NOTIFICATION_CLICK",
                                channelId: channelId ?? undefined,
                            },
                        },
                        data: data,
                        topic: targetTopic,
                    }
                );
                res[targetTopic] = messageId;
            } catch (e) {
                console.log(e);
                console.log({
                    notification: {
                        title: title,
                        body: body,
                    },
                    android: {
                        priority: "high",
                        notification: {
                            title: title,
                            body: body,
                            clickAction: "FLUTTER_NOTIFICATION_CLICK",
                            channelId: channelId ?? undefined,
                        },
                    },
                    data: data,
                    topic: targetTopic,
                });
            }
            return {
                success: true,
                results: res,
            };
        } else if (targetCollectionPath !== undefined && targetCollectionPath !== null && targetTokenField != undefined && targetTokenField !== null) {
            const firestoreInstance = admin.firestore();
            const collectionRef = firestore.where({
                query: firestoreInstance.collection(targetCollectionPath),
                wheres: targetWheres,
            });
            const results: any[] = [];
            const tokens: string[] = [];
            let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
            let collection: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData> | null = null;
            do {
                collection = await firestore.cursor({ query: collectionRef, limit: 500, cursor: cursor }).get();
                for (let doc of collection.docs) {
                    const docData = doc.data();
                    if (!await firestore.hasMatch({ data: docData, conditions: targetConditions })) {
                        continue;
                    }                  
                    const token = await firestore.get({ data: docData, field: targetTokenField });
                    if (typeof token === "string") {
                        tokens.push(token);
                    } else if (Array.isArray(token)) {
                        tokens.push(...token);
                    }
                }
                const res = await sendNotification({
                    title: title,
                    body: body,
                    data: data,
                    channelId: channelId,
                    badgeCount: badgeCount,
                    sound: sound,
                    responseTokenList: responseTokenList,
                    targetToken: tokens,
                });
                results.push(res.results ?? []);
                if (collection.docs.length < 500) {
                    break;
                }
                cursor = collection.docs[collection.docs.length - 1];
            } while (collection.docs.length >= 500);
            if (responseTokenList) {
                return {
                    success: true,
                    results: results,
                };
            }
        } else if (targetDocumentPath !== undefined && targetDocumentPath !== null && targetTokenField != undefined && targetTokenField !== null) {
            const firestoreInstance = admin.firestore();
            const documentRef = firestoreInstance.doc(targetDocumentPath);
            const results: any[] = [];
            const doc = await documentRef.get();
            const docData = doc.data();
            if (docData) {
                if (await firestore.hasMatch({ data: docData, conditions: targetConditions })) {
                    const token = await firestore.get({ data: docData, field: targetTokenField });
                    const tokens: string[] = [];
                    if (typeof token === "string") {
                        tokens.push(token);
                    } else if (Array.isArray(token)) {
                        tokens.push(...token);
                    }
                    const res = await sendNotification({
                        title: title,
                        body: body,
                        data: data,
                        channelId: channelId,
                        badgeCount: badgeCount,
                        sound: sound,
                        responseTokenList: responseTokenList,
                        targetToken: tokens,
                    });
                    results.push(res.results ?? []);
                }
            }
            if (responseTokenList) {
                return {
                    success: true,
                    results: results,
                };
            }
        }
    } catch (err) {
        throw err;
    }
    return {
        success: true,
        results: res,
    };
}