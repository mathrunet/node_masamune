import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

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
 */
export async function sendNotification({
    title,
    body,
    data,
    channelId,
    token,
    topic,
}:  {
    title: string,
    body: string,
    channelId: string | undefined | null,
    data: { [key: string]: string } | undefined,
    token: string | string[] | undefined | null,
    topic: string | undefined | null,
    }) : Promise<{ [key: string]: any }> {
    const res: { [key: string]: any } = {};
    try {
        if ((token === undefined || token === null) && (topic === undefined || topic === null)) {
            throw new functions.https.HttpsError("invalid-argument", "Either [token] or [topic] must be specified.");
        }
        if (token !== undefined && token !== null) {
            if (typeof token === "string") {
                token = [token];
            }
            for (let t of token) {
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
                    token: t,
                });
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
                        token: t,
                    }
                );
                res[t] = messageId;
            }
            return {
                success: true,
                results: res,
            };
        } else if (topic !== undefined && topic !== null) {
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
            return {
                success: true,
                results: res,
            };
        }
    } catch (err) {
        throw err;
    }
    return {
        success: true,
        results: res,
    };
    
}