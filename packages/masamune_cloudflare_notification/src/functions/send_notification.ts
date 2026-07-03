import { Context, Hono } from "hono";
import {
    HttpError,
    jsonError,
    ModelToken,
    parseGoogleServiceAccount,
} from "@mathrunet/masamune_cloudflare";
import { FcmClient } from "../lib/fcm";
import { sendNotification } from "../lib/send_notification";
import { NotificationWorkersOptions, resolveNotificationServiceAccount } from "../lib/options";

/**
 * Define the process for PUSH notification.
 *
 * PUSH通知を行うための処理を定義します。
 *
 * @param {string} GOOGLE_SERVICE_ACCOUNT
 * Service account JSON used to obtain FCM access tokens. Specify it in [options.serviceAccount] or the `GOOGLE_SERVICE_ACCOUNT` Workers secret.
 *
 * FCMのアクセストークンを取得するためのサービスアカウントJSON。[options.serviceAccount]または`GOOGLE_SERVICE_ACCOUNT`のWorkersシークレットで指定します。
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
 *
 * @param dryRun
 * If true, the message will be validated but not sent.
 *
 * trueの場合、メッセージは検証されますが送信されません。
 */
module.exports = (
    hono: Hono,
    options: NotificationWorkersOptions,
    data: { [key: string]: any },
) => {
    hono.post("/", async (context: Context) => {
        try {
            const query = await context.req.json() as { [key: string]: any };
            const results: any[] = [];
            const title = query.title as string | undefined | null;
            const body = query.body as string | undefined | null;
            const channelId = query.channel_id as string | undefined | null;
            const notificationData = query.data as { [key: string]: any } | undefined;
            const sound = query.sound as string | undefined | null;
            const badgeCount = query.badgeCount as number | undefined | null;
            const targetToken = query.targetToken as string | string[] | ModelToken | undefined | null;
            const targetTopic = query.targetTopic as string | undefined | null;
            const targetCollectionPath = query.targetCollectionPath as string | undefined | null;
            const targetDocumentPath = query.targetDocumentPath as string | undefined | null;
            const targetTokenField = query.targetTokenField as string | { [key: string]: any } | undefined | null;
            const targetWheres = query.targetWheres as { [key: string]: any }[] | undefined;
            const targetConditions = query.targetConditions as { [key: string]: any }[] | undefined;
            const responseTokenList = query.responseTokenList as boolean | undefined;
            const showLog = query.showLog as boolean | undefined;
            const dryRun = query.dryRun as boolean | undefined;
            if (!title || !body) {
                throw new HttpError(400, "Query parameter is invalid.");
            }
            const serviceAccountJson = resolveNotificationServiceAccount(context, options);
            if (!serviceAccountJson) {
                throw new HttpError(500, "GOOGLE_SERVICE_ACCOUNT is not set.");
            }
            const fcm = new FcmClient({
                serviceAccount: parseGoogleServiceAccount(serviceAccountJson),
                projectId: options.projectId,
            });
            const resItem = await sendNotification({
                title: title,
                body: body,
                channelId: channelId,
                data: notificationData,
                badgeCount: badgeCount,
                sound: sound,
                targetToken: targetToken,
                targetTopic: targetTopic,
                targetCollectionPath: targetCollectionPath,
                targetDocumentPath: targetDocumentPath,
                targetTokenField: targetTokenField,
                targetWheres: targetWheres,
                targetConditions: targetConditions,
                responseTokenList: responseTokenList,
                fcm: fcm,
                database: options.database,
                showLog: showLog ?? false,
                dryRun: dryRun ?? false,
            });
            if (resItem.results) {
                if (Array.isArray(resItem.results)) {
                    for (const result of resItem.results) {
                        results.push(result);
                    }
                } else {
                    results.push(resItem.results);
                }
            }
            return context.json({
                success: true,
                results: results,
            });
        } catch (err) {
            return jsonError(context, err);
        }
    });
    return hono;
};
