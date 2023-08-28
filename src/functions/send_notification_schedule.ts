import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { sendNotification } from "../lib/send_notification";

/**
 * Define a process for monitoring the DB and registering future PUSH notifications and scaling notifications.
 * 
 * DBを監視し未来のPUSH通知を登録してスケーリングしながら通知を行うための処理を定義します。
 * 
 * @param notification.collection_path
 * Specify the path of the collection to monitor for notifications.
 * 
 * 通知を監視するコレクションのパスを指定します。
 */
module.exports = (regions: string[], data: { [key: string]: string }) => functions.region(...regions).pubsub.schedule(data["schedule"] ?? "every 1 minutes").onRun(
    async (event) => {
        try {
            const collectionPath = functions.config().notification.collection_path;
            const firestoreInstance = admin.firestore();
            const collection = await firestoreInstance.collection(collectionPath).where("sent", "==", false).where("time", "<=", admin.firestore.Timestamp.now()).orderBy("time", "asc") .get();
            for (var doc of collection.docs) {
                const title = doc.get("name") as string;
                const body = doc.get("text") as string;
                const channelId = doc.get("channel") as string | undefined;
                const data = doc.get("data") as { [key: string]: string } | undefined;
                const token = doc.get("token") as string | undefined;
                const topic = doc.get("topic") as string | undefined;
                await sendNotification({
                    title: title,
                    body: body,
                    channelId: channelId,
                    data: data,
                    token: token,
                    topic: topic,
                });
                await doc.ref.set({
                    sent: true,
                }, {
                    merge: true
                });
            }
        } catch (err) {
            console.log(err);
            throw err;
        }
        return {
            success: true,
        };
    }
);
