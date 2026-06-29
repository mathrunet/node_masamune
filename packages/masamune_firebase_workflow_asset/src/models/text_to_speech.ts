/**
 * Type definitions for Google Cloud Text-to-Speech.
 * Google Cloud Text-to-Speech用の型定義。
 */

/**
 * Command data for audio generation (matches ActionCommand.data)
 * 音声生成用のコマンドデータ（ActionCommand.dataに対応）
 */
export interface GoogleTTSCommandData {
    /** Command identifier */
    command: "generate_audio_with_google_tts";
    /** Text to synthesize (required) */
    text: string;
    /** Voice name (e.g., "ja-JP-Neural2-A") */
    voice_name?: string;
    /** Language code (e.g., "ja-JP") */
    language?: string;
    /** Voice gender */
    gender?: "MALE" | "FEMALE" | "NEUTRAL";
    /** Output audio format */
    output_format?: "mp3" | "wav" | "ogg";
    /** Speaking rate (0.25-4.0, default: 1.0) */
    speaking_rate?: number;
    /** Pitch (-20.0-20.0, default: 0.0) */
    pitch?: number;
    /** Volume gain (-96.0-16.0, default: 0.0) */
    volume_gain_db?: number;
    /** Output path in Storage (optional, auto-generated if not provided) */
    output_path?: string;
}

/**
 * Generated audio file metadata for results
 * 生成音声ファイルのメタデータ
 */
export interface GeneratedAudioResult {
    /** Audio duration in seconds */
    duration: number;
    /** Audio format ("mp3" | "wav" | "ogg") */
    format: string;
    /** File size in bytes */
    size: number;
    /** Billable characters */
    characters: number;
}

/**
 * Generated audio file asset info
 * 生成音声ファイルのアセット情報
 */
export interface GeneratedAudioAsset {
    /** gs:// URL */
    url: string;
    /** HTTPS public URL */
    public_url: string;
    /** Content type (e.g., "audio/mpeg") */
    content_type: string;
}

/**
 * Audio generation results for action.results.audioGeneration
 * action.results.audioGeneration用の音声生成結果
 */
export interface AudioGenerationResults {
    /** Array of generated audio file results */
    files: GeneratedAudioResult[];
    /** Billable characters */
    characters: number;
    /** Estimated cost in USD */
    cost: number;
}

/**
 * Google TTS service options
 * Google TTSサービスのオプション
 */
export interface GoogleTTSServiceOptions {
    /** GCP Project ID */
    projectId: string;
    /** Optional key file path for authentication */
    keyFilename?: string;
}

/**
 * Internal audio generation request
 * 内部用の音声生成リクエスト
 */
export interface AudioGenerationRequest {
    /** Text to synthesize */
    text: string;
    /** Voice name (e.g., "ja-JP-Neural2-A") */
    voiceName?: string;
    /** Language code (e.g., "ja-JP") */
    languageCode?: string;
    /** Voice gender */
    ssmlGender?: "MALE" | "FEMALE" | "NEUTRAL";
    /** Audio encoding format */
    audioEncoding: "MP3" | "LINEAR16" | "OGG_OPUS";
    /** Speaking rate (0.25-4.0) */
    speakingRate?: number;
    /** Pitch (-20.0-20.0) */
    pitch?: number;
    /** Volume gain (-96.0-16.0) */
    volumeGainDb?: number;
}

/**
 * Audio generation response from Google TTS API
 * Google TTS APIからの音声生成レスポンス
 */
export interface AudioGenerationResponse {
    /** Generated audio buffer */
    audioBuffer: Buffer;
    /** Audio encoding */
    audioEncoding: string;
    /** Billable characters */
    characters: number;
}
