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
            const collection = await firestoreInstance.collection(collectionPath).where("_done", "==", false).where("_time", "<=", Date.now()).orderBy("_time", "asc").get();
            for (var doc of collection.docs) {
                const command = (doc.get("#command") as { [key: string]: any })["@command"];
                const priParams = (doc.get("#command") as { [key: string]: any })["@private"] as { [key: string]: any };
                switch (command) {
                    case "notification":
                        const title = priParams["title"] as string;
                        const body = priParams["text"] as string;
                        const channelId = priParams["channel"] as string | undefined | null;
                        const data = priParams["data"] as { [key: string]: any } | undefined;
                        const token = priParams["token"] as string | undefined | null;
                        const topic = priParams["topic"] as string | undefined | null;
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
                        const path = priParams["path"] as string;
                        const paths = path.split("/");
                        const id = paths[paths.length - 1];
                        const docData = doc.data();
                        const docKeys = Object.keys(docData);
                        const update: { [key: string]: any } = {};
                        for (const key of docKeys) {
                            if (key.startsWith("_") || key == "command" || key == "#command" || key == "@uid") { 
                                continue;
                            }
                            update[key] = docData[key];
                        }
                        update["@uid"] = id;
                        await firestoreInstance.doc(path).set(
                            update, {
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
