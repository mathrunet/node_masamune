import * as functions from "firebase-functions/v2";
import { FunctionsBase, HttpFunctionsOptions, ModelFieldValue } from "@mathrunet/masamune";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { Action, ActionCommand, Task, Usage } from "./interfaces";
export { CallableRequest } from "firebase-functions/v2/https";

const _kDefaultCpuPrice = 0.000025 * 4.0; // 4CPU秒
const _kDefaultMemoryPrice = 0.0000025 * 1.0; // 1GB秒
const _kDefaultRequetPrice = 0.4 / 1000000.0 * 2; // 2リクエスト
const _kDefaultLoadPrice = 0.038 / 100000.0 * 6; // 6ロード
const _kDefaultSavePrice = 0.115 / 100000.0 * 8; // 8保存

/**
 * Base class for defining Function data for Workflow action execution.
 * 
 * Workflowのアクション実行用のFunctionのデータを定義するためのベースクラス。
 */
export abstract class WorkflowProcessFunctionBase extends FunctionsBase {
    /**
     * Base class for defining Function data for Workflow action execution.
     * 
     * Workflowのアクション実行用のFunctionのデータを定義するためのベースクラス。
     */
    constructor(options: HttpFunctionsOptions = {}) {
        super({ options: options });
    }

    /**
     * Specify the actual contents of the process.
     * 
     * 実際の処理の中身を指定します。
     * 
     * @param {any} query
     * Query passed to Functions.
     * 
     * Functionsに渡されたクエリ。
     * 
     * @returns {{ [key: string]: any }}
     * Return value of the process.
     * 
     * 処理の戻り値。
     */
    abstract process(action: Action): Promise<Action>;

