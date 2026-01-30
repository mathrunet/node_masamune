import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 *
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
    /**
     * A function for generating images using Gemini 2.5 Flash.
     *
     * Gemini 2.5 Flashを使用して画像を生成するためのFunction。
     *
     * ## Overview
     *
     * Generate images using Gemini's native image generation capabilities.
     * Supports text-to-image and image-to-image generation with optional
     * reference images for style transfer.
     *
     * Geminiのネイティブ画像生成機能を使用して画像を生成します。
     * テキストから画像、画像から画像の生成をサポートし、
     * スタイル転送用の参照画像もオプションで指定可能です。
     *
     * ## Usage
     *
     * ```typescript
     * import * as m from "@mathrunet/masamune_workflow_asset";
     *
     * export const workflow = m.Functions.generateImageWithGemini();
     * ```
     *
     * ## ActionCommand.data
     *
     * | Parameter | Type | Required | Description |
     * |-----------|------|----------|-------------|
     * | prompt | string | Yes | Image generation prompt |
     * | negative_prompt | string | No | Negative prompt for unwanted elements |
     * | width | number | No | Image width (default: 1024) |
     * | height | number | No | Image height (default: 1024) |
     * | input_image | string | No | Input image gs:// URL for image-to-image |
     * | reference_image | string | No | Reference image gs:// URL for style |
     * | model | string | No | Model name (default: gemini-2.0-flash-exp) |
     * | seed | number | No | Seed value (-1 for random) |
     * | output_path | string | No | Output path in Storage |
     * | image_type | string | No | Image type for categorization |
     *
     * @param options Options for the function.
     * @returns A FunctionsData object.
     */
    generateImageWithGemini: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "generate_image_with_gemini",
            func: require("./functions/generate_image_with_gemini"),
            options: options,
        }),
    /**
     * A function for generating audio using Google Cloud Text-to-Speech.
     *
     * Google Cloud Text-to-Speechを使用して音声を生成するためのFunction。
     *
     * ## Overview
     *
     * Generate natural-sounding speech from text using Google Cloud TTS.
     * Supports SSML input, customizable voice parameters, and multiple output formats.
     *
     * Google Cloud TTSを使用してテキストから自然な音声を生成します。
     * SSML入力、カスタマイズ可能なボイスパラメータ、複数の出力形式をサポートします。
     *
     * ## Usage
     *
     * ```typescript
     * import * as m from "@mathrunet/masamune_workflow_asset";
     *
     * export const workflow = m.Functions.generateAudioWithGoogleTTS();
     * ```
     *
     * ## ActionCommand.data
     *
     * | Parameter | Type | Required | Description |
     * |-----------|------|----------|-------------|
     * | text | string | Yes | Text to synthesize |
     * | voice_name | string | No | Voice name (e.g., "ja-JP-Neural2-A") |
     * | language | string | No | Language code (e.g., "ja-JP") |
     * | gender | string | No | Voice gender ("MALE", "FEMALE", "NEUTRAL") |
     * | output_format | string | No | Output format ("mp3", "wav", "ogg", default: "mp3") |
     * | speaking_rate | number | No | Speaking rate (0.25-4.0, default: 1.0) |
     * | pitch | number | No | Pitch (-20.0-20.0, default: 0.0) |
     * | volume_gain_db | number | No | Volume gain (-96.0-16.0, default: 0.0) |
     * | output_path | string | No | Output path in Storage |
     *
     * @param options Options for the function.
     * @returns A FunctionsData object.
     */
    generateAudioWithGoogleTTS: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "generate_audio_with_google_tts",
            func: require("./functions/generate_audio_with_google_tts"),
            options: options,
        }),
    /**
     * A function to run Image Generator Cloud Run Job.
     *
     * 画像生成Cloud Run Jobを実行するためのFunction。
     *
     * ## Overview
     *
     * Dispatches image generation tasks to a GPU-enabled Cloud Run Job
     * that uses ComfyUI workflows for advanced AI image generation.
     * This job handles complex image generation tasks that require GPU acceleration.
     *
     * ComfyUIワークフローを使用した高度なAI画像生成のための
     * GPU対応Cloud Run Jobに画像生成タスクをディスパッチします。
     * このジョブはGPUアクセラレーションを必要とする複雑な画像生成タスクを処理します。
     *
     * ## Usage
     *
     * ```typescript
     * import * as m from "@mathrunet/masamune_workflow_asset";
     *
     * export const workflow = m.Functions.runImageGeneratorJob();
     * ```
     *
     * ## ActionCommand.data
     *
     * | Parameter | Type | Required | Description |
     * |-----------|------|----------|-------------|
     * | workflow | string | No | Workflow type (txt2img, img2img, inpainting) |
     * | model | string | No | Model name to use |
     * | prompt | string | No | Generation prompt |
     * | negative_prompt | string | No | Negative prompt |
     * | width | number | No | Image width (64-2048, default: 1024) |
     * | height | number | No | Image height (64-2048, default: 1024) |
     * | steps | number | No | Number of generation steps |
     * | cfg_scale | number | No | CFG scale value |
     * | seed | number | No | Seed for reproducibility |
     *
     * @param options Options for the function.
     * @returns A FunctionsData object.
     */
    runImageGeneratorJob: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "run_image_generator_job",
            func: require("./functions/run_image_generator_job"),
            options: options,
        }),
    /**
     * A function to run Video Generator Cloud Run Job.
     *
     * 動画生成Cloud Run Jobを実行するためのFunction。
     *
     * ## Overview
     *
     * Dispatches video generation tasks to a GPU-enabled Cloud Run Job
     * that uses ComfyUI workflows for AI video generation.
     * This job handles video generation tasks that require GPU acceleration.
     *
     * ComfyUIワークフローを使用したAI動画生成のための
     * GPU対応Cloud Run Jobに動画生成タスクをディスパッチします。
     * このジョブはGPUアクセラレーションを必要とする動画生成タスクを処理します。
     *
     * ## Usage
     *
     * ```typescript
     * import * as m from "@mathrunet/masamune_workflow_asset";
     *
     * export const workflow = m.Functions.runVideoGeneratorJob();
     * ```
     *
     * ## ActionCommand.data
     *
     * | Parameter | Type | Required | Description |
     * |-----------|------|----------|-------------|
     * | workflow | string | No | Workflow type (txt2vid, img2vid, vid2vid) |
     * | model | string | No | Model name to use |
     * | prompt | string | No | Generation prompt |
     * | negative_prompt | string | No | Negative prompt |
     * | width | number | No | Video width (64-1920, default: 1024) |
     * | height | number | No | Video height (64-1080, default: 576) |
     * | fps | number | No | Frames per second (1-60, default: 8) |
     * | duration | number | No | Duration in seconds |
     * | frames | number | No | Total number of frames |
     * | steps | number | No | Number of generation steps |
     * | cfg_scale | number | No | CFG scale value |
     * | seed | number | No | Seed for reproducibility |
     * | input_image | string | No | Input image gs:// URL for img2vid |
     * | input_video | string | No | Input video gs:// URL for vid2vid |
     *
     * @param options Options for the function.
     * @returns A FunctionsData object.
     */
    runVideoGeneratorJob: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "run_video_generator_job",
            func: require("./functions/run_video_generator_job"),
            options: options,
        }),
    /**
     * A function to run Music Generator Cloud Run Job.
     *
     * 音楽生成Cloud Run Jobを実行するためのFunction。
     *
     * ## Overview
     *
     * Dispatches music generation tasks to a GPU-enabled Cloud Run Job
     * that uses AI models for music generation.
     * This job handles music generation tasks that require GPU acceleration.
     *
     * AIモデルを使用した音楽生成のための
     * GPU対応Cloud Run Jobに音楽生成タスクをディスパッチします。
     * このジョブはGPUアクセラレーションを必要とする音楽生成タスクを処理します。
     *
     * ## Usage
     *
     * ```typescript
     * import * as m from "@mathrunet/masamune_workflow_asset";
     *
     * export const workflow = m.Functions.runMusicGeneratorJob();
     * ```
     *
     * ## ActionCommand.data
     *
     * | Parameter | Type | Required | Description |
     * |-----------|------|----------|-------------|
     * | musicModel | string | No | Model to use (musicgen-small, musicgen-medium, musicgen-large) |
     * | prompt | string | No | Text description of music to generate |
     * | duration | number | No | Duration in seconds (1-300, default: 30) |
     * | tempo | number | No | Tempo in BPM (40-200) |
     * | key | string | No | Musical key |
     * | genre | string | No | Music genre |
     * | style | string | No | Music style |
     * | mood | string | No | Music mood |
     * | sampleRate | number | No | Sample rate in Hz |
     * | bitrate | number | No | Audio bitrate |
     * | channels | number | No | Number of audio channels |
     * | seed | number | No | Seed for reproducibility |
     * | input_audio | string | No | Input audio gs:// URL for continuation |
     * | temperature | number | No | Generation temperature (0-2) |
     * | top_k | number | No | Top-k sampling parameter |
     * | top_p | number | No | Top-p sampling parameter |
     *
     * @param options Options for the function.
     * @returns A FunctionsData object.
     */
    runMusicGeneratorJob: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "run_music_generator_job",
            func: require("./functions/run_music_generator_job"),
            options: options,
        }),
    /**
     * A function for generating text from multimodal inputs using Gemini.
     *
     * Geminiを使用してマルチモーダル入力からテキストを生成するためのFunction。
     *
     * ## Overview
     *
     * Generate text by analyzing multiple media inputs (images, videos, audio, documents)
     * along with text prompts. The Gemini model processes all inputs comprehensively
     * to produce contextually relevant text output.
     *
     * 複数のメディア入力（画像、動画、音声、ドキュメント）とテキストプロンプトを
     * 分析してテキストを生成します。Geminiモデルはすべての入力を総合的に処理し、
     * 文脈に適したテキスト出力を生成します。
     *
     * ## Usage
     *
     * ```typescript
     * import * as m from "@mathrunet/masamune_workflow_asset";
     *
     * export const workflow = m.Functions.generateTextFromMultimodal();
     * ```
     *
     * ## Action.materials
     *
     * | Field | Type | Required | Description |
     * |-------|------|----------|-------------|
     * | images | string[] | No | Array of image gs:// URLs |
     * | videos | string[] | No | Array of video gs:// URLs |
     * | audio | string[] | No | Array of audio gs:// URLs |
     * | documents | string[] | No | Array of document gs:// URLs |
     *
     * ## ActionCommand.data
     *
     * | Parameter | Type | Required | Description |
     * |-----------|------|----------|-------------|
     * | prompt | string | Yes | Main generation prompt |
     * | system_prompt | string | No | System instruction for generation |
     * | output_format | string | No | Output format ("text" or "markdown", default: "text") |
     * | max_tokens | number | No | Maximum tokens to generate (default: 8192) |
     * | temperature | number | No | Generation temperature (0.0-2.0, default: 0.7) |
     * | model | string | No | Gemini model to use (default: gemini-2.0-flash-exp) |
     * | region | string | No | GCP region (default: us-central1) |
     *
     * @param options Options for the function.
     * @returns A FunctionsData object.
     */
    generateTextFromMultimodal: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "generate_text_from_multimodal",
            func: require("./functions/generate_text_from_multimodal"),
            options: options,
        }),
} as const;
