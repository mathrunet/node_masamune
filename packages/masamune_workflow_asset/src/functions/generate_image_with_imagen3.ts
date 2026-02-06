/**
 * A function for generating images using Google's Imagen 3.
 * Interface unified with asset_masamune/docker/comfyui/src/models/action.py.
 *
 * Google Imagen 3を使用して画像を生成するためのFunction。
 * asset_masamune/docker/comfyui/src/models/action.pyとインターフェースを統一。
 */
import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, WorkflowContext } from "@mathrunet/masamune_workflow";
import { Imagen3Service } from "../services/imagen3_service";
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
    REGION: "us-central1",
    OUTPUT_PREFIX: "generated-images",
    PRICE_PER_IMAGE: 0.04,  // Imagen 3 pricing (as of 2024)
};

/**
 * A function for generating images using Google Imagen 3.
 * Google Imagen 3を使用して画像を生成するためのFunction。
 */
export class GenerateImageWithImagen3 extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     * 関数のID。
     */
    id: string = "generate_image_with_imagen3";

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
            console.error("GenerateImageWithImagen3: No prompt provided");
            throw new Error("prompt is required");
        }

        // 3. Get environment configuration
        const projectId = process.env.GCLOUD_PROJECT ||
            process.env.GOOGLE_CLOUD_PROJECT ||
            process.env.GCP_PROJECT_ID;
        const region = process.env.GCLOUD_REGION || DEFAULTS.REGION;
        const storageBucket = process.env.STORAGE_BUCKET ||
            `${projectId}.appspot.com`;

        // Pricing configuration
        const pricePerImage = Number(process.env.IMAGEN3_PRICE || DEFAULTS.PRICE_PER_IMAGE);

        if (!projectId) {
            console.error("GenerateImageWithImagen3: No GCP project ID found");
            throw new Error("GCP project ID is required");
        }

        try {
            // 4. Initialize services
            const imagen3Service = new Imagen3Service({
                projectId,
                region,
            });

            const storageService = new StorageService(storageBucket);

            // 5. Download reference images if provided (gs:// URLs)
            // Note: Imagen 3 doesn't support input images directly, but we keep this for compatibility
            let inputImageBuffer: Buffer | undefined;
            let referenceImageBuffer: Buffer | undefined;

            if (commandData?.input_image) {
                try {
                    inputImageBuffer = await storageService.downloadFile(commandData.input_image);
                    console.warn("GenerateImageWithImagen3: Input images are not supported by Imagen 3, ignoring.");
                } catch (e: any) {
                    console.warn(`Failed to download input image: ${e.message}`);
                }
            }

            if (commandData?.reference_image) {
                try {
                    referenceImageBuffer = await storageService.downloadFile(commandData.reference_image);
                    console.warn("GenerateImageWithImagen3: Reference images are not supported by Imagen 3, ignoring.");
                } catch (e: any) {
                    console.warn(`Failed to download reference image: ${e.message}`);
                }
            }

            // 6. Generate image using Imagen 3
            console.log(`GenerateImageWithImagen3: Generating image with prompt: ${prompt.substring(0, 100)}...`);

            const response = await imagen3Service.generateImage({
                prompt,
                negativePrompt: commandData?.negative_prompt,
                width: commandData?.width || DEFAULTS.WIDTH,
                height: commandData?.height || DEFAULTS.HEIGHT,
                seed: commandData?.seed,
                numOutputs: commandData?.num_outputs || 1,
            });

            // 7. Determine output path and format
            const format = response.mimeType.includes("jpeg") ? "jpeg" : "png";
            const outputPath = commandData?.output_path ||
                StorageService.generatePath(DEFAULTS.OUTPUT_PREFIX, format);
            const contentType = StorageService.getContentType(format);

            // 8. Upload to Firebase Storage
            console.log(`GenerateImageWithImagen3: Uploading to ${storageBucket}/${outputPath}`);

            const uploadResult = await storageService.uploadFile(response.imageBuffer, {
                bucket: storageBucket,
                path: outputPath,
                contentType,
                makePublic: true,
            });

            // 9. Calculate cost (Imagen 3 uses per-image pricing)
            const cost = pricePerImage * (commandData?.num_outputs || 1);

            // 10. Build results matching action.py interface
            const fileResult: GeneratedFileResult = {
                width: response.width,
                height: response.height,
                format: format,
                size: response.imageBuffer.length,
            };

            const imageResults: ImageGenerationResults & { imageType?: string } = {
                files: [fileResult],
                inputTokens: 0,  // Imagen 3 doesn't use tokens
                outputTokens: 0,  // Imagen 3 doesn't use tokens
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
            console.log(`GenerateImageWithImagen3: Successfully generated image`);
            console.log(`  URL: ${uploadResult.gsUrl}`);
            console.log(`  Size: ${response.imageBuffer.length} bytes`);
            console.log(`  Cost: $${cost.toFixed(4)}`);

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
            console.error("GenerateImageWithImagen3: Failed to generate image", error);
            throw error;
        }
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new GenerateImageWithImagen3(options).build(regions);

// Export class for testing
module.exports.GenerateImageWithImagen3 = GenerateImageWithImagen3;