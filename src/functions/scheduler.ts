import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { sendNotification } from "../lib/functions/send_notification";
import { SchedulerFunctionsOptions } from "../lib/src/functions_base";

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
        region: options.region ?? regions[0],
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
    },
    async (event) => {
        try {
            const collectionPath = process.env.SCHEDULER_COLLECTION_PATH ?? "schedule";
            const firestoreInstance = admin.firestore();
            console.log(`Time: ${Date.now()}`);
            const collection = await firestoreInstance.collection(collectionPath).where("_done", "==", false).where("_time", "<=", Date.now()).orderBy("_time", "asc").get();
            console.log(`Length: ${collection.size}`);
            for (var doc of collection.docs) {
                console.log(`Doc: ${doc.id} ${doc.data()}`);
                let res: { [key: string]: any } | null = null;
                const command = (doc.get("#command") as { [key: string]: any })["@command"];
                const priParams = (doc.get("#command") as { [key: string]: any })["@private"] as { [key: string]: any };
                console.log(`Command: ${command}`);
                switch (command) {
                    case "notification":
                        const title = priParams["title"] as string;
                        const body = priParams["text"] as string;
                        const channelId = priParams["channel"] as string | undefined | null;
                        const data = priParams["data"] as { [key: string]: any } | undefined;
                        const token = priParams["token"] as string | string[] | undefined | null;
                        const topic = priParams["topic"] as string | undefined | null;
                        const badgeCount = priParams["badgeCount"] as number | undefined | null;
                        const sound = priParams["sound"] as string | undefined | null;
                        const targetCollectionPath = priParams["targetCollectionPath"] as string | undefined | null;
                        const targetTokenFieldKey = priParams["targetTokenFieldKey"] as string | undefined | null;
                        const targetWhere = priParams["targetWhere"] as { [key: string]: string }[] | undefined;
                        const targetConditions = priParams["targetConditions"] as { [key: string]: string }[] | undefined;
                        const response = await sendNotification({
                            title: title,
                            body: body,
                            channelId: channelId,
                            data: data,
                            token: token,
                            topic: topic,
                            badgeCount: badgeCount,
                            sound: sound,
                            targetCollectionPath: targetCollectionPath,
                            targetTokenFieldKey: targetTokenFieldKey,
                            targetWhere: targetWhere,
                            targetConditions: targetConditions,
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
