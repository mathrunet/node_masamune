/**
 * A function for generating images using Gemini 2.5 Flash.
 * Interface unified with asset_masamune/docker/comfyui/src/models/action.py.
 *
 * Gemini 2.5 Flashを使用して画像を生成するためのFunction。
 * asset_masamune/docker/comfyui/src/models/action.pyとインターフェースを統一。
 */
import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, WorkflowContext } from "@mathrunet/masamune_workflow";
import { GeminiImageService } from "../services/gemini_image_service";
import { StorageService } from "../services/storage_service";
import {
    GeminiImageCommandData,
    GeneratedFileResult,
    GeneratedFileAsset,
    ImageGenerationResults,
} from "../models/image_generation";
import "@mathrunet/masamune";

/**
 * Default values for image generation.
 */
const DEFAULTS = {
    WIDTH: 1024,
    HEIGHT: 1024,
    MODEL: "gemini-2.0-flash-exp",
    REGION: "us-central1",
    OUTPUT_PREFIX: "generated-images",
};

/**
 * A function for generating images using Gemini 2.5 Flash.
 * Gemini 2.5 Flashを使用して画像を生成するためのFunction。
 */
export class GenerateImageWithGemini extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     * 関数のID。
     */
    id: string = "generate_image_with_gemini";

    /**
     * The process of the function.
     *
     * @param context The context of the function.
     * @returns The action of the function.
     */
    async process(context: WorkflowContext): Promise<Action> {
        const action = context.action;

        // 1. Get command data
        const commandData = action.command?.data as GeminiImageCommandData | undefined;
        const prompt = commandData?.prompt;

        // 2. Validate required parameters
        if (!prompt) {
            console.error("GenerateImageWithGemini: No prompt provided");
            throw new Error("prompt is required");
        }

        // 3. Get environment configuration
        const projectId = process.env.GCLOUD_PROJECT ||
            process.env.GOOGLE_CLOUD_PROJECT ||
            process.env.GCP_PROJECT_ID;
        const region = process.env.GCLOUD_REGION || DEFAULTS.REGION;
        const modelName = commandData?.model ||
            process.env.GEMINI_IMAGE_MODEL ||
            DEFAULTS.MODEL;
        const storageBucket = process.env.STORAGE_BUCKET ||
            `${projectId}.appspot.com`;

        // Pricing configuration
        const inputPrice = Number(process.env.MODEL_INPUT_PRICE || 0.0000003);
        const outputPrice = Number(process.env.MODEL_OUTPUT_PRICE || 0.0000025);

        if (!projectId) {
            console.error("GenerateImageWithGemini: No GCP project ID found");
            throw new Error("GCP project ID is required");
        }

        try {
            // 4. Initialize services
            const geminiService = new GeminiImageService({
                projectId,
                region,
                model: modelName,
            });

            const storageService = new StorageService(storageBucket);

            // 5. Download reference images if provided (gs:// URLs)
            let inputImageBuffer: Buffer | undefined;
            let referenceImageBuffer: Buffer | undefined;

            if (commandData?.input_image) {
                try {
                    inputImageBuffer = await storageService.downloadFile(commandData.input_image);
                } catch (e: any) {
                    console.warn(`Failed to download input image: ${e.message}`);
                }
            }

            if (commandData?.reference_image) {
                try {
                    referenceImageBuffer = await storageService.downloadFile(commandData.reference_image);
                } catch (e: any) {
                    console.warn(`Failed to download reference image: ${e.message}`);
                }
            }

            // 6. Generate image using Gemini
            console.log(`GenerateImageWithGemini: Generating image with prompt: ${prompt.substring(0, 100)}...`);

            const response = await geminiService.generateImage({
                prompt,
                negativePrompt: commandData?.negative_prompt,
                width: commandData?.width || DEFAULTS.WIDTH,
                height: commandData?.height || DEFAULTS.HEIGHT,
                inputImage: inputImageBuffer,
                referenceImage: referenceImageBuffer,
                seed: commandData?.seed,
            });

            // 7. Determine output path and format
            const format = response.mimeType.includes("jpeg") ? "jpeg" : "png";
            const outputPath = commandData?.output_path ||
                StorageService.generatePath(DEFAULTS.OUTPUT_PREFIX, format);
            const contentType = StorageService.getContentType(format);

            // 8. Upload to Firebase Storage
            console.log(`GenerateImageWithGemini: Uploading to ${storageBucket}/${outputPath}`);

            const uploadResult = await storageService.uploadImage(response.imageBuffer, {
                bucket: storageBucket,
                path: outputPath,
                contentType,
                makePublic: true,
            });

            // 9. Calculate cost
            const cost = GeminiImageService.calculateCost(
                response.inputTokens,
                response.outputTokens,
                inputPrice,
                outputPrice
            );

            // 10. Build results matching action.py interface
            const fileResult: GeneratedFileResult = {
                width: response.width,
                height: response.height,
                format: format,
                size: response.imageBuffer.length,
            };

            const imageResults: ImageGenerationResults & { imageType?: string } = {
                files: [fileResult],
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                cost,
            };

            // Add image type if specified
            if (commandData?.image_type) {
                imageResults.imageType = commandData.image_type;
            }

            const generatedAsset: GeneratedFileAsset = {
                url: uploadResult.gsUrl,
                public_url: uploadResult.publicUrl,
                content_type: contentType,
            };

            // 11. Return action with results and assets
            console.log(`GenerateImageWithGemini: Successfully generated image`);
            console.log(`  URL: ${uploadResult.gsUrl}`);
            console.log(`  Size: ${response.imageBuffer.length} bytes`);
            console.log(`  Tokens: ${response.inputTokens} input, ${response.outputTokens} output`);
            console.log(`  Cost: $${cost.toFixed(6)}`);

            return {
                ...action,
                usage: (action.usage ?? 0) + cost,
                results: {
                    imageGeneration: imageResults,
                },
                assets: {
                    generatedImage: generatedAsset,
                },
            };
        } catch (error: any) {
            console.error("GenerateImageWithGemini: Failed to generate image", error);
            throw error;
        }
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new GenerateImageWithGemini(options).build(regions);

// Export class for testing
module.exports.GenerateImageWithGemini = GenerateImageWithGemini;