    abstract id: string;
    data: { [key: string]: any } = {};
    build(regions: string[]): Function {
        const options = this.options as HttpFunctionsOptions | undefined | null;
        return functions.https.onCall(
            {
                region: options?.region ?? regions,
                timeoutSeconds: options?.timeoutSeconds,
                memory: options?.memory,
                minInstances: options?.minInstances,
                concurrency: options?.concurrency,
                maxInstances: options?.maxInstances,
                serviceAccount: options?.serviceAccount ?? undefined,
                enforceAppCheck: options?.enforceAppCheck ?? undefined,
                consumeAppCheckToken: options?.consumeAppCheckToken ?? undefined,
            },
            async (query) => {
                try {
                    const startedTime = new Date();
                    const path = query.data.path as string | undefined | null;
                    const token = query.data.token as string | undefined | null;
                    if (!path || !token) {
                        throw Error("invalid-argument");
                    }
                    const firestore = getFirestore();
                    const action = await firestore.doc(path).get();
                    if (!action.exists) {
                        throw Error("action-not-found");
                    }
                    const actionData = action.data() as Action | undefined | null;
                    const organization = actionData?.organization;
                    const organizationId = organization?.id;
                    const command = actionData?.command;
                    if (!actionData || !organization || !organizationId || !command) {
                        throw Error("action-not-found");
                    }
                    try {
                        const expiredTime = actionData.tokenExpiredTime;
                        if (!expiredTime || startedTime.getTime() > expiredTime.getTime()) {
                            throw Error("token-expired");
                        }
                        if (token !== actionData.token) {
                            throw Error("invalid-token");
                        }
                        // TODO: 利用量チェック
                        const result = await this.process(actionData);
                        const finishedTime = new Date();
                        const duration = (finishedTime.getTime() - startedTime.getTime()) / 1000.0;
                        const usage = _kDefaultLoadPrice + _kDefaultSavePrice + _kDefaultRequetPrice + duration * _kDefaultCpuPrice + duration * _kDefaultMemoryPrice;
                        const task = await actionData.task?.get();
                        if (!task || !task.exists) {
                            throw Error("task-not-found");
                        }
                        const taskData = task.data() as Task | undefined | null;
                        const actions = taskData?.actions;
                        const index = command.index;
                        if (!taskData || !actions) {
                            throw Error("task-not-found");
                        }
                        // キャンセルされた場合
                        if(taskData.status === "canceled"){
                            const updatedActionData: Action = {
                                ...actionData,
                                "@time": finishedTime,
                                status: "canceled",
                                usage: actionData.usage + usage,
                                ...ModelFieldValue.modelTimestamp({
                                    key: "updatedTime",
                                    date: finishedTime,
                                }),
                            };
                            await action.ref.set(
                                updatedActionData,
                                {merge: true}
                            );
                            const updatedTaskData: Task = {
                                ...taskData,
                                "@time": finishedTime,
                                currentAction: admin.firestore.FieldValue.delete(),
                                nextAction: command,
                                usage: taskData.usage + usage,
                                status: "canceled",
                                ...ModelFieldValue.modelTimestamp({
                                    key: "updatedTime",
                                    date: finishedTime,
                                }),
                            };
                            await task.ref.set(
                                updatedTaskData,
                                { merge: true }
                            );
                            await this.updateUsage({
                                firestore: firestore,
                                finishedTime: finishedTime,
                                usage: usage,
                                organizationId: organizationId,
                            });
                        } else {
                            // 完了済み
                            if(index >= actions.length - 1){
                                const updatedActionData: Action = {
                                    ...actionData,
                                    ...result,
                                    "@time": finishedTime,
                                    status: "completed",
                                    usage: actionData.usage + result.usage + usage,
                                    ...ModelFieldValue.modelTimestamp({
                                        key: "finishedTime",
                                        date: finishedTime,
                                    }),
                                    ...ModelFieldValue.modelTimestamp({
                                        key: "updatedTime",
                                        date: finishedTime,
                                    }),
                                };
                                await action.ref.set(
                                    updatedActionData,
                                    {merge: true}
                                );
                                const updatedTaskData: Task = {
                                    ...taskData,
                                    "@time": finishedTime,
                                    currentAction: admin.firestore.FieldValue.delete(),
                                    nextAction: admin.firestore.FieldValue.delete(),
                                    usage: taskData.usage + result.usage + usage,
                                    status: "completed",
                                    results: {
                                        ...result.results,
                                        ...taskData.results,
                                    },
                                    assets: {
                                        ...result.assets,
                                        ...taskData.assets,
                                    },
                                    ...ModelFieldValue.modelTimestamp({
                                        key: "finishedTime",
                                        date: finishedTime,
                                    }),
                                    ...ModelFieldValue.modelTimestamp({
                                        key: "updatedTime",
                                        date: finishedTime,
                                    }),
                                };
                                await task.ref.set(
                                    updatedTaskData,
                                    { merge: true }
                                );
                                await this.updateUsage({
                                    firestore: firestore,
                                    finishedTime: finishedTime,
                                    usage: usage,
                                    organizationId: organizationId,
                                });
                            } else {
                                const nextCommand = actions[index + 1];
                                const updatedActionData: Action = {
                                    ...actionData,
                                    ...result,
                                    "@time": finishedTime,
                                    status: "completed",
                                    usage: actionData.usage + result.usage + usage,
                                    ...ModelFieldValue.modelTimestamp({
                                        key: "finishedTime",
                                        date: finishedTime,
                                    }),
                                    ...ModelFieldValue.modelTimestamp({
                                        key: "updatedTime",
                                        date: finishedTime,
                                    }),
                                };
                                await action.ref.set(
                                    updatedActionData,
                                    {merge: true}
                                );
                                const updatedTaskData: Task = {
                                    ...taskData,
                                    "@time": finishedTime,
                                    currentAction: admin.firestore.FieldValue.delete(),
                                    nextAction: nextCommand,
                                    usage: taskData.usage + result.usage + usage,
                                    status: "waiting",
                                    results: {
                                        ...result.results,
                                        ...taskData.results,
                                    },
                                    assets: {
                                        ...result.assets,
                                        ...taskData.assets,
                                    },
                                    ...ModelFieldValue.modelTimestamp({
                                        key: "finishedTime",
                                        date: finishedTime,
                                    }),
                                    ...ModelFieldValue.modelTimestamp({
                                        key: "updatedTime",
                                        date: finishedTime,
                                    }),
                                };
                                await task.ref.set(
                                    updatedTaskData,
                                    { merge: true }
                                );
                                await this.updateUsage({
                                    firestore: firestore,
                                    finishedTime: finishedTime,
                                    usage: usage,
                                    organizationId: organizationId,
                                });
                            }
                        }
                    } catch (err) {
                        let error: { [key: string]: any };
                        switch (err) {
                            case "token-expired":
                                error = {
                                    status: 403,
                                    message: err,
                                };
                                break;
                            case "invalid-token":
                                error = {
                                    status: 403,
                                    message: err,
                                };
                                break;
                            default:
                                error = {
                                    status: 500,
                                    message: err,
                                };
                                break;
                        }
                        const finishedTime = new Date();
                        const duration = (finishedTime.getTime() - startedTime.getTime()) / 1000.0;
                        const usage = _kDefaultLoadPrice + _kDefaultSavePrice + _kDefaultRequetPrice + duration * _kDefaultCpuPrice + duration * _kDefaultMemoryPrice;
                        try {
                            const task = await actionData.task?.get();
                            if (!task || !task.exists) {
                                throw Error("task-not-found");
                            }
                            const taskData = task.data() as Task | undefined | null;
                            if (!taskData) {
                                throw Error("task-not-found");
                            }
                            const updatedTaskData: Task = {
                                ...taskData,
                                "@time": finishedTime,
                                currentAction: admin.firestore.FieldValue.delete(),
                                nextAction: command,
                                usage: taskData.usage + usage,
                                status: "failed",
                                error: error,
                                ...ModelFieldValue.modelTimestamp({
                                    key: "updatedTime",
                                    date: finishedTime,
                                }),
                            };
                            await task.ref.set(
                                updatedTaskData,
                                { merge: true }
                            );
                        } catch (err) {
                            console.error(err);
                        }
                        try {
                            const updatedActionData: Action = {
                                ...actionData,
                                "@time": finishedTime,
                                status: "failed",
                                error: error,
                                usage: actionData.usage + usage,
                                ...ModelFieldValue.modelTimestamp({
                                    key: "updatedTime",
                                    date: finishedTime,
                                }),
                            };
                            await action.ref.set(
                                updatedActionData,
                                { merge: true }
                            );
                        } catch (err) {
                            console.error(err);
                        }
                        try {
                            const updatedActionData: Action = {
                                ...actionData,
                                "@time": finishedTime,
                                status: "failed",
                                error: error,
                                usage: actionData.usage + usage,
                                ...ModelFieldValue.modelTimestamp({
                                    key: "updatedTime",
                                    date: finishedTime,
                                }),
                            };
                            await action.ref.set(
                                updatedActionData,
                                {merge: true}
                            );
                        } catch (err) {
                            console.error(err);
                        }
                        await this.updateUsage({
                            firestore: firestore,
                            finishedTime: finishedTime,
                            usage: usage,
                            organizationId: organizationId,
                        });
                        console.error(JSON.stringify(error));
                        return error;
                    }
                } catch (err) {
                    let error: { [key: string]: any };
                    switch (err) {
                        case "invalid-argument":
                            error = {
                                status: 404,
                                message: err,
                            };
                            break;
                        case "action-not-found":
                            error = {
                                status: 404,
                                message: err,
                            };
                            break;
                        default:
                            error = {
                                status: 404,
                                message: err,
                            };
                            break;
                    }
                    console.error(JSON.stringify(error));
                    return error;
                }
            }
        );
    }

