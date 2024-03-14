import * as functions from "firebase-functions/v2";
import { sendNotification } from "../lib/send_notification";
import { HttpFunctionsOptions } from "../lib/functions_base";

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
 */
module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: string }
) => functions.https.onCall(
    {
        region: options.region ?? regions,
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
    },
    async (query) => {
        try {
            const title = query.data.title as string | undefined | null;
            const body = query.data.body as string | undefined | null;
            const channelId = query.data.channel_id as string | undefined | null;
            const data = query.data.data as { [key: string]: string } | undefined;
            const token = query.data.token as string | string[] | undefined | null;
            const topic = query.data.topic as string | undefined | null;
            const sound = query.data.sound as string | undefined | null;
            const badgeCount = query.data.badgeCount as number | undefined | null;
            if (!title || !body) {
                throw new functions.https.HttpsError("invalid-argument", "Query parameter is invalid.");
            }
            const res = await sendNotification({
                title: title,
                body: body,
                channelId: channelId,
                data: data,
                token: token,
                topic: topic,
                badgeCount: badgeCount,
                sound: sound,
            });
            return res;
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
);
