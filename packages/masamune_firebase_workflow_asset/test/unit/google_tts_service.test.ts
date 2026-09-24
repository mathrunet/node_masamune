import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { GoogleTTSService } from "../../src/services/google_tts_service";

jest.mock("@google-cloud/text-to-speech", () => ({
    TextToSpeechClient: jest.fn(),
}));

describe("Google TTS request mapping", () => {
    const synthesizeSpeech = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (TextToSpeechClient as unknown as jest.Mock).mockImplementation(() => ({ synthesizeSpeech }));
    });

    it("sends plain text with the selected voice and returns audio metadata", async () => {
        synthesizeSpeech.mockResolvedValue([{ audioContent: Buffer.from("audio") }]);
        const service = new GoogleTTSService({ projectId: "demo-project" });

        const result = await service.generateAudio({
            text: "Hello",
            languageCode: "en-US",
            voiceName: "en-US-Neural2-A",
            audioEncoding: "MP3",
        });

        expect(synthesizeSpeech).toHaveBeenCalledWith({
            input: { text: "Hello" },
            voice: { languageCode: "en-US", name: "en-US-Neural2-A" },
            audioConfig: { audioEncoding: "MP3" },
        });
        expect(result).toEqual({
            audioBuffer: Buffer.from("audio"),
            audioEncoding: "MP3",
            characters: 5,
        });
    });

    it("sends SSML as SSML and rejects an empty provider response", async () => {
        synthesizeSpeech.mockResolvedValue([{}]);
        const service = new GoogleTTSService({ projectId: "demo-project" });

        await expect(service.generateAudio({
            text: "<speak>Hello</speak>",
            audioEncoding: "MP3",
        })).rejects.toThrow("No audio content in response");
        expect(synthesizeSpeech).toHaveBeenCalledWith({
            input: { ssml: "<speak>Hello</speak>" },
            voice: {},
            audioConfig: { audioEncoding: "MP3" },
        });
    });
});
