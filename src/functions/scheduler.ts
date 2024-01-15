import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { sendNotification } from "../lib/send_notification";
import { FunctionsOptions, SchedulerFunctionsOptions } from "../lib/functions_base";

/**
 * Define a process for notifications while scaling to monitor the DB and register future PUSH notifications and data.
 * 
 * DBを監視し未来のPUSH通知やデータの登録をするスケーリングしながら通知を行うための処理を定義します。
 * 
 * @param process.env.SCHEDULER_COLLECTION_PATH
 * Specify the path of the collection to be monitored.
 * 
 * 監視するコレクションのパスを指定します。
 */
module.exports = (
    regions: string[],
    options: SchedulerFunctionsOptions,
    data: { [key: string]: string }
) => functions.scheduler.onSchedule(
    {
        schedule: options.schedule ?? "every 1 minutes",
        region: regions[0],
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances ?? undefined,
    },
    async (event) => {
        try {
            const collectionPath = process.env.SCHEDULER_COLLECTION_PATH ?? "schedule";
            const firestoreInstance = admin.firestore();
            const collection = await firestoreInstance.collection(collectionPath).where("_done", "==", false).where("_time", "<=", Date.now()).orderBy("_time", "asc").get();
            for (var doc of collection.docs) {
                let res: { [key: string]: any } | null = null;
                const command = (doc.get("#command") as { [key: string]: any })["@command"];
                const priParams = (doc.get("#command") as { [key: string]: any })["@private"] as { [key: string]: any };
                switch (command) {
                    case "notification":
                        const title = priParams["title"] as string;
                        const body = priParams["text"] as string;
                        const channelId = priParams["channel"] as string | undefined | null;
                        const data = priParams["data"] as { [key: string]: any } | undefined;
                        const token = priParams["token"] as string | string[] | undefined | null;
                        const topic = priParams["topic"] as string | undefined | null;
                        const response = await sendNotification({
                            title: title,
                            body: body,
                            channelId: channelId,
                            data: data,
                            token: token,
                            topic: topic,
                        });
                        res = response.results as { [key: string]: any } | null;
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
                if (res !== null && Object.keys(res).length > 0) {
                    await doc.ref.set({
                        "_done": true,
                        ...res,
                    }, {
                        merge: true
                    });
                } else {
                    await doc.ref.set({
                        "_done": true,
                    }, {
                        merge: true
                    });
                }
            }
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
);
