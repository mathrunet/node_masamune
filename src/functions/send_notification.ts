import * as functions from "firebase-functions";
import { sendNotification } from "../lib/send_notification";

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
module.exports = (regions: string[], timeoutSeconds: number, data: { [key: string]: string }) => functions.runWith({timeoutSeconds: timeoutSeconds}).region(...regions).https.onCall(
    async (query) => {
        try {
            const title = query.title as string;
            const body = query.body as string;
            const channelId = query.channel_id as string | undefined | null;
            const data = query.data as { [key: string]: string } | undefined;
            const token = query.token as string | string[] | undefined | null;
            const topic = query.topic as string | undefined | null;
            const res = await sendNotification({
                title: title,
                body: body,
                channelId: channelId,
                data: data,
                token: token,
                topic: topic,
            });
            return res;
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
);
