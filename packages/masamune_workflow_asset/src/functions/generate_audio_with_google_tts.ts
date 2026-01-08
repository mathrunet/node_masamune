/**
 * A function for generating audio using Google Cloud Text-to-Speech.
 *
 * Google Cloud Text-to-Speechを使用して音声を生成するためのFunction。
 */
import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, WorkflowContext } from "@mathrunet/masamune_workflow";
import { GoogleTTSService } from "../services/google_tts_service";
import { StorageService } from "../services/storage_service";
import {
    GoogleTTSCommandData,
    GeneratedAudioResult,
    GeneratedAudioAsset,
    AudioGenerationResults,
} from "../models/text_to_speech";
import "@mathrunet/masamune";

/**
 * Default values for audio generation.
 */
const DEFAULTS = {
    OUTPUT_FORMAT: "mp3",
    SPEAKING_RATE: 1.0,
    PITCH: 0.0,
    VOLUME_GAIN_DB: 0.0,
    OUTPUT_PREFIX: "generated-audio",
    PRICE_PER_MILLION: 16.0, // Neural2 voices
};

/**
 * A function for generating audio using Google Cloud Text-to-Speech.
 * Google Cloud Text-to-Speechを使用して音声を生成するためのFunction。
 */
export class GenerateAudioWithGoogleTTS extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     * 関数のID。
     */
    id: string = "generate_audio_with_google_tts";

    /**
     * The process of the function.
     *
     * @param context The context of the function.
     * @returns The action of the function.
     */
    async process(context: WorkflowContext): Promise<Action> {
        const action = context.action;

        // 1. Get command data
        const commandData = action.command?.data as GoogleTTSCommandData | undefined;
        const text = commandData?.text;

        // 2. Validate required parameters
        if (!text) {
            console.error("GenerateAudioWithGoogleTTS: No text provided");
            throw new Error("text is required");
        }

        // Validate voice selection parameters
        if (!commandData?.voice_name && !(commandData?.language && commandData?.gender)) {
            console.error("GenerateAudioWithGoogleTTS: No voice selection parameters provided");
            throw new Error("Either voice_name or both language and gender are required");
        }

        // 3. Get environment configuration
        const projectId = process.env.GCLOUD_PROJECT ||
            process.env.GOOGLE_CLOUD_PROJECT ||
            process.env.GCP_PROJECT_ID;
        const storageBucket = process.env.STORAGE_BUCKET ||
            `${projectId}.appspot.com`;

        // Pricing configuration
        const pricePerMillion = Number(process.env.TTS_PRICE_PER_MILLION || DEFAULTS.PRICE_PER_MILLION);

        if (!projectId) {
            console.error("GenerateAudioWithGoogleTTS: No GCP project ID found");
            throw new Error("GCP project ID is required");
        }

        try {
            // 4. Initialize services
            const ttsService = new GoogleTTSService({ projectId });
            const storageService = new StorageService(storageBucket);

            // 5. Voice selection logic
            let voiceName: string | undefined;
            let languageCode: string | undefined;
            let ssmlGender: "MALE" | "FEMALE" | "NEUTRAL" | undefined;

            if (commandData.voice_name) {
                voiceName = commandData.voice_name;
                // Extract language code from voice name (e.g., "ja-JP-Neural2-A" -> "ja-JP")
                const match = commandData.voice_name.match(/^([a-z]{2}-[A-Z]{2})/);
                if (match) {
                    languageCode = match[1];
                }
            } else {
                languageCode = commandData.language;
                ssmlGender = commandData.gender;
            }

            // 6. Generate audio using Google TTS
            const format = commandData.output_format || DEFAULTS.OUTPUT_FORMAT;
            const speakingRate = commandData.speaking_rate ?? DEFAULTS.SPEAKING_RATE;
            const pitch = commandData.pitch ?? DEFAULTS.PITCH;
            const volumeGainDb = commandData.volume_gain_db ?? DEFAULTS.VOLUME_GAIN_DB;

            console.log(`GenerateAudioWithGoogleTTS: Generating audio with ${text.length} characters...`);
            console.log(`  Voice: ${voiceName || `${languageCode} ${ssmlGender}`}`);
            console.log(`  Format: ${format}`);

            const response = await ttsService.generateAudio({
                text,
                voiceName,
                languageCode,
                ssmlGender,
                audioEncoding: this.getAudioEncodingFromFormat(format),
                speakingRate,
                pitch,
                volumeGainDb,
            });

            // 7. Determine output path and content type
            const outputPath = commandData.output_path ||
                StorageService.generatePath(DEFAULTS.OUTPUT_PREFIX, format);
            const contentType = this.getContentType(format);

            // 8. Upload to Firebase Storage
            console.log(`GenerateAudioWithGoogleTTS: Uploading to ${storageBucket}/${outputPath}`);

            const uploadResult = await storageService.uploadFile(response.audioBuffer, {
                bucket: storageBucket,
                path: outputPath,
                contentType,
                makePublic: true,
            });

            // 9. Calculate cost
            const voiceType = this.detectVoiceType(commandData.voice_name);
            const cost = GoogleTTSService.calculateCost(
                response.characters,
                voiceType,
                pricePerMillion
            );

            // 10. Build results
            const audioResult: GeneratedAudioResult = {
                duration: this.estimateDuration(response.characters, speakingRate),
                format,
                size: response.audioBuffer.length,
                characters: response.characters,
            };

            const audioResults: AudioGenerationResults = {
                files: [audioResult],
                characters: response.characters,
                cost,
            };

            const generatedAsset: GeneratedAudioAsset = {
                url: uploadResult.gsUrl,
                public_url: uploadResult.publicUrl,
                content_type: contentType,
            };

            // 11. Return action with results and assets
            console.log(`GenerateAudioWithGoogleTTS: Successfully generated audio`);
            console.log(`  URL: ${uploadResult.gsUrl}`);
            console.log(`  Size: ${response.audioBuffer.length} bytes`);
            console.log(`  Characters: ${response.characters}`);
            console.log(`  Cost: $${cost.toFixed(6)}`);

            return {
                ...action,
                usage: (action.usage ?? 0) + cost,
                results: {
                    audioGeneration: audioResults,
                },
                assets: {
                    generatedAudio: generatedAsset,
                },
            };
        } catch (error: any) {
            console.error("GenerateAudioWithGoogleTTS: Failed to generate audio", error);
            throw error;
        }
    }

    /**
     * Gets the content type for a given audio format.
     * 音声フォーマットに対応するContent-Typeを取得する。
     *
     * @param format Audio format ("mp3", "wav", "ogg")
     * @returns MIME type
     */
    private getContentType(format: string): string {
        switch (format.toLowerCase()) {
            case "mp3":
                return "audio/mpeg";
            case "wav":
                return "audio/wav";
            case "ogg":
                return "audio/ogg";
            default:
                return "audio/mpeg";
        }
    }

    /**
     * Gets the audio encoding from output format.
     * 出力フォーマットから音声エンコーディングを取得する。
     *
     * @param format Output format
     * @returns Audio encoding
     */
    private getAudioEncodingFromFormat(format: string): "MP3" | "LINEAR16" | "OGG_OPUS" {
        switch (format.toLowerCase()) {
            case "mp3":
                return "MP3";
            case "wav":
                return "LINEAR16";
            case "ogg":
                return "OGG_OPUS";
            default:
                return "MP3";
        }
    }

    /**
     * Detects voice type from voice name for cost calculation.
     * ボイスタイプを検出する（コスト計算用）。
     *
     * @param voiceName Voice name
     * @returns Voice type
     */
    private detectVoiceType(voiceName?: string): "standard" | "wavenet" | "neural2" | "studio" {
        if (!voiceName) return "neural2"; // Default to Neural2
        if (voiceName.includes("Neural2")) return "neural2";
        if (voiceName.includes("Wavenet")) return "wavenet";
        if (voiceName.includes("Studio")) return "studio";
        return "standard";
    }

    /**
     * Estimates audio duration based on character count and speaking rate.
     * 文字数と話速から音声の長さを推定する。
     *
     * @param characters Number of characters
     * @param speakingRate Speaking rate
     * @returns Estimated duration in seconds
     */
    private estimateDuration(characters: number, speakingRate: number): number {
        // Baseline: ~100 characters per minute (Japanese)
        const baseCharsPerMinute = 100;
        const adjustedCharsPerMinute = baseCharsPerMinute * speakingRate;
        return (characters / adjustedCharsPerMinute) * 60; // Convert to seconds
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new GenerateAudioWithGoogleTTS(options).build(regions);

// Export class for testing
module.exports.GenerateAudioWithGoogleTTS = GenerateAudioWithGoogleTTS;
