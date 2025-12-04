import * as functions from "firebase-functions/v2";
import { SchedulerFunctionsOptions, firestoreLoader, utils, ModelTimestamp } from "@mathrunet/masamune";
import { Workflow } from "../lib/interfaces";
import * as admin from "firebase-admin";
import "@mathrunet/masamune";

const _kCollectionLimit = 100;

/**
 * A function for managing workflow schedules.
 * 
 * Workflowのスケジュールを管理するためのFunction。
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
                    const workflowCollection = await firestoreInstance.collection("plugins/workflow/workflow").where("nextTime", "<=", new Date()).orderBy("nextTime", "asc").limit(_kCollectionLimit).load();
                    const taskCollection = firestoreInstance.collection("plugins/workflow/task");
                    const promies: Promise<any>[] = [];
                    for (var doc of workflowCollection.docs) {
                        const data = doc.data() as Workflow;
                        const repeat = data.repeat;
                        const project = data.project;
                        const organization = data.organization;
                        const actions = data.actions;
                        if (actions.length <= 0) { 
                            const updatedWorkflowData: Workflow = {
                                ...data,
                                "@time": now,
                                "nextTime": admin.firestore.FieldValue.delete(),
                                "updatedTime": new ModelTimestamp(now),
                            };
                            promies.push(
                                doc.ref.save(
                                    updatedWorkflowData, { merge: true }
                                )
                            );
                            continue;
                        }
                        const taskId = utils.uuid();
                        const task = taskCollection.doc(taskId);
                        const nextAction = data.actions[0];
                        promies.push(
                            task.save(
                                {
                                    "@uid": taskId,
                                    "@time": now,
                                    "workflow": doc.ref,
                                    "organization": organization,
                                    "project": project,
                                    "status": "waiting",
                                    "actions": actions,
                                    "nextAction": nextAction,
                                    "prompt": data.prompt,
                                    "materials": data.materials,
                                    "usage": 0,
                                    "startTime": new ModelTimestamp(now),
                                    "createdTime": new ModelTimestamp(now),
                                    "updatedTime": new ModelTimestamp(now),
                                }, { merge: true }
                            )
                        );
                        switch (repeat) { 
                            case "daily": {
                                const updatedWorkflowData: Workflow = {
                                    ...data,
                                    "@time": now,
                                    "nextTime": new ModelTimestamp(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
                                    "updatedTime": new ModelTimestamp(now),
                                };
                                promies.push(
                                    doc.ref.save(
                                        updatedWorkflowData, { merge: true }
                                    )
                                );
                                break;
                            }
                            case "weekly": {
                                const updatedWorkflowData: Workflow = {
                                    ...data,
                                    "@time": now,
                                    "nextTime": new ModelTimestamp(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
                                    "updatedTime": new ModelTimestamp(now),
                                };
                                promies.push(
                                    doc.ref.save(
                                        updatedWorkflowData, { merge: true }
                                    )
                                );
                                break;
                            }
                            case "monthly": {
                                let date = now.getDate();
                                if (date > 28) {
                                    date = 28;
                                }
                                const updatedWorkflowData: Workflow = {
                                    ...data,
                                    "@time": now,
                                    "nextTime": new ModelTimestamp(new Date(now.getFullYear(), now.getMonth() + 1, date, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())),
                                    "updatedTime": new ModelTimestamp(now),
                                };
                                promies.push(
                                    doc.ref.save(
                                        updatedWorkflowData, { merge: true }
                                    )
                                );
                                break;
                            }
                            default: {
                                const updatedWorkflowData: Workflow = {
                                    ...data,
                                    "@time": now,
                                    "nextTime": admin.firestore.FieldValue.delete(),
                                    "updatedTime": new ModelTimestamp(now),
                                };
                                promies.push(
                                    doc.ref.save(
                                        updatedWorkflowData, { merge: true }
                                    )
                                );
                                break;
                            }
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
