/**
 * Type definitions for Gemini image generation.
 * Interface unified with asset_masamune/docker/comfyui/src/models/action.py
 *
 * Gemini画像生成用の型定義。
 * asset_masamune/docker/comfyui/src/models/action.py とインターフェースを統一。
 */

/**
 * Command data for image generation (matches ActionCommand.data in Python)
 * 画像生成用のコマンドデータ（PythonのActionCommand.dataに対応）
 */
export interface GeminiImageCommandData {
    /** Command identifier */
    command: "generate_image_with_gemini";
    /** Image generation prompt (required) */
    prompt: string;
    /** Negative prompt for things to avoid */
    negative_prompt?: string;
    /** Image width (default: 1024) */
    width?: number;
    /** Image height (default: 1024) */
    height?: number;
    /** Input image gs:// URL for image-to-image generation */
    input_image?: string;
    /** Reference/style image gs:// URL */
    reference_image?: string;
    /** Model name (default: gemini-2.0-flash-exp) */
    model?: string;
    /** Seed value (-1 for random) */
    seed?: number;
    /** Number of outputs to generate */
    num_outputs?: number;
    /** Output path in Storage (optional, auto-generated if not provided) */
    output_path?: string;
    /** Image type for categorization */
    image_type?: string;
}

/**
 * Generated file metadata for results (matches GeneratedFile.to_results_dict in Python)
 * 生成ファイルのメタデータ（PythonのGeneratedFile.to_results_dictに対応）
 */
export interface GeneratedFileResult {
    /** Image width in pixels */
    width: number;
    /** Image height in pixels */
    height: number;
    /** Image format ("png" | "jpeg") */
    format: string;
    /** File size in bytes */
    size: number;
}

/**
 * Generated file asset info (matches GeneratedFile.to_assets_dict in Python)
 * 生成ファイルのアセット情報（PythonのGeneratedFile.to_assets_dictに対応）
 */
export interface GeneratedFileAsset {
    /** gs:// URL */
    url: string;
    /** HTTPS public URL */
    public_url: string;
    /** Content type (e.g., "image/png") */
    content_type: string;
}

/**
 * Image generation results for action.results.imageGeneration
 * action.results.imageGeneration用の画像生成結果
 */
export interface ImageGenerationResults {
    /** Array of generated file results */
    files: GeneratedFileResult[];
    /** Input token count */
    inputTokens: number;
    /** Output token count */
    outputTokens: number;
    /** Estimated cost in USD */
    cost: number;
}

/**
 * Image generation service options
 * 画像生成サービスのオプション
 */
export interface GeminiImageServiceOptions {
    /** GCP Project ID */
    projectId: string;
    /** GCP Region (default: us-central1) */
    region?: string;
    /** Model name (default: gemini-2.0-flash-exp) */
    model?: string;
}

/**
 * Internal image generation request
 * 内部用の画像生成リクエスト
 */
export interface ImageGenerationRequest {
    /** Image generation prompt */
    prompt: string;
    /** Negative prompt */
    negativePrompt?: string;
    /** Image width */
    width?: number;
    /** Image height */
    height?: number;
    /** Input image buffer for image-to-image */
    inputImage?: Buffer;
    /** Reference image buffer for style reference */
    referenceImage?: Buffer;
    /** Seed value */
    seed?: number;
    /** Number of outputs to generate */
    numOutputs?: number;
}

/**
 * Image generation response from Gemini API
 * Gemini APIからの画像生成レスポンス
 */
export interface ImageGenerationResponse {
    /** Generated image buffer */
    imageBuffer: Buffer;
    /** Image MIME type */
    mimeType: string;
    /** Image width */
    width: number;
    /** Image height */
    height: number;
    /** Input tokens used */
    inputTokens: number;
    /** Output tokens used */
    outputTokens: number;
}

/**
 * Storage upload options
 * Storageアップロードオプション
 */
export interface StorageUploadOptions {
    /** Storage bucket name */
    bucket: string;
    /** File path within bucket */
    path: string;
    /** Content type */
    contentType: string;
    /** Make publicly accessible */
    makePublic?: boolean;
}

/**
 * Storage upload result
 * Storageアップロード結果
 */
export interface StorageUploadResult {
    /** gs:// URL */
    gsUrl: string;
    /** HTTPS public URL */
    publicUrl: string;
}
