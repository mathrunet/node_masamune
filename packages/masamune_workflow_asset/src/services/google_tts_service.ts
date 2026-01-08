/**
 * Google Cloud Text-to-Speech Service.
 * Google Cloud Text-to-Speechサービス。
 */
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import {
    GoogleTTSServiceOptions,
    AudioGenerationRequest,
    AudioGenerationResponse,
} from "../models/text_to_speech";

/**
 * Service for generating audio using Google Cloud Text-to-Speech.
 * Google Cloud Text-to-Speechを使用して音声を生成するサービス。
 */
export class GoogleTTSService {
    private client: TextToSpeechClient;

    /**
     * Creates a new GoogleTTSService instance.
     * @param options Service configuration options
     */
    constructor(options: GoogleTTSServiceOptions) {
        this.client = new TextToSpeechClient({
            projectId: options.projectId,
            keyFilename: options.keyFilename,
        });
    }

    /**
     * Generates audio from text using Google Cloud Text-to-Speech.
     * テキストからGoogle Cloud Text-to-Speechを使用して音声を生成する。
     *
     * @param request Audio generation request
     * @returns Generated audio response with buffer and metadata
     */
    async generateAudio(request: AudioGenerationRequest): Promise<AudioGenerationResponse> {
        const isSSML = this.isSSML(request.text);

        // Build the TTS request
        const ttsRequest: any = {
            input: isSSML
                ? { ssml: request.text }
                : { text: request.text },
            voice: {
                languageCode: request.languageCode,
                name: request.voiceName,
                ssmlGender: request.ssmlGender,
            },
            audioConfig: {
                audioEncoding: request.audioEncoding,
                speakingRate: request.speakingRate,
                pitch: request.pitch,
                volumeGainDb: request.volumeGainDb,
            },
        };

        // Remove undefined fields
        if (!request.languageCode) {
            delete ttsRequest.voice.languageCode;
        }
        if (!request.voiceName) {
            delete ttsRequest.voice.name;
        }
        if (!request.ssmlGender) {
            delete ttsRequest.voice.ssmlGender;
        }
        if (request.speakingRate === undefined) {
            delete ttsRequest.audioConfig.speakingRate;
        }
        if (request.pitch === undefined) {
            delete ttsRequest.audioConfig.pitch;
        }
        if (request.volumeGainDb === undefined) {
            delete ttsRequest.audioConfig.volumeGainDb;
        }

        // Call Google TTS API
        const [response] = await this.client.synthesizeSpeech(ttsRequest);

        if (!response.audioContent) {
            throw new Error("No audio content in response");
        }

        // Convert audioContent to Buffer
        const audioBuffer = Buffer.from(response.audioContent as Uint8Array);

        // Count billable characters
        const characters = this.countCharacters(request.text);

        return {
            audioBuffer,
            audioEncoding: request.audioEncoding,
            characters,
        };
    }

    /**
     * Checks if the text is SSML (Speech Synthesis Markup Language).
     * テキストがSSML（Speech Synthesis Markup Language）かどうかをチェックする。
     *
     * @param text Text to check
     * @returns True if text is SSML
     */
    private isSSML(text: string): boolean {
        return text.trim().startsWith("<speak>");
    }

    /**
     * Counts billable characters in the text.
     * テキストの課金対象文字数をカウントする。
     *
     * @param text Text to count
     * @returns Number of billable characters
     */
    private countCharacters(text: string): number {
        // For SSML, tags are not counted except <mark> tags
        // For plain text, all characters including spaces and newlines are counted
        // Simplified implementation: count all characters
        return text.length;
    }

    /**
     * Calculates the estimated cost for audio generation.
     * コスト計算（音声生成用）。
     *
     * @param characters Number of billable characters
     * @param voiceType Type of voice (standard, wavenet, neural2, studio)
     * @param pricePerMillion Price per million characters (default: Neural2 rate $16)
     * @returns Estimated cost in USD
     */
    static calculateCost(
        characters: number,
        voiceType: "standard" | "wavenet" | "neural2" | "studio" = "neural2",
        pricePerMillion?: number
    ): number {
        // Default pricing per million characters
        const defaultPrices = {
            standard: 4.0,
            wavenet: 16.0,
            neural2: 16.0,
            studio: 160.0,
        };

        const price = pricePerMillion ?? defaultPrices[voiceType];
        return (characters / 1000000) * price;
    }

    /**
     * Converts output format to TTS audio encoding.
     * 出力フォーマットをTTS音声エンコーディングに変換する。
     *
     * @param format Output format ("mp3", "wav", "ogg")
     * @returns Audio encoding for TTS API
     */
    private getAudioEncoding(format: string): "MP3" | "LINEAR16" | "OGG_OPUS" {
        switch (format.toLowerCase()) {
            case "mp3":
                return "MP3";
            case "wav":
                return "LINEAR16";
            case "ogg":
                return "OGG_OPUS";
            default:
                return "MP3"; // default to MP3
        }
    }
}
