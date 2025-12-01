import * as functions from "firebase-functions/v2";
import { FunctionsBase, HttpFunctionsOptions, ModelFieldValue } from "@mathrunet/masamune";
import * as admin from "firebase-admin";
import { Action, Task, Usage, Plan, Subscription, Campaign } from "./interfaces";
import { GoogleGenAI } from "@google/genai";

const _kDefaultCpuPrice = 0.000025 * 4.0; // 4CPU秒
const _kDefaultMemoryPrice = 0.0000025 * 1.0; // 1GB秒
const _kDefaultRequetPrice = 0.4 / 1000000.0 * 2; // 2リクエスト
const _kDefaultLoadPrice = 0.038 / 100000.0 * 12; // 12ロード
const _kDefaultSavePrice = 0.115 / 100000.0 * 8; // 8保存
const _kDefaultEmbeddingPrice = 0.15 / 1000000.0 * 2; // 2埋め込み
const _kDefaultMonthlyLimit = 5.0; // 月間制限（フリーだと$5）
const _kDefaultBurstCapacity = 0.05; // バースト許容量 (5%)

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
        return functions.tasks.onTaskDispatched(
            {
                timeoutSeconds: options?.timeoutSeconds,
                memory: options?.memory,
                minInstances: options?.minInstances,
                concurrency: options?.concurrency,
                maxInstances: options?.maxInstances,
                serviceAccount: options?.serviceAccount ?? undefined,
            },
            async (request) => {
                try {
                    const emmbedingModelName = process.env.EMBEDDING_MODEL ?? "gemini-embedding-001";
                    const startedTime = new Date();
                    const projectId =  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
                    let region = options?.region ?? regions;
                    if(Array.isArray(region)){
                        region = region[0];
                    }
                    const path = request.data.path as string | undefined | null;
                    const token = request.data.token as string | undefined | null;
                    if (!path || !token) {
                        throw new Error("invalid-argument");
                    }
                    // Auto-initialize Firebase Admin if not already initialized
                    if (admin.apps.length === 0) {
                        admin.initializeApp();
                    }
                    const firestore = admin.firestore();
                    const action = await firestore.doc(path).get();
                    if (!action.exists) {
                        throw new Error("action-not-found");
                    }
                    const actionData = action.data() as Action | undefined | null;
                    const organization = actionData?.organization;
                    const organizationId = organization?.id;
                    const command = actionData?.command;
                    if (!actionData || !organization || !organizationId || !command) {
                        throw new Error("action-not-found");
                    }
                    const subscriptions = await firestore.collection(`plugins/iap/subscription`).where("userId", "==", organizationId).get();
                    const subscription = subscriptions.size > 0 ? subscriptions.docs[0].data() as Subscription | undefined | null : null;
                    const plan = subscription?.productId ? (await firestore.doc(`plugins/workflow/plan/${subscription?.productId}`).get()).data() as Plan | undefined | null : null;
                    try {
                        const expiredTime = actionData.tokenExpiredTime;
                        // Handle both Date and Firestore Timestamp
                        const expiredTimeMs = expiredTime
                            ? (expiredTime instanceof admin.firestore.Timestamp
                                ? expiredTime.toDate().getTime()
                                : expiredTime.getTime())
                            : 0;
                        if (!expiredTime || startedTime.getTime() > expiredTimeMs) {
                            throw new Error("token-expired");
                        }
                        if (token !== actionData.token) {
                            throw new Error("invalid-token");
                        }
                        await this.checkUsage({
                            firestore: firestore,
                            organizationId: organizationId,
                            plan: plan,
                        });
                        const result = await this.process(actionData);
                        const finishedTime = new Date();
                        const duration = (finishedTime.getTime() - startedTime.getTime()) / 1000.0;
                        let usage = _kDefaultLoadPrice + _kDefaultSavePrice + _kDefaultRequetPrice + duration * _kDefaultCpuPrice + duration * _kDefaultMemoryPrice;
                        const task = await actionData.task?.get();
                        if (!task || !task.exists) {
                            throw new Error("task-not-found");
                        }
                        const taskData = task.data() as Task | undefined | null;
                        const actions = taskData?.actions;
                        const index = command.index;
                        if (!taskData || !actions) {
                            throw new Error("task-not-found");
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
                                plan: plan,
                            });
                        } else {
                            // 完了済み
                            if(index >= actions.length - 1){
                                let search: number[] | undefined;
                                if(result.search){
                                    const vertexAI = new GoogleGenAI({
                                        vertexai: true,
                                        project: projectId,
                                        location: region,
                                    });
                                    const embedResult = await vertexAI.models.embedContent({ 
                                        model: emmbedingModelName,
                                        contents: JSON.stringify(result.results ?? []),
                                    });
                                    search = embedResult?.embeddings?.[0]?.values;
                                    usage += (embedResult?.embeddings?.[0]?.statistics?.tokenCount ?? 0) * _kDefaultEmbeddingPrice;
                                }
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
                                    "search": result.search ? result.search : admin.firestore.FieldValue.delete(),
                                    "@search": search ? admin.firestore.FieldValue.vector(search) : admin.firestore.FieldValue.delete(),
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
                                    plan: plan,
                                });
                            // 続きがある場合
                            } else {
                                let search: number[] | undefined;
                                if(result.search){
                                    const vertexAI = new GoogleGenAI({
                                        vertexai: true,
                                        project: projectId,
                                        location: region,
                                    });
                                    const embedResult = await vertexAI.models.embedContent({ 
                                        model: emmbedingModelName,
                                        contents: JSON.stringify(result.results ?? []),
                                    });
                                    search = embedResult?.embeddings?.[0]?.values;
                                    usage += (embedResult?.embeddings?.[0]?.statistics?.tokenCount ?? 0) * _kDefaultEmbeddingPrice;
                                }
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
                                    "search": result.search ? result.search : admin.firestore.FieldValue.delete(),
                                    "@search": search ? admin.firestore.FieldValue.vector(search) : admin.firestore.FieldValue.delete(),
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
                                    plan: plan,
                                });
                            }
                        }
                    } catch (err: any) {
                        let error: { [key: string]: any };
                        switch (err.message) {
                            case "token-expired": {
                                error = {
                                    status: 403,
                                    message: err.message,
                                };
                                break;
                            }
                            case "invalid-token": {
                                error = {
                                    status: 403,
                                    message: err.message,
                                };
                                break;
                            }
                            default: {
                                error = {
                                    status: 500,
                                    message: err.message,
                                };
                                break;
                            }
                        }
                        const finishedTime = new Date();
                        const duration = (finishedTime.getTime() - startedTime.getTime()) / 1000.0;
                        const usage = _kDefaultLoadPrice + _kDefaultSavePrice + _kDefaultRequetPrice + duration * _kDefaultCpuPrice + duration * _kDefaultMemoryPrice;
                        try {
                            const task = await actionData.task?.get();
                            if (!task || !task.exists) {
                                throw new Error("task-not-found");
                            }
                            const taskData = task.data() as Task | undefined | null;
                            if (!taskData) {
                                throw new Error("task-not-found");
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
                            plan: plan,
                        });
                        console.error(JSON.stringify(error));
                        // return error;
                    }
                } catch (err: any) {
                    let error: { [key: string]: any };
                    switch (err.message) {
                        case "invalid-argument": {
                            error = {
                                status: 404,
                                message: err.message,
                            };
                            break;
                        }
                        case "action-not-found": {
                            error = {
                                status: 404,
                                message: err.message,
                            };
                            break;
                        }
                        default: {
                            error = {
                                status: 404,
                                message: err.message,
                            };
                            break;
                        }
                    }
                    console.error(JSON.stringify(error));
                    // return error;
                }
            }
        );
    }

    private async checkUsage({
        firestore,
        organizationId,
        plan,
    }: {
        firestore: admin.firestore.Firestore,
        organizationId: string,
        plan: Plan | undefined | null,
    }): Promise<void> {
        const now = admin.firestore.Timestamp.now();
        const year = now.toDate().getFullYear();
        const month = (now.toDate().getMonth() + 1).toString().padStart(2, '0');
        const dateId = `${year}${month}`;
        const usageRef = firestore.doc(`plugins/workflow/organization/${organizationId}/usage/${dateId}`);
        const campaignRef = firestore.doc(`plugins/workflow/campaign/default`);

        const usageDoc = await usageRef.get();
        const campaignDoc = await campaignRef.get();
        const campaignData = campaignDoc.data() as Campaign | undefined | null;
        let campaignLimit: number | undefined | null = campaignData?.limit;
        const campaignExpiredTime = campaignData?.expiredTime;

        if(campaignExpiredTime && campaignExpiredTime.getTime() > now.toDate().getTime()){
            campaignLimit = null;
        }
        if(campaignLimit && campaignLimit < 0){
            return;
        }
        if (usageDoc.exists) {
            const data = usageDoc.data() as Usage;
            const currentMonthStr = new Date().toISOString().slice(0, 7);
            
            // 月が変わっている場合はチェックしない（updateUsageでリセットされるため）
            if (data.currentMonth === currentMonthStr) {
                const totalUsage = data.usage ?? 0.0;
                const planLimit = campaignLimit ? campaignLimit : (plan?.limit ?? Number(process.env.MONTHLY_LIMIT) ?? _kDefaultMonthlyLimit);
                const burstCapacity = plan?.burst ?? Number(process.env.BURST_CAPACITY) ?? _kDefaultBurstCapacity;
                const bucketBalance = data.bucketBalance ?? (planLimit * burstCapacity);
                const latestPlan = data.latestPlan;

                if (totalUsage >= planLimit) {
                    throw "limit-usage";
                }
                
                // バースト容量が0以下かつなら制限
                if (bucketBalance <= 0 && latestPlan === plan?.["@uid"]) {
                     throw "limit-usage";
                }
            }
        }
    }

    private async updateUsage({
        firestore,
        finishedTime,
        usage,
        plan,
        organizationId,
    }: {
        firestore: admin.firestore.Firestore,
        finishedTime: Date,
        usage: number,
        plan: Plan | undefined | null,
        organizationId: string,
    }): Promise<void> {
        try {
            const planId = plan?.["@uid"];
            const planLimit = plan?.limit ?? Number(process.env.MONTHLY_LIMIT) ?? _kDefaultMonthlyLimit;
            const burstCapacity = plan?.burst ?? Number(process.env.BURST_CAPACITY) ?? _kDefaultBurstCapacity;
            const year = finishedTime.getFullYear();
            const month = (finishedTime.getMonth() + 1).toString().padStart(2, "0");
            const dateId = `${year}${month}`;
            const usageRef = firestore.doc(`plugins/workflow/organization/${organizationId}/usage/${dateId}`);
            const currentMonthStr = finishedTime.toISOString().slice(0, 7);
            const nowMillis = finishedTime.getTime();

            const doc = await usageRef.get();
            let totalUsage = 0;
            let bucketBalance = planLimit * burstCapacity;
            let lastCheckTimeMillis = nowMillis;

            if (doc.exists) {
                const data = doc.data() as Usage;
                if (data.currentMonth !== currentMonthStr) {
                    // 月初リセット
                    totalUsage = 0;
                    bucketBalance = planLimit * burstCapacity;
                    lastCheckTimeMillis = nowMillis;
                } else {
                    totalUsage = data.usage || 0;
                    bucketBalance = data.bucketBalance ?? (planLimit * burstCapacity);
                    lastCheckTimeMillis = data.lastCheckTime?.toMillis() ?? nowMillis;
                }
            }

            // 回復計算
            const endOfMonth = new Date(finishedTime);
            endOfMonth.setMonth(endOfMonth.getMonth() + 1);
            endOfMonth.setDate(0);
            endOfMonth.setHours(23, 59, 59, 999);

            let timeLeftMillis = endOfMonth.getTime() - nowMillis;
            if (timeLeftMillis <= 0){
                timeLeftMillis = 1;
            }

            const remainingBudget = planLimit - totalUsage;
            const recoveryRate = remainingBudget / timeLeftMillis;
            const timeDelta = nowMillis - lastCheckTimeMillis;
            const tokensToAdd = timeDelta * recoveryRate;
            
            let newBucketBalance = Math.min(planLimit * burstCapacity, bucketBalance + tokensToAdd);

            // 消費
            newBucketBalance -= usage;
            totalUsage += usage;

            if(doc.exists){
                const updateData: any = {
                    ...doc.data(),
                    usage: totalUsage,
                    bucketBalance: newBucketBalance,
                    currentMonth: currentMonthStr,
                    "@time": finishedTime,
                    "latestPlan": planId ? planId : admin.firestore.FieldValue.delete(),
                    ...ModelFieldValue.modelTimestamp({
                        key: "lastCheckTime",
                        date: finishedTime,
                    }),
                    ...ModelFieldValue.modelTimestamp({
                        key: "updatedTime",
                        date: finishedTime,
                    }),
                };
                await usageRef.set(updateData, { merge: true });
            } else {
                const updateData: any = {
                    "@uid": dateId,
                    usage: totalUsage,
                    bucketBalance: newBucketBalance,
                    currentMonth: currentMonthStr,
                    "@time": finishedTime,
                    ...ModelFieldValue.modelTimestamp({
                        key: "lastCheckTime",
                        date: finishedTime,
                    }),
                    ...ModelFieldValue.modelTimestamp({
                        key: "createdTime",
                        date: finishedTime,
                    }),
                    ...ModelFieldValue.modelTimestamp({
                        key: "updatedTime",
                        date: finishedTime,
                    }),
                };
                await usageRef.set(updateData, { merge: true });
            }            
        } catch (err) {
            console.error(err);
        }
    }
}



