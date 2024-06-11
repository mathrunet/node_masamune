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
 * @param token
 * Specifies the FCM token.
 * 
 * FCMトークンを指定します。
 * 
 * @param topic
 * Specifies the topic of the FCM.
 * 
 * FCMのトピックを指定します。
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
 * @param targetCollectionPath
 * Specifies the path of the collection to be notified.
 * 
 * 通知対象のコレクションのパスを指定します。
 * 
 * @param targetTokenFieldKey
 * Specifies the key of the field used to retrieve the token to be notified.
 * 
 * 通知対象のトークンを取得する際のフィールドのキーを指定します。
 * 
 * @param targetWhere
 * Specify the conditions for retrieving the collections to be notified.
 * 
 * 通知対象のコレクションを取得する際の条件を指定します。
 * 
 * @param targetConditions
 * Specify the conditions under which data is to be notified.
 * 
 * データを通知対象とする条件を指定します。
 */
export async function sendNotification({
    title,
    body,
    data,
    channelId,
    token,
    topic,
    badgeCount,
    sound,
    targetCollectionPath,
    targetTokenFieldKey,
    targetWhere,
    targetConditions,
}:  {
        title: string,
        body: string,
        channelId?: string | undefined | null,
        data?: { [key: string]: string } | undefined,
        token?: string | string[] | undefined | null,
        topic?: string | undefined | null,
        badgeCount?: number | undefined | null,
        sound?: string | undefined | null,
        targetCollectionPath?: string | undefined | null,
        targetTokenFieldKey?: string | undefined | null,
        targetWhere?: { [key: string]: string }[] | undefined,
        targetConditions?: { [key: string]: string }[] | undefined,
    }) : Promise<{ [key: string]: any }> {
    const res: { [key: string]: any } = {};
    try {
        if ((token === undefined || token === null) && (topic === undefined || topic === null) && (targetCollectionPath === undefined || targetCollectionPath === null)) {
            throw new functions.https.HttpsError("invalid-argument", "Either [token] or [topic], [targetCollectionPath] must be specified.");
        }
        if (token !== undefined && token !== null) {
            if (typeof token === "string") {
                token = [token];
            }
            const tokenList = splitArray([...new Set(token)], 450);
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
        } else if (topic !== undefined && topic !== null) {
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
                        topic: topic,
                    }
                );
                res[topic] = messageId;
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
                    topic: topic,
                });
            }
            return {
                success: true,
                results: res,
            };
        } else if (targetCollectionPath !== undefined && targetCollectionPath !== null && targetTokenFieldKey != undefined && targetTokenFieldKey !== null) {
            const firestoreInstance = admin.firestore();
            const collectionRef = firestore.where({
                query: firestoreInstance.collection(targetCollectionPath),
                wheres: targetWhere,
            });
            const tokens: string[] = [];
            const collection = await collectionRef.get();
            for (let doc of collection.docs) {
                const data = doc.data();
                if (!await firestore.hasMatch({ data, conditions: targetConditions })) {
                    continue;
                }
                const token = data[targetTokenFieldKey];
                if (typeof token === "string") {
                    tokens.push(token);
                } else if (Array.isArray(token)) {
                    tokens.push(...token);
                }
            }
            await sendNotification({
                title: title,
                body: body,
                data: data,
                channelId: channelId,
                token: tokens,
                badgeCount: badgeCount,
                sound: sound,
            });
        }
    } catch (err) {
        throw err;
    }
    return {
        success: true,
        results: res,
    };
}