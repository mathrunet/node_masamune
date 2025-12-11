import * as functions from "firebase-functions/v2";
import { firestoreLoader, FunctionsBase, HttpFunctionsOptions, ModelTimestamp } from "@mathrunet/masamune";
import * as admin from "firebase-admin";
import { Action, Task, Usage, Plan, Subscription, Campaign, TaskLog } from "./interfaces";
import { GoogleGenAI } from "@google/genai";
import { JobsClient } from "@google-cloud/run";
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
                const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
                let region = options?.region ?? regions;
                if (Array.isArray(region)) {
                    region = region[0];
                }
                const jobsClient = new JobsClient();
                await jobsClient.runJob({
                    name: `projects/${projectId}/locations/${region}/jobs/${this.id}`,
                });
            }
        );
    }
}
