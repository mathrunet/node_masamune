import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { SchedulerFunctionsOptions } from "../lib/src/functions_base";
import { notification } from "../lib/schedulers/notification";
import { copyDocument } from "../lib/schedulers/copy_document";
import { deleteDocuments } from "../lib/schedulers/delete_documents";

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
    },
    async (event) => {
        try {
            const collectionPath = process.env.SCHEDULER_COLLECTION_PATH ?? data["path"] ?? "schedule";
            const firestoreInstance = admin.firestore();
            console.log(`Time: ${Date.now()}`);
            const collection = await firestoreInstance.collection(collectionPath).where("_done", "==", false).where("_time", "<=", Date.now()).orderBy("_time", "asc").get();
            console.log(`Length: ${collection.size}`);
            for (var doc of collection.docs) {
                console.log(`Doc: ${doc.id} ${doc.data()}`);
                let res: { [key: string]: any } = {};
                const command = (doc.get("#command") as { [key: string]: any })["@command"];
                const priParams = (doc.get("#command") as { [key: string]: any })["@private"] as { [key: string]: any };
                console.log(`Command: ${command}`);
                switch (command) {
                    case "notification": {
                        res = await notification({
                            params: priParams,
                            firestore: firestoreInstance,
                            doc: doc,
                        });
                        break;
                    }
                    case "copy_document": {
                        res = await copyDocument({
                            params: priParams,
                            firestore: firestoreInstance,
                            doc: doc,
                        });
                        break;
                    }
                    case "delete_documents":
                        res = await deleteDocuments({
                            params: priParams,
                            firestore: firestoreInstance,
                            doc: doc,
                        });
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
