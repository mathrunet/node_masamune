import { WorkflowJobRunnerFunctionBase } from "@mathrunet/masamune_workflow";
import { HttpFunctionsOptions } from "@mathrunet/masamune";

/**
 * Function to run Image Generator Cloud Run Job.
 * This function dispatches image generation tasks to a GPU-enabled Cloud Run Job
 * that uses ComfyUI workflows for AI image generation.
 *
 * 画像生成Cloud Run Jobを実行するFunction。
 * このFunctionは、ComfyUIワークフローを使用したAI画像生成のための
 * GPU対応Cloud Run Jobに画像生成タスクをディスパッチします。
 */
export class RunImageGeneratorJob extends WorkflowJobRunnerFunctionBase {
    /**
     * Constructor.
     *
     * @param options Function options including timeout and memory settings.
     */
    constructor(options: HttpFunctionsOptions = {}) {
        super({
            ...options,
            timeoutSeconds: options.timeoutSeconds ?? 540, // 9 minutes (max for Cloud Tasks)
            memory: options.memory ?? "512MiB",
        });
    }

    /**
     * Cloud Run Job ID.
     * This must match the job name configured in Terraform.
     *
     * Cloud Run JobのID。
     * これはTerraformで設定されたジョブ名と一致する必要があります。
     */
    id = "image-generator";

    /**
     * Add image generation specific environment variables.
     * These variables will be passed to the Cloud Run Job container.
     *
     * 画像生成固有の環境変数を追加します。
     * これらの変数はCloud Run Jobコンテナに渡されます。
     *
     * @param data Request data containing workflow parameters
     * @returns Array of environment variable objects
     */
    protected getAdditionalEnv(data: { [key: string]: any }): Array<{ name: string; value: string }> {
        const env: Array<{ name: string; value: string }> = [];

        // Add workflow type if specified (e.g., txt2img, img2img, inpainting)
        if (data.workflow) {
            env.push({ name: "WORKFLOW_TYPE", value: String(data.workflow) });
        }

        // Add ComfyUI path from environment if available
        const comfyuiPath = process.env.COMFYUI_PATH;
        if (comfyuiPath) {
            env.push({ name: "COMFYUI_PATH", value: comfyuiPath });
        }

        // Add model name if specified
        if (data.model) {
            env.push({ name: "MODEL_NAME", value: String(data.model) });
        }

        // Add generation parameters if provided
        if (data.width) {
            env.push({ name: "IMAGE_WIDTH", value: String(data.width) });
        }
        if (data.height) {
            env.push({ name: "IMAGE_HEIGHT", value: String(data.height) });
        }
        if (data.steps) {
            env.push({ name: "GENERATION_STEPS", value: String(data.steps) });
        }
        if (data.cfg_scale) {
            env.push({ name: "CFG_SCALE", value: String(data.cfg_scale) });
        }
        if (data.seed !== undefined) {
            env.push({ name: "SEED", value: String(data.seed) });
        }

        // Add prompt and negative prompt
        if (data.prompt) {
            env.push({ name: "PROMPT", value: String(data.prompt) });
        }
        if (data.negative_prompt) {
            env.push({ name: "NEGATIVE_PROMPT", value: String(data.negative_prompt) });
        }

        return env;
    }

    /**
     * Before job execution hook.
     * Validates input parameters before dispatching to Cloud Run Job.
     *
     * ジョブ実行前フック。
     * Cloud Run Jobにディスパッチする前に入力パラメータを検証します。
     *
     * @param data Request data
     */
    protected async beforeRun(data: { [key: string]: any }): Promise<void> {
        console.log("Preparing image generation job...");

        // Log key parameters for debugging
        console.log(`Workflow: ${data.workflow || "default"}`);
        console.log(`Model: ${data.model || "default"}`);
        console.log(`Image size: ${data.width || 1024}x${data.height || 1024}`);

        // Basic validation
        if (data.width && (data.width < 64 || data.width > 2048)) {
            console.warn(`Warning: Image width ${data.width} may be outside recommended range (64-2048)`);
        }
        if (data.height && (data.height < 64 || data.height > 2048)) {
            console.warn(`Warning: Image height ${data.height} may be outside recommended range (64-2048)`);
        }
    }

    /**
     * After job execution hook.
     * Logs successful job dispatch.
     *
     * ジョブ実行後フック。
     * ジョブディスパッチの成功をログに記録します。
     *
     * @param data Request data
     */
    protected async afterRun(data: { [key: string]: any }): Promise<void> {
        console.log("Image generation job dispatched successfully");

        // The actual image generation and result storage will be handled
        // by the Cloud Run Job, which will update Firestore with results
    }
}

// Export for Firebase Functions
module.exports = (regions: string[], options?: HttpFunctionsOptions, data?: { [key: string]: any }) => {
    return new RunImageGeneratorJob(options).build(regions);
};