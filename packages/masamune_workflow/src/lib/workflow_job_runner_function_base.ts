import * as functions from "firebase-functions/v2";
import { firestoreLoader, FunctionsBase, HttpFunctionsOptions, ModelTimestamp } from "@mathrunet/masamune";
import * as admin from "firebase-admin";
import { Action, Task, Usage, Plan, Subscription, Campaign, TaskLog } from "./interfaces";
import { GoogleGenAI } from "@google/genai";
import "@mathrunet/masamune";

/**
 * Base class for defining Function data for Workflow CloudRunJob execution.
 * 
 * WorkflowのCloudRunJobを実行するためのFunctionのデータを定義するためのベースクラス。
 */
export abstract class WorkflowJobRunnerFunctionBase extends FunctionsBase {
    /**
     * Base class for defining Function data for Workflow CloudRunJob execution.
     * 
     * WorkflowのCloudRunJobを実行するためのFunctionのデータを定義するためのベースクラス。
     */
    constructor(options: HttpFunctionsOptions = {}) {
        super({ options: options });
    }

    /**
     * Name of the CloudRunJob.
     * 
     * CloudRunJobの名前。
     */
    abstract id: string;

    /**
     * Data of the Function.
     * 
     * Functionのデータ。
     */
    data: { [key: string]: any } = {};

    /**
     * Build the Function.
     * 
     * Functionを生成します。
     */
    build(regions: string[]): Function {
        const options = this.options as HttpFunctionsOptions | undefined | null;
        return functions.https.onCall(
            {
                region: options?.region ?? regions,
                timeoutSeconds: options?.timeoutSeconds ?? 540, // 9 minutes
                memory: options?.memory ?? "1GiB",
                minInstances: options?.minInstances,
                concurrency: options?.concurrency,
                maxInstances: options?.maxInstances,
                serviceAccount: options?.serviceAccount ?? undefined,
                enforceAppCheck: options?.enforceAppCheck ?? undefined,
                consumeAppCheckToken: options?.consumeAppCheckToken ?? undefined,
            },
            async (query) => {
            }
        );
    }
}
