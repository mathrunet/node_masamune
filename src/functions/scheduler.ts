import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { sendNotification } from "../lib/send_notification";

/**
 * Define a process for notifications while scaling to monitor the DB and register future PUSH notifications and data.
 * 
 * DBを監視し未来のPUSH通知やデータの登録をするスケーリングしながら通知を行うための処理を定義します。
 * 
 * @param scheduler.collection_path
 * Specify the path of the collection to be monitored.
 * 
 * 監視するコレクションのパスを指定します。
 */
module.exports = (regions: string[], data: { [key: string]: string }) => functions.region(...regions).pubsub.schedule(data["schedule"] ?? "every 1 minutes").onRun(
    async (event) => {
        try {
            const collectionPath = functions.config().scheduler.collection_path;
            const firestoreInstance = admin.firestore();
            const collection = await firestoreInstance.collection(collectionPath).where("@sent", "!=", true).where("time", "<=", admin.firestore.Timestamp.now()).orderBy("time", "asc").get();
            for (var doc of collection.docs) {
                const [_, command] = doc.id.split(":");
                switch (command) {
                    case "notification":
                        const title = doc.get("title") as string;
                        const body = doc.get("text") as string;
                        const channelId = doc.get("channel") as string | undefined;
                        const data = doc.get("data") as { [key: string]: any } | undefined;
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
                        break;
                    case "model":
                        const path = doc.get("path") as string;
                        const id = path.split("/")[path.length - 1];
                        await firestoreInstance.doc(path).set(
                            {
                                ...doc.data().where((key: string, _: any) => {
                                    return !key.startsWith("@") && key != "path";
                                }),
                                "@uid": id,
                            },
                        );
                        break;
                }
                await doc.ref.set({
                    "@sent": true,
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
