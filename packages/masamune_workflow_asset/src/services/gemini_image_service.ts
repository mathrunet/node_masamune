/**
 * Gemini Image Generation Service.
 * Uses Google GenAI SDK with VertexAI mode for native image generation.
 *
 * Gemini画像生成サービス。
 * VertexAIモードのGoogle GenAI SDKを使用してネイティブ画像生成を行う。
 */
import { GoogleGenAI } from "@google/genai";
import {
    GeminiImageServiceOptions,
    ImageGenerationRequest,
    ImageGenerationResponse,
} from "../models/image_generation";

/**
 * Default model for image generation.
 * Gemini 2.0 Flash Experimental with native image output capability.
 */
const DEFAULT_MODEL = "gemini-2.0-flash-exp";

/**
 * Default region for VertexAI.
 */
const DEFAULT_REGION = "us-central1";

/**
 * Service for generating images using Gemini 2.5 Flash.
 * Gemini 2.5 Flashを使用して画像を生成するサービス。
 */
export class GeminiImageService {
    private genai: GoogleGenAI;
    private model: string;

    /**
     * Creates a new GeminiImageService instance.
     * @param options Service configuration options
     */
    constructor(options: GeminiImageServiceOptions) {
        this.genai = new GoogleGenAI({
            vertexai: true,
            project: options.projectId,
            location: options.region ?? DEFAULT_REGION,
        });
        this.model = options.model ?? DEFAULT_MODEL;
    }

    /**
     * Generates an image from a text prompt using Gemini.
     * テキストプロンプトからGeminiを使用して画像を生成する。
     *
     * @param request Image generation request
     * @returns Generated image response with buffer and metadata
     */
    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
        // Build the prompt with optional negative prompt
        let prompt = request.prompt;
        if (request.negativePrompt) {
            prompt += `\n\nAvoid: ${request.negativePrompt}`;
        }

        // Add size hints to the prompt if specified
        if (request.width && request.height) {
            prompt += `\n\nGenerate image with aspect ratio approximately ${request.width}:${request.height}`;
        }

        // Build content parts array
        const contentParts: any[] = [];

        // Add reference images if provided (for image-to-image or style reference)
        if (request.inputImage) {
            contentParts.push({
                inlineData: {
                    data: request.inputImage.toString("base64"),
                    mimeType: "image/png",
                },
            });
            prompt = `Using this image as input, ${prompt}`;
        }

        if (request.referenceImage) {
            contentParts.push({
                inlineData: {
                    data: request.referenceImage.toString("base64"),
                    mimeType: "image/png",
                },
            });
            prompt = `Using this image as style reference, ${prompt}`;
        }

        // Add text prompt
        contentParts.push({ text: prompt });

        // Generate content with image output modality
        const response = await this.genai.models.generateContent({
            model: this.model,
            contents: [
                {
                    role: "user",
                    parts: contentParts,
                },
            ],
            config: {
                responseModalities: ["IMAGE", "TEXT"],
            } as any, // Type assertion needed as responseModalities may not be in types yet
        });

        // Extract image data from response
        const candidates = response.candidates;
        if (!candidates || candidates.length === 0) {
            throw new Error("No candidates in response");
        }

        const parts = candidates[0].content?.parts;
        if (!parts || parts.length === 0) {
            throw new Error("No parts in response");
        }

        // Find the image part in the response
        let imageData: string | undefined;
        let mimeType = "image/png";

        for (const part of parts) {
            if ((part as any).inlineData) {
                const inlineData = (part as any).inlineData;
                imageData = inlineData.data;
                mimeType = inlineData.mimeType || "image/png";
                break;
            }
        }

        if (!imageData) {
            // If no image data, check if there's an error in the text
            const textPart = parts.find((p) => (p as any).text);
            const errorMessage = textPart ? (textPart as any).text : "No image data in response";
            throw new Error(`Image generation failed: ${errorMessage}`);
        }

        // Decode base64 image data
        const imageBuffer = Buffer.from(imageData, "base64");

        // Get image dimensions (basic estimation for PNG/JPEG)
        const dimensions = this.getImageDimensions(imageBuffer, mimeType);

        // Get token usage
        const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
        const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

        return {
            imageBuffer,
            mimeType,
            width: dimensions.width || request.width || 1024,
            height: dimensions.height || request.height || 1024,
            inputTokens,
            outputTokens,
        };
    }

    /**
     * Estimates image dimensions from buffer.
     * Supports PNG and JPEG formats.
     *
     * @param buffer Image buffer
     * @param mimeType MIME type of the image
     * @returns Width and height or undefined if not determinable
     */
    private getImageDimensions(
        buffer: Buffer,
        mimeType: string
    ): { width?: number; height?: number } {
        try {
            if (mimeType === "image/png") {
                // PNG: width at offset 16-19, height at offset 20-23 (big-endian)
                if (buffer.length >= 24) {
                    const width = buffer.readUInt32BE(16);
                    const height = buffer.readUInt32BE(20);
                    return { width, height };
                }
            } else if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
                // JPEG: More complex, search for SOF0 marker (0xFF 0xC0)
                let offset = 2; // Skip SOI marker
                while (offset < buffer.length - 8) {
                    if (buffer[offset] === 0xff) {
                        const marker = buffer[offset + 1];
                        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                            // SOF marker found
                            const height = buffer.readUInt16BE(offset + 5);
                            const width = buffer.readUInt16BE(offset + 7);
                            return { width, height };
                        }
                        // Skip to next marker
                        const length = buffer.readUInt16BE(offset + 2);
                        offset += 2 + length;
                    } else {
                        offset++;
                    }
                }
            }
        } catch (e) {
            // Ignore parsing errors
        }
        return {};
    }

    /**
     * Calculates the estimated cost for image generation.
     * コスト計算（画像生成用）。
     *
     * @param inputTokens Number of input tokens
     * @param outputTokens Number of output tokens
     * @param inputPrice Price per input token (default: Gemini 2.5 Flash rate)
     * @param outputPrice Price per output token (default: Gemini 2.5 Flash rate)
     * @returns Estimated cost in USD
     */
    static calculateCost(
        inputTokens: number,
        outputTokens: number,
        inputPrice: number = 0.0000003,
        outputPrice: number = 0.0000025
    ): number {
        return inputTokens * inputPrice + outputTokens * outputPrice;
    }
}
