/**
 * Imagen 3 Image Generation Service.
 * Uses Google Vertex AI's Imagen 3 for image generation.
 *
 * Imagen3画像生成サービス。
 * Google Vertex AIのImagen 3を使用して画像生成を行う。
 */
import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';
import {
    GeminiImageServiceOptions,
    ImageGenerationRequest,
    ImageGenerationResponse,
} from "../models/image_generation";

/**
 * Default region for VertexAI.
 */
const DEFAULT_REGION = "us-central1";

/**
 * Service for generating images using Imagen 3.
 * Imagen 3を使用して画像を生成するサービス。
 */
export class Imagen3Service {
    private projectId: string;
    private region: string;
    private auth: GoogleAuth;

    /**
     * Creates a new Imagen3Service instance.
     * @param options Service configuration options
     */
    constructor(options: GeminiImageServiceOptions) {
        this.projectId = options.projectId;
        this.region = options.region ?? DEFAULT_REGION;
        this.auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
    }

    /**
     * Generates an image from a text prompt using Imagen 3.
     * テキストプロンプトからImagen 3を使用して画像を生成する。
     *
     * @param request The image generation request
     * @returns The generated image response
     */
    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
        const maxRetries = 3;
        const delays = [30000, 60000, 120000]; // 30s, 60s, 120s

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Get access token
                const client = await this.auth.getClient();
                const accessToken = await client.getAccessToken();

                // Prepare the API endpoint
                const endpoint = `https://${this.region}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.region}/publishers/google/models/imagen-3:predict`;

                // Prepare the request payload
                const payload = {
                    instances: [{
                        prompt: request.prompt,
                    }],
                    parameters: {
                        sampleCount: request.numOutputs || 1,
                        aspectRatio: this.getAspectRatio(request.width, request.height),
                        negativePrompt: request.negativePrompt,
                        seed: request.seed,
                        language: "en",
                        personGeneration: "allow_all",
                        safetySetting: "block_few",
                        addWatermark: false,
                    }
                };

                // Make the API request
                const response = await axios.post(endpoint, payload, {
                    headers: {
                        'Authorization': `Bearer ${accessToken.token}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (response.data && response.data.predictions && response.data.predictions.length > 0) {
                    const prediction = response.data.predictions[0];

                    // Decode base64 image
                    const imageBuffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');

                    // Return the image data with proper dimensions and token counts (0 for Imagen)
                    return {
                        imageBuffer,
                        mimeType: 'image/png',
                        width: request.width || 1024,
                        height: request.height || 1024,
                        inputTokens: 0,  // Imagen 3 doesn't report token usage
                        outputTokens: 0,  // Imagen 3 doesn't report token usage
                    };
                }

                throw new Error('No predictions returned from Imagen 3');

            } catch (error: any) {
                console.error(`Attempt ${attempt + 1} failed:`, error.message);

                // Check for rate limit error
                if (error.response?.status === 429 && attempt < maxRetries - 1) {
                    const actualDelay = delays[attempt] || 120000;
                    console.log(`Rate limited, retrying in ${actualDelay / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, actualDelay));
                    continue;
                }

                // Re-throw the error if not rate limited or last attempt
                throw error;
            }
        }

        throw new Error('Failed to generate image after maximum retries');
    }

    /**
     * Gets the aspect ratio string from width and height.
     * @param width Image width
     * @param height Image height
     * @returns Aspect ratio string
     */
    private getAspectRatio(width?: number, height?: number): string {
        if (!width || !height) {
            return "1:1"; // Default to square
        }

        const ratio = width / height;

        // Map to supported aspect ratios
        if (Math.abs(ratio - 1) < 0.1) return "1:1";
        if (Math.abs(ratio - 16/9) < 0.1) return "16:9";
        if (Math.abs(ratio - 9/16) < 0.1) return "9:16";
        if (Math.abs(ratio - 4/3) < 0.1) return "4:3";
        if (Math.abs(ratio - 3/4) < 0.1) return "3:4";

        // Default to square if no match
        return "1:1";
    }
}