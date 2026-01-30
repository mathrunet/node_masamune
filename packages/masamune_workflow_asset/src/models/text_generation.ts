// Text generation models and types for multimodal input processing

// コマンドデータ型（アクションパラメータ）
export interface GeminiTextCommandData {
  command: "generate_text_from_multimodal";
  prompt: string;
  system_prompt?: string;
  output_format?: "text" | "markdown";
  max_tokens?: number;
  temperature?: number;
  model?: string;
  region?: string;
}

// Materials型定義（メディア入力）
export interface TextGenerationMaterials {
  images?: string[];      // 画像ファイルのgs:// URLs
  videos?: string[];      // 動画ファイルのgs:// URLs
  audio?: string[];       // 音声ファイルのgs:// URLs
  documents?: string[];   // ドキュメントファイルのgs:// URLs
}

// サービス用の型定義
export interface GeminiTextServiceOptions {
  projectId: string;
  region?: string;
  model?: string;
}

export interface TextGenerationRequest {
  prompt: string;
  systemPrompt?: string;
  mediaInputs?: Array<{
    buffer: Buffer;
    mimeType: string;
    type: 'image' | 'video' | 'audio' | 'document';
  }>;
  maxTokens?: number;
  temperature?: number;
}

export interface TextGenerationResponse {
  generatedText: string;
  inputTokens: number;
  outputTokens: number;
}

export interface TextGenerationResults {
  files: Array<{
    path: string;
    content_type: string;
    size: number;
  }>;
  generatedText: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  processedMaterials: {
    images: number;
    videos: number;
    audio: number;
    documents: number;
  };
}

export interface GeneratedTextAsset {
  url: string;              // gs:// URL
  public_url: string;       // HTTPS URL
  content_type: string;
}