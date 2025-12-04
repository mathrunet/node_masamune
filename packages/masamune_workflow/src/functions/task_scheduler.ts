import * as functions from "firebase-functions/v2";
import { SchedulerFunctionsOptions, firestoreLoader, ModelFieldValue, utils, ModelTimestamp } from "@mathrunet/masamune";
import { Task } from "../lib/interfaces";
import * as admin from "firebase-admin";
import * as adminFunctions from "firebase-admin/functions";
import * as crypto from "crypto";

const _kCollectionLimit = 100;

/**
 * A function for scheduling tasks.
 * 
 * TaskをスケジュールするためのFunction。
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
            for (const databaseId of firestoreDatabaseIds) {
                try {
                    const now = new Date();
                    const firestoreInstance = firestoreLoader(databaseId);
                    const taskCollection = await firestoreInstance.collection("plugins/workflow/task").where("status", "==", "waiting").orderBy("updatedTime", "asc").limit(_kCollectionLimit).load();
                    const actionsCollection = firestoreInstance.collection("plugins/workflow/action");
                    const promies: Promise<any>[] = [];
                    for (var task of taskCollection.docs) {
                        const data = task.data() as Task;
                        const status = data.status;
                        const project = data.project;
                        const organization = data.organization;
                        const workflow = data.workflow;
                        if (status !== "waiting") {
                            continue;
                        }
                        const nextAction = data.nextAction;
                        if (!nextAction || typeof nextAction !== "object" || !("command" in nextAction)) {
                            continue;
                        }
                        const actionId = utils.uuid();
                        const actionDoc = actionsCollection.doc(actionId);
                        const token = crypto.randomBytes(64).toString("hex");
                        const updatedActionData: any = {
                            "@uid": actionId,
                            "@time": now,
                            "command": nextAction,
                            "task": task.ref,
                            "workflow": data.workflow,
                            "organization": organization,
                            "project": project,
                            "status": "waiting",
                            "prompt": data.prompt,
                            "materials": data.materials,
                            "usage": 0,
                            "token": token,
                            "tokenExpiredTime": new Date(now.getTime() + 1000 * 60 * 60 * 1),
                            "startTime": new ModelTimestamp(now),
                            "createdTime": new ModelTimestamp(now),
                            "updatedTime": new ModelTimestamp(now),
                        };
                        promies.push(
                            actionDoc.save(
                                updatedActionData, { merge: true }
                            )
                        );
                        const updatedTaskData: Task = {
                            ...data,
                            "@time": now,
                            "status": "running",
                            "currentAction": actionDoc,
                            "nextAction": admin.firestore.FieldValue.delete(),
                            "updatedTime": new ModelTimestamp(now),
                        };
                        promies.push(
                            task.ref.save(
                                updatedTaskData, { merge: true }
                            )
                        );
                        const queue = adminFunctions.getFunctions().taskQueue(nextAction.command);
                        promies.push(
                            queue.enqueue({
                                path: `plugins/workflow/action/${actionId}`,
                                token: token,
                            }),
                        );
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
