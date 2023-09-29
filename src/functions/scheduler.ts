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
            const collection = await firestoreInstance.collection(collectionPath).where("_done", "==", null).where("_command", "<=", Date.now()).orderBy("_command", "asc").get();
            for (var doc of collection.docs) {
                const command = (doc.get("#command") as { [key: string]: any })["@command"];
                const params = (doc.get("#command") as { [key: string]: any })["@params"] as { [key: string]: any };
                switch (command) {
                    case "notification":
                        const title = params.get("title") as string;
                        const body = params.get("text") as string;
                        const channelId = params.get("channel") as string | undefined;
                        const data = params.get("data") as { [key: string]: any } | undefined;
                        const token = params.get("token") as string | undefined;
                        const topic = params.get("topic") as string | undefined;
                        await sendNotification({
                            title: title,
                            body: body,
                            channelId: channelId,
                            data: data,
                            token: token,
                            topic: topic,
                        });
                        break;
                    case "copy_document":
                        const path = params.get("path") as string;
                        const id = path.split("/")[path.length - 1];
                        await firestoreInstance.doc(path).set(
                            {
                                ...doc.data().where((key: string, _: any) => {
                                    return !key.startsWith("_") && key != "command" && key != "#command" && key != "@uid";
                                }),
                                "@uid": id,
                            }, {
                                merge: true
                            }
                        );
                        break;
                }
                await doc.ref.set({
                    "_done": true,
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
