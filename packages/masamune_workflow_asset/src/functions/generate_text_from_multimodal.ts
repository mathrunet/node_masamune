import { WorkflowProcessFunctionBase, WorkflowContext, Action } from "@mathrunet/masamune_workflow";
import {
  GeminiTextCommandData,
  TextGenerationMaterials,
  TextGenerationResults,
  GeneratedTextAsset
} from "../models/text_generation";
import { GeminiTextService } from "../services/gemini_text_service";
import { StorageService } from "../services/storage_service";

/**
 * Generate text from multimodal inputs using Gemini API
 * Processes images, videos, audio, and documents from action.materials
 */
export class GenerateTextFromMultimodal extends WorkflowProcessFunctionBase {
  id: string = "generate_text_from_multimodal";

  async process(context: WorkflowContext): Promise<Action> {
    const action = context.action;
    const commandData = action.command?.data as GeminiTextCommandData | undefined;
    const materials = action.materials as TextGenerationMaterials | undefined;

    console.log("GenerateTextFromMultimodal: Starting with materials", {
      images: materials?.images?.length || 0,
      videos: materials?.videos?.length || 0,
      audio: materials?.audio?.length || 0,
      documents: materials?.documents?.length || 0,
    });

    // Validate required parameters
    const prompt = commandData?.prompt || action.command?.prompt;
    if (!prompt) {
      console.error("GenerateTextFromMultimodal: No prompt provided");
      throw new Error("prompt is required in command data");
    }

    // Get environment configuration
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || "";

    if (!projectId) {
      console.error("GenerateTextFromMultimodal: No GCP project ID found");
      throw new Error("GCP project ID is required");
    }

    // Initialize services
    const geminiService = new GeminiTextService({
      projectId: projectId,
      region: commandData?.region || "us-central1",
      model: commandData?.model,
    });

    const storageService = new StorageService(storageBucket);

    // Download media files from materials
    const mediaInputs: Array<{
      buffer: Buffer;
      mimeType: string;
      type: 'image' | 'video' | 'audio' | 'document';
    }> = [];

    const processedCounts = {
      images: 0,
      videos: 0,
      audio: 0,
      documents: 0
    };

    // Process images
    if (materials?.images && materials.images.length > 0) {
      for (const imageUrl of materials.images) {
        try {
          console.log(`GenerateTextFromMultimodal: Downloading image: ${imageUrl}`);
          const buffer = await storageService.downloadFile(imageUrl);
          const mimeType = this.getMimeTypeFromUrl(imageUrl);

          // Validate media type
          if (!GeminiTextService.isSupportedMediaType(mimeType)) {
            console.warn(`Unsupported media type: ${mimeType} for ${imageUrl}`);
            continue;
          }

          mediaInputs.push({ buffer, mimeType, type: 'image' });
          processedCounts.images++;
        } catch (e: any) {
          console.warn(`Failed to download image: ${imageUrl} - ${e.message}`);
        }
      }
    }

    // Process videos
    if (materials?.videos && materials.videos.length > 0) {
      for (const videoUrl of materials.videos) {
        try {
          console.log(`GenerateTextFromMultimodal: Downloading video: ${videoUrl}`);
          const buffer = await storageService.downloadFile(videoUrl);
          const mimeType = this.getMimeTypeFromUrl(videoUrl);

          if (!GeminiTextService.isSupportedMediaType(mimeType)) {
            console.warn(`Unsupported media type: ${mimeType} for ${videoUrl}`);
            continue;
          }

          mediaInputs.push({ buffer, mimeType, type: 'video' });
          processedCounts.videos++;
        } catch (e: any) {
          console.warn(`Failed to download video: ${videoUrl} - ${e.message}`);
        }
      }
    }

    // Process audio
    if (materials?.audio && materials.audio.length > 0) {
      for (const audioUrl of materials.audio) {
        try {
          console.log(`GenerateTextFromMultimodal: Downloading audio: ${audioUrl}`);
          const buffer = await storageService.downloadFile(audioUrl);
          const mimeType = this.getMimeTypeFromUrl(audioUrl);

          if (!GeminiTextService.isSupportedMediaType(mimeType)) {
            console.warn(`Unsupported media type: ${mimeType} for ${audioUrl}`);
            continue;
          }

          mediaInputs.push({ buffer, mimeType, type: 'audio' });
          processedCounts.audio++;
        } catch (e: any) {
          console.warn(`Failed to download audio: ${audioUrl} - ${e.message}`);
        }
      }
    }

    // Process documents
    if (materials?.documents && materials.documents.length > 0) {
      for (const docUrl of materials.documents) {
        try {
          console.log(`GenerateTextFromMultimodal: Downloading document: ${docUrl}`);
          const buffer = await storageService.downloadFile(docUrl);
          const mimeType = this.getMimeTypeFromUrl(docUrl);

          if (!GeminiTextService.isSupportedMediaType(mimeType)) {
            console.warn(`Unsupported media type: ${mimeType} for ${docUrl}`);
            continue;
          }

          mediaInputs.push({ buffer, mimeType, type: 'document' });
          processedCounts.documents++;
        } catch (e: any) {
          console.warn(`Failed to download document: ${docUrl} - ${e.message}`);
        }
      }
    }

    console.log(`GenerateTextFromMultimodal: Downloaded ${mediaInputs.length} media files`);
    console.log(`GenerateTextFromMultimodal: Processed counts:`, processedCounts);

    // Generate text using Gemini
    let response;
    try {
      response = await geminiService.generateText({
        prompt: prompt,
        systemPrompt: commandData?.system_prompt,
        mediaInputs: mediaInputs,
        maxTokens: commandData?.max_tokens,
        temperature: commandData?.temperature,
      });
    } catch (error: any) {
      console.error("GenerateTextFromMultimodal: Failed to generate text", error);
      throw new Error(`Text generation failed: ${error.message}`);
    }

    console.log(`GenerateTextFromMultimodal: Generated text with ${response.outputTokens} tokens`);

    // Generate output path
    const extension = commandData?.output_format === "markdown" ? "md" : "txt";
    const outputPath = StorageService.generatePath("generated-texts", extension);

    // Upload text file
    const textBuffer = Buffer.from(response.generatedText, "utf-8");
    const contentType = commandData?.output_format === "markdown"
      ? "text/markdown"
      : "text/plain";

    let uploadResult;
    try {
      uploadResult = await storageService.uploadFile(textBuffer, {
        bucket: storageBucket,
        path: outputPath,
        contentType: contentType,
        makePublic: true,
      });
    } catch (error: any) {
      console.error("GenerateTextFromMultimodal: Failed to upload result", error);
      throw new Error(`Failed to upload generated text: ${error.message}`);
    }

    console.log(`GenerateTextFromMultimodal: Uploaded to ${uploadResult.gsUrl}`);

    // Calculate cost
    const cost = GeminiTextService.calculateCost(
      response.inputTokens,
      response.outputTokens
    );

    // Build results
    const textResults: TextGenerationResults = {
      files: [{
        path: outputPath,
        content_type: contentType,
        size: textBuffer.length,
      }],
      generatedText: response.generatedText,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      cost: cost,
      processedMaterials: processedCounts,
    };

    const generatedAsset: GeneratedTextAsset = {
      url: uploadResult.gsUrl,
      public_url: uploadResult.publicUrl,
      content_type: contentType,
    };

    // Return updated action
    return {
      ...action,
      usage: (action.usage ?? 0) + cost,
      results: {
        ...action.results,
        textGeneration: textResults,
      },
      assets: {
        ...action.assets,
        generatedText: generatedAsset,
      },
    };
  }

  /**
   * Detect MIME type from URL extension
   */
  private getMimeTypeFromUrl(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      // Images
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml',
      'ico': 'image/x-icon',
      // Videos
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'avi': 'video/x-msvideo',
      'mov': 'video/quicktime',
      'mkv': 'video/x-matroska',
      'flv': 'video/x-flv',
      'wmv': 'video/x-ms-wmv',
      'mpg': 'video/mpeg',
      'mpeg': 'video/mpeg',
      '3gp': 'video/3gpp',
      '3gpp': 'video/3gpp',
      // Audio
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'm4a': 'audio/mp4',
      'flac': 'audio/flac',
      'aac': 'audio/aac',
      'wma': 'audio/x-ms-wma',
      'aiff': 'audio/aiff',
      'aif': 'audio/aiff',
      // Documents
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'md': 'text/markdown',
      'json': 'application/json',
      'xml': 'text/xml',
      'csv': 'text/csv',
      'html': 'text/html',
      'htm': 'text/html',
      'rtf': 'application/rtf',
    };

    return mimeTypes[extension || ''] || 'application/octet-stream';
  }
}