import { GoogleGenAI } from "@google/genai";
import {
  TextGenerationRequest,
  TextGenerationResponse,
  GeminiTextServiceOptions
} from "../models/text_generation";

/**
 * Service for generating text from multimodal inputs using Gemini API
 */
export class GeminiTextService {
  private genai: any;
  private model: string;

  constructor(options: GeminiTextServiceOptions) {
    // Initialize Gemini with Vertex AI integration
    this.genai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_GENAI_API_KEY || "",
      vertexai: true,
      project: options.projectId,
      location: options.region || "us-central1",
    });
    this.model = options.model || "gemini-2.0-flash-exp";
  }

  /**
   * Generate text from multimodal inputs
   */
  async generateText(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    try {
      // Build multimodal content parts
      const contentParts: any[] = [];

      // Add media inputs with context markers
      if (request.mediaInputs && request.mediaInputs.length > 0) {
        for (const media of request.mediaInputs) {
          // Add context marker for each media type
          let contextMarker = "";
          switch (media.type) {
            case 'image':
              contextMarker = "[画像入力]";
              break;
            case 'video':
              contextMarker = "[動画入力]";
              break;
            case 'audio':
              contextMarker = "[音声入力]";
              break;
            case 'document':
              contextMarker = "[ドキュメント入力]";
              break;
          }

          if (contextMarker) {
            contentParts.push({ text: contextMarker });
          }

          // Add the media data
          contentParts.push({
            inlineData: {
              data: media.buffer.toString("base64"),
              mimeType: media.mimeType,
            },
          });
        }
      }

      // Add the main prompt
      contentParts.push({ text: request.prompt });

      // Set system instruction
      const systemInstruction = request.systemPrompt ||
        "あなたは創造的なテキスト生成アシスタントです。" +
        "提供された素材（テキスト、画像、音声、動画）を総合的に分析し、" +
        "それらの内容を考慮した上で、要求に応じたテキストを生成してください。" +
        "複数の素材が提供された場合は、それぞれの関連性を理解し、" +
        "統合的な視点からテキストを作成してください。";

      // Initialize the model
      const model = this.genai.getGenerativeModel({
        model: this.model,
        systemInstruction: systemInstruction,
      });

      // Generate content
      const result = await model.generateContent({
        contents: [{
          role: "user",
          parts: contentParts,
        }],
        generationConfig: {
          maxOutputTokens: request.maxTokens || 8192,
          temperature: request.temperature || 0.7,
          topP: 0.95,
          topK: 40,
        },
      });

      // Process response
      const response = await result.response;
      const generatedText = response.text();

      // Get token usage
      const usage = result.response.usageMetadata;
      const inputTokens = usage?.promptTokenCount || 0;
      const outputTokens = usage?.candidatesTokenCount || 0;

      console.log(`GeminiTextService: Generated ${outputTokens} tokens from ${inputTokens} input tokens`);

      return {
        generatedText,
        inputTokens,
        outputTokens,
      };
    } catch (error: any) {
      console.error("GeminiTextService: Failed to generate text", error);
      throw new Error(`Text generation failed: ${error.message}`);
    }
  }

  /**
   * Calculate cost based on Gemini 2.0 Flash pricing
   * @param inputTokens Number of input tokens
   * @param outputTokens Number of output tokens
   * @returns Cost in USD
   */
  static calculateCost(inputTokens: number, outputTokens: number): number {
    // Gemini 2.0 Flash pricing (as of 2024)
    // $0.075 per 1M input tokens
    // $0.30 per 1M output tokens
    const inputCost = (inputTokens / 1000000) * 0.075;
    const outputCost = (outputTokens / 1000000) * 0.30;
    return inputCost + outputCost;
  }

  /**
   * Validate if the media type is supported by Gemini
   */
  static isSupportedMediaType(mimeType: string): boolean {
    const supportedTypes = [
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      // Videos
      'video/mp4',
      'video/mpeg',
      'video/mov',
      'video/avi',
      'video/x-flv',
      'video/mpg',
      'video/webm',
      'video/wmv',
      'video/3gpp',
      // Audio
      'audio/wav',
      'audio/mp3',
      'audio/mpeg',
      'audio/aiff',
      'audio/aac',
      'audio/ogg',
      'audio/flac',
      // Documents
      'application/pdf',
      'text/plain',
      'text/html',
      'text/csv',
      'text/xml',
      'text/rtf',
      'application/rtf',
    ];

    return supportedTypes.includes(mimeType.toLowerCase());
  }
}