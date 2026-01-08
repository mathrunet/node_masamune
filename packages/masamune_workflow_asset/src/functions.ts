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
} as const;
