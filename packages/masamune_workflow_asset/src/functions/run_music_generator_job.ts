import { WorkflowJobRunnerFunctionBase } from "@mathrunet/masamune_workflow";
import { HttpFunctionsOptions } from "@mathrunet/masamune";

/**
 * Function to run Music Generator Cloud Run Job.
 * This function dispatches music generation tasks to a GPU-enabled Cloud Run Job
 * that uses AI models for music generation.
 *
 * 音楽生成Cloud Run Jobを実行するFunction。
 * このFunctionは、AIモデルを使用した音楽生成のための
 * GPU対応Cloud Run Jobに音楽生成タスクをディスパッチします。
 */
export class RunMusicGeneratorJob extends WorkflowJobRunnerFunctionBase {
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
    id = "music-generator";

    /**
     * Add music generation specific environment variables.
     * These variables will be passed to the Cloud Run Job container.
     *
     * 音楽生成固有の環境変数を追加します。
     * これらの変数はCloud Run Jobコンテナに渡されます。
     *
     * @param data Request data containing generation parameters
     * @returns Array of environment variable objects
     */
    protected getAdditionalEnv(data: { [key: string]: any }): Array<{ name: string; value: string }> {
        const env: Array<{ name: string; value: string }> = [];

        // Add music model if specified (e.g., musicgen-small, musicgen-medium, musicgen-large)
        if (data.musicModel || data.model) {
            env.push({ name: "MUSIC_MODEL", value: String(data.musicModel || data.model) });
        }

        // Add generation parameters
        if (data.duration) {
            env.push({ name: "MUSIC_DURATION", value: String(data.duration) });
        }
        if (data.tempo) {
            env.push({ name: "MUSIC_TEMPO", value: String(data.tempo) });
        }
        if (data.key) {
            env.push({ name: "MUSIC_KEY", value: String(data.key) });
        }

        // Add music style/genre
        if (data.genre) {
            env.push({ name: "MUSIC_GENRE", value: String(data.genre) });
        }
        if (data.style) {
            env.push({ name: "MUSIC_STYLE", value: String(data.style) });
        }
        if (data.mood) {
            env.push({ name: "MUSIC_MOOD", value: String(data.mood) });
        }

        // Add prompt (text description for text-to-music)
        if (data.prompt) {
            env.push({ name: "PROMPT", value: String(data.prompt) });
        }

        // Add audio format settings
        if (data.sampleRate) {
            env.push({ name: "SAMPLE_RATE", value: String(data.sampleRate) });
        }
        if (data.bitrate) {
            env.push({ name: "BITRATE", value: String(data.bitrate) });
        }
        if (data.channels) {
            env.push({ name: "CHANNELS", value: String(data.channels) });
        }

        // Add seed for reproducibility
        if (data.seed !== undefined) {
            env.push({ name: "SEED", value: String(data.seed) });
        }

        // Add input audio path if provided (for music continuation/variation)
        if (data.input_audio) {
            env.push({ name: "INPUT_AUDIO", value: String(data.input_audio) });
        }

        // Add temperature/creativity parameter
        if (data.temperature !== undefined) {
            env.push({ name: "TEMPERATURE", value: String(data.temperature) });
        }
        if (data.top_k !== undefined) {
            env.push({ name: "TOP_K", value: String(data.top_k) });
        }
        if (data.top_p !== undefined) {
            env.push({ name: "TOP_P", value: String(data.top_p) });
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
        console.log("Preparing music generation job...");

        // Log key parameters for debugging
        console.log(`Model: ${data.musicModel || data.model || "default"}`);
        console.log(`Duration: ${data.duration || 30} seconds`);
        console.log(`Genre: ${data.genre || "not specified"}`);
        console.log(`Style: ${data.style || "not specified"}`);

        // Basic validation
        if (data.duration && (data.duration < 1 || data.duration > 300)) {
            console.warn(`Warning: Duration ${data.duration} may be outside recommended range (1-300 seconds)`);
        }
        if (data.tempo && (data.tempo < 40 || data.tempo > 200)) {
            console.warn(`Warning: Tempo ${data.tempo} may be outside typical range (40-200 BPM)`);
        }
        if (data.temperature && (data.temperature < 0 || data.temperature > 2)) {
            console.warn(`Warning: Temperature ${data.temperature} may be outside recommended range (0-2)`);
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
        console.log("Music generation job dispatched successfully");

        // The actual music generation and result storage will be handled
        // by the Cloud Run Job, which will update Firestore with results
    }
}

// Export for Firebase Functions
module.exports = (regions: string[], options?: HttpFunctionsOptions, data?: { [key: string]: any }) => {
    return new RunMusicGeneratorJob(options).build(regions);
};