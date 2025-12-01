import * as functions from "firebase-functions/v2";
import { SchedulerFunctionsOptions, firestoreLoader, ModelFieldValue } from "@mathrunet/masamune";
import { Task, Action } from "../lib/interfaces";
import * as admin from "firebase-admin";

const _kCollectionLimit = 100;

/**
 * A function for cleaning up tasks.
 * 
 * TaskをクリーンアップするためのFunction。
 */
module.exports = (
    regions: string[],
    options: SchedulerFunctionsOptions,
    data: { [key: string]: any }
) => functions.scheduler.onSchedule(
    {
        schedule: options.schedule ?? "every 1 hours",
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
            for (const databaseId of firestoreDatabaseIds) {
                try {
                    const now = new Date();
                    const firestoreInstance = firestoreLoader(databaseId);
                    const taskCollection = await firestoreInstance.collection("plugins/workflow/task").where("status", "==", "running").where("updatedTime", "<", new Date(now.getTime() - 1000 * 60 * 60 * 24)).orderBy("updatedTime", "asc").limit(_kCollectionLimit).get();
                    const actionsCollection = firestoreInstance.collection("plugins/workflow/action");
                    const promies: Promise<any>[] = [];
                    for (var task of taskCollection.docs) {
                        const data = task.data() as Task;
                        const status = data.status;
                        if (status !== "running") {
                            continue;
                        }
                        const updatedTaskData: Task = {
                            ...data,
                            "@time": now,
                            "status": "failed",
                            "currentAction": admin.firestore.FieldValue.delete(),
                            "nextAction": admin.firestore.FieldValue.delete(),
                            "error": {
                                status: 500,
                                "message": "Task timed out",
                            },
                            ...ModelFieldValue.modelTimestamp({
                                key: "updatedTime",
                                date: now,
                            }),
                        };
                        promies.push(
                            task.ref.set(
                                updatedTaskData, { merge: true }
                            )
                        );
                        const actions = await firestoreInstance.collection("plugins/workflow/action").where("task", "==", task.ref).get();
                        for (var action of actions.docs) {
                            const actionData = action.data() as Action;
                            const status = actionData.status;
                            if (status !== "running") {
                                continue;
                            }
                            const updatedActionData: Action = {
                                ...actionData,
                                "@time": now,
                                "status": "failed",
                                "error": {
                                    status: 500,
                                    "message": "Task timed out",
                                },
                                ...ModelFieldValue.modelTimestamp({
                                    key: "updatedTime",
                                    date: now,
                                }),
                            };
                            promies.push(
                                action.ref.set(
                                    updatedActionData, { merge: true }
                                )
                            );
                        }
                    }
                    await Promise.all(promies);
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