    private async updateUsage({
        firestore,
        finishedTime,
        usage,
        organizationId,
    }: {
        firestore: admin.firestore.Firestore,
        finishedTime: Date,
        usage: number,
        organizationId: string,
    }): Promise<void> {
        try {
            const year = finishedTime.getFullYear();
            const month = (finishedTime.getMonth() + 1).toString().padStart(2, '0');
            const dateId = `${year}${month}`;
            const usageDoc = await firestore.doc(`plugins/workflow/organization/${organizationId}/usage/${dateId}`).get();
            const usageData = usageDoc.data() as Usage | undefined | null;
            if (!usageData) {
                const updatedUsageData = {
                    "@uid": dateId,
                    "@time": finishedTime,
                    usage: usage,
                    ...ModelFieldValue.modelTimestamp({
                        key: "updatedTime",
                        date: finishedTime,
                    }),
                    ...ModelFieldValue.modelTimestamp({
                        key: "createdTime",
                        date: finishedTime,
                    }),
                };
                await usageDoc.ref.set(updatedUsageData, {merge: true});
            } else {
                const updatedUsageData = {
                    "@time": finishedTime,
                    usage: usageData.usage + usage,
                    ...ModelFieldValue.modelTimestamp({
                        key: "updatedTime",
                        date: finishedTime,
                    }),
                };
                await usageDoc.ref.set(updatedUsageData, {merge: true});
            }
        } catch (err) {
            console.error(err);
        }
    }
}



