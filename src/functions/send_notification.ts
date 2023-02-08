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
module.exports = (region: string) => functions.region(region).https.onCall(
    async (query) => {
        try {
            const title = query.title as string;
            const body = query.body as string;
            const channelId = query.channel_id as string | undefined;
            const data = query.data as { [key: string]: string } | undefined;
            const token = query.token as string | undefined;
            const topic = query.topic as string | undefined;
            if (token === undefined || topic === undefined) { 
                throw new functions.https.HttpsError("invalid-argument", "Either [token] or [topic] must be specified.");
            }
            const res = await admin.messaging().send(
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
                            channelId: channelId,
                        },
                    },
                    data: data,
                    token: token,
                    topic: topic,
                }
            );
            return {
                success: true,
                message_id: res,
            };
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
);
