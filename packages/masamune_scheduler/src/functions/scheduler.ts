import * as functions from "firebase-functions/v2";
import { notification } from "../schedulers/notification";
import { copyDocument } from "../schedulers/copy_document";
import { deleteDocuments } from "../schedulers/delete_documents";
import { SchedulerFunctionsOptions, firestoreLoader } from "@mathrunet/masamune";
import "@mathrunet/masamune";

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
    data: { [key: string]: any }
) => functions.scheduler.onSchedule(
    {
        schedule: options.schedule ?? "every 1 minutes",
        region: options.region ?? regions[0],
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
        serviceAccount: options.serviceAccount ?? undefined,
    },
    async (event) => {
        try {
            let error: any | null = null;
            const firestoreDatabaseIds = options.firestoreDatabaseIds ?? [""];
            const collectionPath = process.env.SCHEDULER_COLLECTION_PATH ?? data["path"] ?? "schedule";
            for (const databaseId of firestoreDatabaseIds) {
                try {
                    const firestoreInstance = firestoreLoader(databaseId);
                    console.log(`Time: ${Date.now()} @${collectionPath}`);
                    const collection = await firestoreInstance.collection(collectionPath).where("_done", "==", false).where("_time", "<=", Date.now()).orderBy("_time", "asc").load();
                    console.log(`Length: ${collection.size}`);
                    for (var doc of collection.docs) {
                        console.log(`Doc: ${doc.id} ${JSON.stringify(doc.data())}`);
                        let res: { [key: string]: any } = {};
                        const command = (doc.get("#command") as { [key: string]: any })["@command"];
                        const priParams = (doc.get("#command") as { [key: string]: any })["@private"] as { [key: string]: any };
                        console.log(`Command: ${command}`);
                        switch (command) {
                            case "notification": {
                                res = await notification({
                                    params: priParams,
                                    firestoreInstance: firestoreInstance,
                                    doc: doc,
                                });
                                break;
                            }
                            case "copy_document": {
                                res = await copyDocument({
                                    params: priParams,
                                    firestoreInstance: firestoreInstance,
                                    doc: doc,
                                });
                                break;
                            }
                            case "delete_documents":
                                res = await deleteDocuments({
                                    params: priParams,
                                    firestoreInstance: firestoreInstance,
                                    doc: doc,
                                });
                                break;
                        }
                        if (res !== null && Object.keys(res).length > 0) {
                            console.log(res);
                            await doc.ref.save({
                                "_done": true,
                                ...res,
                            }, {
                                merge: true
                            });
                        } else {
                            await doc.ref.save({
                                "_done": true,
                            }, {
                                merge: true
                            });
                        }
                    }
                } catch (err) {
                    error = err;
                }
            }
            if (error) {
                console.error(error);
                throw new functions.https.HttpsError("unknown", "Unknown error.");
            }
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
);