import * as functions from "firebase-functions";

import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

// 設定値

const MONTHLY_LIMIT = 10000; // 月間制限

const BURST_CAPACITY = MONTHLY_LIMIT * 0.05; // バースト許容量 (5%)

interface UsageCheckResult {

  allowed: boolean;

  retryAfterSeconds?: number;

  currentUsage: number;

}

export const checkUsageLimit = functions.https.onCall(async (data, context) => {

  if (!context.auth) {

    throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");

  }

  const userId = context.auth.uid;

  const requestedCost = data.cost || 1; 

  const userRef = db.collection("user_usage_limits").doc(userId);

  return db.runTransaction(async (transaction): Promise<UsageCheckResult> => {

    const doc = await transaction.get(userRef);

    const now = admin.firestore.Timestamp.now();

    const nowMillis = now.toMillis();

    const currentMonthStr = new Date().toISOString().slice(0, 7);

    let totalUsage = 0;

    let bucketBalance = BURST_CAPACITY;

    let lastCheckTimeMillis = nowMillis;

    if (doc.exists) {

      const data = doc.data()!;

      if (data.currentMonth !== currentMonthStr) {

        // 月初リセット

        totalUsage = 0;

        bucketBalance = BURST_CAPACITY;

        lastCheckTimeMillis = nowMillis;

      } else {

        totalUsage = data.totalUsage || 0;

        bucketBalance = data.bucketBalance || 0;

        lastCheckTimeMillis = data.lastCheckTime.toMillis();

      }

    }

    // 月間上限チェック

    if (totalUsage >= MONTHLY_LIMIT) {

      const nextMonth = new Date();

      nextMonth.setMonth(nextMonth.getMonth() + 1);

      nextMonth.setDate(1);

      nextMonth.setHours(0, 0, 0, 0);

      const waitSeconds = Math.ceil((nextMonth.getTime() - nowMillis) / 1000);

      return { allowed: false, retryAfterSeconds: waitSeconds, currentUsage: totalUsage };

    }

    // 回復計算

    const endOfMonth = new Date();

    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    endOfMonth.setDate(0); 

    endOfMonth.setHours(23, 59, 59, 999);

    

    let timeLeftMillis = endOfMonth.getTime() - nowMillis;

    if (timeLeftMillis <= 0) timeLeftMillis = 1;

    const remainingBudget = MONTHLY_LIMIT - totalUsage;

    const recoveryRate = remainingBudget / timeLeftMillis;

    const timeDelta = nowMillis - lastCheckTimeMillis;

    const tokensToAdd = timeDelta * recoveryRate;

    let newBucketBalance = Math.min(BURST_CAPACITY, bucketBalance + tokensToAdd);

    // 利用判定

    if (newBucketBalance >= requestedCost) {

      newBucketBalance -= requestedCost;

      totalUsage += requestedCost;

      transaction.set(userRef, {

        totalUsage: totalUsage,

        bucketBalance: newBucketBalance,

        lastCheckTime: now,

        currentMonth: currentMonthStr

      }, { merge: true });

      return { allowed: true, currentUsage: totalUsage };

    } else {

      const deficit = requestedCost - newBucketBalance;

      const waitSeconds = Math.ceil((deficit / recoveryRate) / 1000);

      return { allowed: false, retryAfterSeconds: waitSeconds, currentUsage: totalUsage };

    }

  });

});