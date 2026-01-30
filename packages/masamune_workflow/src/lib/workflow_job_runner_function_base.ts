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
     * Get additional environment variables to pass to the job.
     * Override this method to add job-specific environment variables.
     *
     * ジョブに渡す追加の環境変数を取得します。
     * ジョブ固有の環境変数を追加するには、このメソッドをオーバーライドしてください。
     *
     * @param data Request data from Cloud Tasks
     * @returns Array of environment variable objects
     */
    protected getAdditionalEnv(data: { [key: string]: any }): Array<{ name: string; value: string }> {
        return [];
    }

    /**
     * Hook to run before job execution.
     * Override this method to perform pre-execution tasks.
     *
     * ジョブ実行前に実行するフック。
     * 実行前のタスクを実行するには、このメソッドをオーバーライドしてください。
     *
     * @param data Request data
     */
    protected async beforeRun(data: { [key: string]: any }): Promise<void> {
        // Default implementation does nothing
    }

    /**
     * Hook to run after job execution.
     * Override this method to perform post-execution tasks.
     *
     * ジョブ実行後に実行するフック。
     * 実行後のタスクを実行するには、このメソッドをオーバーライドしてください。
     *
     * @param data Request data
     */
    protected async afterRun(data: { [key: string]: any }): Promise<void> {
        // Default implementation does nothing
    }

    /**
     * Validate action path from request data.
     *
     * リクエストデータからアクションパスを検証します。
     *
     * @param data Request data
     * @returns Action path
     * @throws Error if path is invalid
     */
    protected getActionPath(data: { [key: string]: any }): string {
        const path = data.path as string | undefined | null;
        if (!path) {
            throw new Error("Action path is required in request data");
        }
        return path;
    }

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
                try {
                    // Get project ID and region
                    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
                    let region = options?.region ?? regions;
                    if (Array.isArray(region)) {
                        region = region[0];
                    }

                    // Validate and get action path
                    const actionPath = this.getActionPath(request.data);
                    console.log(`Starting Cloud Run Job ${this.id} for action: ${actionPath}`);

                    // Execute before hook
                    await this.beforeRun(request.data);

                    // Build environment variables
                    const baseEnv = [
                        { name: "ACTION_PATH", value: actionPath },
                        { name: "PROJECT_ID", value: projectId || "" },
                        { name: "GOOGLE_CLOUD_PROJECT", value: projectId || "" },
                    ];

                    // Add token if provided
                    const token = request.data.token as string | undefined | null;
                    if (token) {
                        baseEnv.push({ name: "TOKEN", value: token });
                    }

                    // Add additional environment variables from subclass
                    const additionalEnv = this.getAdditionalEnv(request.data);
                    const allEnv = [...baseEnv, ...additionalEnv];

                    console.log(`Environment variables: ${allEnv.map(e => e.name).join(", ")}`);

                    // Initialize Jobs Client
                    const jobsClient = new JobsClient();
                    const jobName = `projects/${projectId}/locations/${region}/jobs/${this.id}`;

                    console.log(`Running job: ${jobName}`);

                    // Run the job with environment variable overrides
                    const [operation] = await jobsClient.runJob({
                        name: jobName,
                        overrides: {
                            containerOverrides: [
                                {
                                    env: allEnv,
                                },
                            ],
                        },
                    });

                    console.log(`Job started: ${operation.name}`);

                    // Execute after hook
                    await this.afterRun(request.data);

                    console.log(`Cloud Run Job ${this.id} dispatch completed for action: ${actionPath}`);
                } catch (err: any) {
                    console.error(`Error running Cloud Run Job ${this.id}:`, err);

                    // Log detailed error information
                    const errorMessage = typeof err?.message === "string"
                        ? err.message
                        : (err?.details || err?.toString?.() || "Unknown error");

                    console.error(`Error details: ${errorMessage}`);

                    // Optionally update Firestore action with error
                    // (Only if we can get the action path)
                    try {
                        const actionPath = this.getActionPath(request.data);
                        const defaultDatabaseId = options?.firestoreDatabaseIds?.[0] ?? null;
                        const firestore = firestoreLoader(defaultDatabaseId);
                        const actionRef = firestore.doc(actionPath);

                        await actionRef.save({
                            status: "failed",
                            error: {
                                status: 500,
                                message: errorMessage,
                            },
                            "updatedTime": new ModelTimestamp(new Date()),
                        }, { merge: true });
                    } catch (updateErr) {
                        console.error("Failed to update action with error:", updateErr);
                    }

                    throw err;
                }
            }
        );
    }
}
