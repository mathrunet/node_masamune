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
} as const;
