import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { VertexAI } from "@google-cloud/vertexai";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import Ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { GoogleAuth } from "google-auth-library";

// Set ffmpeg binary path
if (ffmpegStatic && typeof Ffmpeg.setFfmpegPath === "function") {
    Ffmpeg.setFfmpegPath(ffmpegStatic as string);
}

/**
 * Maps visual effect types to FFmpeg filter configurations
 *
 * Key improvements:
 * 1. Animation spans the full duration by calculating increment based on duration
 * 2. Image is scaled to fill frame without black bars using scale+crop
 * 3. Pan movements stay within image bounds
 *
 * zoompan filter notes:
 * - z: zoom factor (1.0 = original size, >1 = zoom in)
 * - d: total frames
 * - x,y: position of output window's top-left corner on the zoomed input
 * - s: output size
 * - The zoomed input size is (iw*zoom, ih*zoom)
 * - Center position: x = (iw*zoom - ow)/2, y = (ih*zoom - oh)/2
 */
// Global log array to collect effect calculation details
let effectCalculationLogs: string[] = [];

function clearEffectLogs() {
    effectCalculationLogs = [];
}

function getEffectLogs(): string[] {
    return effectCalculationLogs;
}

function logEffectCalculation(message: string) {
    effectCalculationLogs.push(message);
    console.log(message);
}

/**
 * Generates FFmpeg filter for visual effects using scale+crop approach.
 * This avoids issues with zoompan's 'on' variable resetting with looped input.
 *
 * For pan/slide effects: scale image larger, then crop with time-based position.
 * For zoom effects: use zoompan (works reliably for zoom).
 */
function getFFmpegEffect(effect: { type: string; intensity: string }, duration: number, width: number = 1920, height: number = 1080) {
    const intensityMultipliers = { low: 0.15, medium: 0.25, high: 0.35 };
    const multiplier = intensityMultipliers[effect.intensity as keyof typeof intensityMultipliers] || 0.25;

    const fps = 25;
    const totalFrames = duration * fps;

    // Base zoom to ensure image fills the frame (accounts for different aspect ratios)
    const baseZoom = 1.2;

    logEffectCalculation(`\n========== Effect Calculation ==========`);
    logEffectCalculation(`Effect Type: ${effect.type}`);
    logEffectCalculation(`Intensity: ${effect.intensity}`);
    logEffectCalculation(`Duration: ${duration}s`);
    logEffectCalculation(`FPS: ${fps}`);
    logEffectCalculation(`Total Frames: ${totalFrames}`);
    logEffectCalculation(`Output Size: ${width}x${height}`);
    logEffectCalculation(`Base Zoom: ${baseZoom}`);

    switch (effect.type) {
        case "zoom_in": {
            // For zoom effects, zoompan works reliably with static zoom position
            const startZoom = baseZoom;
            const endZoom = baseZoom + multiplier;
            const zoomIncrement = (endZoom - startZoom) / totalFrames;
            logEffectCalculation(`--- Zoom In ---`);
            logEffectCalculation(`Start Zoom: ${startZoom}`);
            logEffectCalculation(`End Zoom: ${endZoom}`);
            logEffectCalculation(`Zoom Increment per frame: ${zoomIncrement}`);
            // Use zoompan with d=1 so each input frame produces 1 output frame
            // The -loop 1 -framerate 25 will provide 25 frames per second
            const filter = `zoompan=z='${startZoom}+on*${zoomIncrement}':d=1:x='(iw*zoom-${width})/2':y='(ih*zoom-${height})/2':s=${width}x${height}:fps=${fps}`;
            logEffectCalculation(`Filter: ${filter}`);
            return filter;
        }
        case "zoom_out": {
            const startZoom = baseZoom + multiplier;
            const endZoom = baseZoom;
            const zoomDecrement = (startZoom - endZoom) / totalFrames;
            logEffectCalculation(`--- Zoom Out ---`);
            logEffectCalculation(`Start Zoom: ${startZoom}`);
            logEffectCalculation(`End Zoom: ${endZoom}`);
            logEffectCalculation(`Zoom Decrement per frame: ${zoomDecrement}`);
            const filter = `zoompan=z='${startZoom}-on*${zoomDecrement}':d=1:x='(iw*zoom-${width})/2':y='(ih*zoom-${height})/2':s=${width}x${height}:fps=${fps}`;
            logEffectCalculation(`Filter: ${filter}`);
            return filter;
        }
        case "pan_left": {
            // Use scale+crop with time-based expression instead of zoompan
            // This avoids 'on' variable reset issues
            const panZoom = baseZoom + 0.5;
            const scaledWidth = Math.round(width * panZoom);
            const scaledHeight = Math.round(height * panZoom);
            const centerX = Math.round((scaledWidth - width) / 2);
            const centerY = Math.round((scaledHeight - height) / 2);
            const maxPanRange = Math.floor(centerX * 0.9);
            const panRangePercent = { low: 0.15, medium: 0.22, high: 0.30 };
            const desiredPanRange = Math.round(width * (panRangePercent[effect.intensity as keyof typeof panRangePercent] || 0.22));
            const panRange = Math.min(desiredPanRange, maxPanRange);
            const startX = centerX + panRange;
            // Pixels per second for time-based expression
            const pixelsPerSecond = (panRange * 2) / duration;

            logEffectCalculation(`--- Pan Left (scale+crop) ---`);
            logEffectCalculation(`Pan Zoom: ${panZoom}`);
            logEffectCalculation(`Scaled Size: ${scaledWidth}x${scaledHeight}`);
            logEffectCalculation(`Center X: ${centerX}, Center Y: ${centerY}`);
            logEffectCalculation(`Max Pan Range: ${maxPanRange}`);
            logEffectCalculation(`Actual Pan Range: ${panRange}`);
            logEffectCalculation(`Start X: ${startX}`);
            logEffectCalculation(`Pixels per Second: ${pixelsPerSecond}`);

            // scale to larger size, then crop with x position decreasing over time
            const filter = `scale=${scaledWidth}:${scaledHeight},crop=${width}:${height}:'${startX}-t*${pixelsPerSecond}':'${centerY}'`;
            logEffectCalculation(`Filter: ${filter}`);
            return filter;
        }
        case "pan_right": {
            const panZoom = baseZoom + 0.5;
            const scaledWidth = Math.round(width * panZoom);
            const scaledHeight = Math.round(height * panZoom);
            const centerX = Math.round((scaledWidth - width) / 2);
            const centerY = Math.round((scaledHeight - height) / 2);
            const maxPanRange = Math.floor(centerX * 0.9);
            const panRangePercent = { low: 0.15, medium: 0.22, high: 0.30 };
            const desiredPanRange = Math.round(width * (panRangePercent[effect.intensity as keyof typeof panRangePercent] || 0.22));
            const panRange = Math.min(desiredPanRange, maxPanRange);
            const startX = centerX - panRange;
            const pixelsPerSecond = (panRange * 2) / duration;

            logEffectCalculation(`--- Pan Right (scale+crop) ---`);
            logEffectCalculation(`Pan Zoom: ${panZoom}`);
            logEffectCalculation(`Scaled Size: ${scaledWidth}x${scaledHeight}`);
            logEffectCalculation(`Center X: ${centerX}, Center Y: ${centerY}`);
            logEffectCalculation(`Max Pan Range: ${maxPanRange}`);
            logEffectCalculation(`Actual Pan Range: ${panRange}`);
            logEffectCalculation(`Start X: ${startX}`);
            logEffectCalculation(`Pixels per Second: ${pixelsPerSecond}`);

            // scale to larger size, then crop with x position increasing over time
            const filter = `scale=${scaledWidth}:${scaledHeight},crop=${width}:${height}:'${startX}+t*${pixelsPerSecond}':'${centerY}'`;
            logEffectCalculation(`Filter: ${filter}`);
            return filter;
        }
        case "slide_up": {
            const panZoom = baseZoom + 0.5;
            const scaledWidth = Math.round(width * panZoom);
            const scaledHeight = Math.round(height * panZoom);
            const centerX = Math.round((scaledWidth - width) / 2);
            const centerY = Math.round((scaledHeight - height) / 2);
            const maxPanRange = Math.floor(centerY * 0.9);
            const panRangePercent = { low: 0.15, medium: 0.22, high: 0.30 };
            const desiredPanRange = Math.round(height * (panRangePercent[effect.intensity as keyof typeof panRangePercent] || 0.22));
            const panRange = Math.min(desiredPanRange, maxPanRange);
            const startY = centerY + panRange;
            const pixelsPerSecond = (panRange * 2) / duration;

            logEffectCalculation(`--- Slide Up (scale+crop) ---`);
            logEffectCalculation(`Pan Zoom: ${panZoom}`);
            logEffectCalculation(`Scaled Size: ${scaledWidth}x${scaledHeight}`);
            logEffectCalculation(`Center X: ${centerX}, Center Y: ${centerY}`);
            logEffectCalculation(`Max Pan Range: ${maxPanRange}`);
            logEffectCalculation(`Actual Pan Range: ${panRange}`);
            logEffectCalculation(`Start Y: ${startY}`);
            logEffectCalculation(`Pixels per Second: ${pixelsPerSecond}`);

            const filter = `scale=${scaledWidth}:${scaledHeight},crop=${width}:${height}:'${centerX}':'${startY}-t*${pixelsPerSecond}'`;
            logEffectCalculation(`Filter: ${filter}`);
            return filter;
        }
        case "slide_down": {
            const panZoom = baseZoom + 0.5;
            const scaledWidth = Math.round(width * panZoom);
            const scaledHeight = Math.round(height * panZoom);
            const centerX = Math.round((scaledWidth - width) / 2);
            const centerY = Math.round((scaledHeight - height) / 2);
            const maxPanRange = Math.floor(centerY * 0.9);
            const panRangePercent = { low: 0.15, medium: 0.22, high: 0.30 };
            const desiredPanRange = Math.round(height * (panRangePercent[effect.intensity as keyof typeof panRangePercent] || 0.22));
            const panRange = Math.min(desiredPanRange, maxPanRange);
            const startY = centerY - panRange;
            const pixelsPerSecond = (panRange * 2) / duration;

            logEffectCalculation(`--- Slide Down (scale+crop) ---`);
            logEffectCalculation(`Pan Zoom: ${panZoom}`);
            logEffectCalculation(`Scaled Size: ${scaledWidth}x${scaledHeight}`);
            logEffectCalculation(`Center X: ${centerX}, Center Y: ${centerY}`);
            logEffectCalculation(`Max Pan Range: ${maxPanRange}`);
            logEffectCalculation(`Actual Pan Range: ${panRange}`);
            logEffectCalculation(`Start Y: ${startY}`);
            logEffectCalculation(`Pixels per Second: ${pixelsPerSecond}`);

            const filter = `scale=${scaledWidth}:${scaledHeight},crop=${width}:${height}:'${centerX}':'${startY}+t*${pixelsPerSecond}'`;
            logEffectCalculation(`Filter: ${filter}`);
            return filter;
        }
        case "static":
        default: {
            // Simple scale for static
            const scaledWidth = Math.round(width * baseZoom);
            const scaledHeight = Math.round(height * baseZoom);
            const centerX = Math.round((scaledWidth - width) / 2);
            const centerY = Math.round((scaledHeight - height) / 2);
            logEffectCalculation(`--- Static (scale+crop) ---`);
            const filter = `scale=${scaledWidth}:${scaledHeight},crop=${width}:${height}:${centerX}:${centerY}`;
            logEffectCalculation(`Filter: ${filter}`);
            return filter;
        }
    }
}

/**
 * Determines the appropriate temp directory based on environment
 * In test environment, uses project's tmp folder for easier inspection
 * In production, uses system temp directory
 */
function getTempDirectory(): string {
    if (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID) {
        // Test environment - use project tmp folder
        const projectTmpDir = path.join(__dirname, "../../tmp");
        if (!fs.existsSync(projectTmpDir)) {
            fs.mkdirSync(projectTmpDir, { recursive: true });
        }
        return projectTmpDir;
    }
    // Production environment - use system temp
    return os.tmpdir();
}

/**
 * Generates an image using Gemini 2.0 Flash (with image generation capability)
 */
async function generateImage(projectId: string, region: string, prompt: string, outputPath: string): Promise<void> {
    const vertexAI = new VertexAI({ project: projectId, location: region });

    // Use Gemini 2.5 Flash with image generation
    const model = vertexAI.preview.getGenerativeModel({
        model: "gemini-2.5-flash-image"
    });

    console.log(`Generating image with prompt: ${prompt.substring(0, 100)}...`);

    // Request image generation from Gemini 2.0 Flash
    const imagePrompt = `Generate a high-quality, cinematic 16:9 image: ${prompt}`;
    const result = await model.generateContent(imagePrompt);

    // Extract image data from response
    const response = result.response;

    // Look for inline image data in the response
    let imagePart = null;
    if (response.candidates && response.candidates.length > 0) {
        for (const candidate of response.candidates) {
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    // @ts-ignore - accessing inlineData
                    if (part.inlineData) {
                        imagePart = part;
                        break;
                    }
                }
            }
            if (imagePart) break;
        }
    }

    if (!imagePart || !imagePart.inlineData) {
        throw new Error("No image data in Gemini response");
    }

    // @ts-ignore - accessing inlineData
    const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    fs.writeFileSync(outputPath, imageBuffer);
    console.log(`Image saved to: ${outputPath}`);
}

/**
 * Improves a music prompt using AI to avoid Lyria recitation checks
 * @param projectId - GCP project ID
 * @param region - GCP region
 * @param originalPrompt - The original prompt that failed
 * @param errorMessage - The error message from Lyria API
 * @returns Improved prompt that is more likely to pass recitation checks
 */
async function improveMusicPromptWithAI(
    projectId: string,
    region: string,
    originalPrompt: string,
    errorMessage: string
): Promise<string> {
    const vertexAI = new VertexAI({ project: projectId, location: region });

    const model = vertexAI.getGenerativeModel({
        model: "gemini-2.0-flash"
    });

    const systemPrompt = `You are a music prompt engineer specializing in AI music generation.
Your task is to rewrite music prompts to avoid "recitation checks" that block generation of music too similar to existing copyrighted works.

Guidelines for rewriting prompts:
1. Avoid generic genre terms like "epic orchestral", "cinematic trailer", "Hans Zimmer style"
2. Instead, describe specific musical elements: instruments, tempo, mood, textures
3. Use abstract and creative descriptions rather than referencing known styles
4. Focus on unique combinations of elements
5. Add specific production techniques (e.g., "layered synthesizers", "ambient pads", "staccato strings")
6. Specify emotional qualities rather than genre labels

Return ONLY the improved prompt text, nothing else.`;

    const userPrompt = `The following music generation prompt was blocked by recitation checks:
Original prompt: "${originalPrompt}"
Error: "${errorMessage}"

Please rewrite this prompt to be more original and avoid triggering recitation checks while maintaining the intended mood and style.`;

    console.log(`Improving music prompt with AI...`);

    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: { role: "system", parts: [{ text: systemPrompt }] }
    });

    const response = result.response;
    const improvedPrompt = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!improvedPrompt) {
        throw new Error("Failed to generate improved prompt from AI");
    }

    console.log(`AI improved prompt: ${improvedPrompt.substring(0, 100)}...`);
    return improvedPrompt;
}

/**
 * Generates background music using Lyria (Google's music generation AI)
 */
async function generateBGMWithLyria(projectId: string, region: string, prompt: string, outputPath: string): Promise<void> {
    console.log(`Generating BGM with Lyria for prompt: ${prompt.substring(0, 100)}...`);

    // Get access token using Service Account credentials from environment variable
    // This approach avoids Jest ESM import issues with GoogleAuth file-based credentials
    let accessToken: string;

    try {
        const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
        if (!serviceAccountJson) {
            throw new Error("GOOGLE_SERVICE_ACCOUNT environment variable is not set");
        }

        console.log("Using service account from GOOGLE_SERVICE_ACCOUNT environment variable");

        // Parse service account JSON and use GoogleAuth with credentials object
        // This avoids dynamic import issues that occur with file-based credentials
        const auth = new GoogleAuth({
            credentials: JSON.parse(serviceAccountJson),
            scopes: ["https://www.googleapis.com/auth/cloud-platform"]
        });

        const client = await auth.getClient();
        const token = await client.getAccessToken();

        if (!token || !token.token) {
            throw new Error("Failed to obtain access token from service account");
        }

        accessToken = token.token;
        console.log("Successfully obtained access token from service account");
    } catch (authError: any) {
        console.error(`Authentication failed: ${authError.message}`);
        console.error(`Error stack: ${authError.stack}`);
        throw new Error(`Failed to authenticate with service account: ${authError.message}`);
    }

    // Call Lyria API
    const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/lyria-002:predict`;

    const requestBody = {
        instances: [
            {
                prompt: prompt
            }
        ],
        parameters: {
            sample_count: 1
        }
    };

    const nodeFetch = require("node-fetch");
    const response = await nodeFetch(endpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Lyria API error (${response.status}): ${errorText}`);
        throw new Error(`Lyria API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();

    console.log("Lyria API response structure:", JSON.stringify(result, null, 2));

    if (!result.predictions || result.predictions.length === 0) {
        console.error("No predictions in Lyria response");
        throw new Error("No audio generated by Lyria");
    }

    console.log("Prediction[0] structure:", JSON.stringify(result.predictions[0], null, 2));

    // Lyria API returns audio in 'bytesBase64Encoded' field, not 'audioContent'
    const audioContent = result.predictions[0].bytesBase64Encoded || result.predictions[0].audioContent;

    if (!audioContent) {
        console.error("No audio data in prediction. Available keys:", Object.keys(result.predictions[0]));
        throw new Error("No audio data in Lyria prediction response");
    }

    // Extract base64 encoded WAV audio
    const audioBuffer = Buffer.from(audioContent, "base64");

    // Save as temporary WAV file
    const tempWavPath = outputPath.replace(".mp3", ".wav");
    fs.writeFileSync(tempWavPath, audioBuffer);

    console.log(`Lyria WAV audio saved: ${tempWavPath}`);

    // Convert WAV to MP3 using FFmpeg
    await new Promise<void>((resolve, reject) => {
        Ffmpeg(tempWavPath)
            .outputOptions([
                "-acodec", "libmp3lame",
                "-ab", "128k"
            ])
            .output(outputPath)
            .on("end", () => {
                // Clean up temporary WAV file
                if (fs.existsSync(tempWavPath)) {
                    fs.unlinkSync(tempWavPath);
                }
                console.log(`BGM converted to MP3: ${outputPath}`);
                resolve();
            })
            .on("error", (err: Error) => {
                // Clean up on error
                if (fs.existsSync(tempWavPath)) {
                    fs.unlinkSync(tempWavPath);
                }
                reject(err);
            })
            .run();
    });
}

/**
 * Generates narration audio using Google Cloud TTS
 */
async function generateNarration(text: string, outputPath: string, language: string = "en-US"): Promise<void> {
    const ttsClient = new TextToSpeechClient();

    // Select voice based on language
    const voiceConfig: any = {
        languageCode: language,
        name: language === "ja-JP" ? "ja-JP-Neural2-C" : "en-US-Neural2-C",
        ssmlGender: "FEMALE" // Changed from NEUTRAL to FEMALE (NEUTRAL not supported)
    };

    const request = {
        input: { text: text },
        voice: voiceConfig,
        audioConfig: {
            audioEncoding: "MP3" as const,
            speakingRate: 1.0,
            pitch: 0.0
        }
    };

    console.log(`Generating narration: ${text.substring(0, 50)}...`);

    const [response] = await ttsClient.synthesizeSpeech(request);

    if (!response.audioContent) {
        throw new Error("No audio content in TTS response");
    }

    fs.writeFileSync(outputPath, response.audioContent, "binary");
    console.log(`Narration saved to: ${outputPath}`);
}

/**
 * Generates or retrieves BGM audio file using Lyria or from storage
 * If recitation check fails, uses AI to improve the prompt and retries
 * Loops the generated audio to match the required duration (Lyria generates ~30s max)
 */
async function prepareBGM(
    projectId: string,
    region: string,
    bgmFileId: string,
    musicAtmosphere: string,
    outputPath: string,
    duration: number
): Promise<void> {
    console.log(`Preparing BGM: ${bgmFileId} with atmosphere: ${musicAtmosphere} for ${duration} seconds`);

    const maxRetries = 3;
    // Add "seamless loop" instruction to encourage loopable music
    let currentPrompt = `Create original ${musicAtmosphere} style instrumental music. Design for seamless looping with consistent rhythm and no abrupt changes. Use synthesizers, ambient textures, and modern production techniques. No vocals.`;
    let lastError: Error | null = null;

    // Generate to a temporary file first, then loop to final output
    const tempBgmPath = outputPath.replace(".mp3", "_temp.mp3");

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`BGM generation attempt ${attempt}/${maxRetries}`);
            await generateBGMWithLyria(projectId, region, currentPrompt, tempBgmPath);
            console.log(`BGM generated successfully with Lyria: ${tempBgmPath}`);

            // Loop the generated BGM to match the required duration
            await loopAudioToLength(tempBgmPath, outputPath, duration);

            // Clean up temp file
            if (fs.existsSync(tempBgmPath)) {
                fs.unlinkSync(tempBgmPath);
            }

            return; // Success, exit the function
        } catch (error: any) {
            lastError = error;
            const errorMessage = error.message || "";

            console.warn(`Attempt ${attempt} failed: ${errorMessage}`);

            // Check if this is a recitation check error
            const isRecitationError = errorMessage.toLowerCase().includes("recitation") ||
                errorMessage.includes("blocked");

            if (isRecitationError && attempt < maxRetries) {
                console.log(`Recitation check detected. Using AI to improve prompt...`);
                try {
                    currentPrompt = await improveMusicPromptWithAI(
                        projectId,
                        region,
                        currentPrompt,
                        errorMessage
                    );
                    // Add looping instruction to the improved prompt
                    currentPrompt += " Design for seamless looping.";
                    console.log(`Retrying with improved prompt: ${currentPrompt.substring(0, 100)}...`);
                } catch (aiError: any) {
                    console.warn(`Failed to improve prompt with AI: ${aiError.message}`);
                    // Continue with modified prompt manually
                    currentPrompt = `Ambient electronic soundscape with layered synthesizers, evolving pads, and subtle rhythmic elements. Abstract and atmospheric. No vocals. Unique composition. Design for seamless looping.`;
                }
            } else if (!isRecitationError) {
                // Non-recitation error, don't retry
                console.warn(`Non-recitation error, skipping retries`);
                break;
            }
        }
    }

    // Clean up temp file if exists
    if (fs.existsSync(tempBgmPath)) {
        fs.unlinkSync(tempBgmPath);
    }

    // All retries failed, fall back to silent audio
    console.warn(`All ${maxRetries} attempts failed. Last error: ${lastError?.message}`);
    console.log("Falling back to silent audio");

    await new Promise<void>((resolve, reject) => {
        Ffmpeg()
            .input("anullsrc=r=44100:cl=stereo")
            .inputFormat("lavfi")
            .outputOptions([
                "-t", duration.toString(),
                "-acodec", "libmp3lame",
                "-ab", "128k"
            ])
            .output(outputPath)
            .on("end", () => {
                console.log(`Silent BGM created as fallback: ${outputPath}`);
                resolve();
            })
            .on("error", (err: Error) => reject(err))
            .run();
    });
}

/**
 * Generates subtitle file in SRT format
 */
function generateSubtitles(scenes: any[]): string {
    let srtContent = "";
    let index = 1;
    let currentTime = 0;

    for (const scene of scenes) {
        const startTime = currentTime;
        const endTime = currentTime + scene.duration;

        // Format time as HH:MM:SS,mmm
        const formatTime = (seconds: number) => {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            const ms = Math.floor((seconds % 1) * 1000);
            return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
        };

        srtContent += `${index}\n`;
        srtContent += `${formatTime(startTime)} --> ${formatTime(endTime)}\n`;
        srtContent += `${scene.audio.narration_text}\n\n`;

        index++;
        currentTime = endTime;
    }

    return srtContent;
}

/**
 * Gets the duration of an audio file using FFmpeg
 */
async function getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
        Ffmpeg(filePath)
            .output(os.platform() === "win32" ? "NUL" : "/dev/null")
            .outputFormat("null")
            .on("codecData", (data) => {
                if (data && data.duration) {
                    const parts = data.duration.split(":");
                    const seconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
                    resolve(seconds);
                } else {
                    resolve(0);
                }
            })
            .on("error", () => {
                // Ignore errors here as we just want metadata
                resolve(0);
            })
            .run();
    });
}

/**
 * Loops an audio file to match the required duration
 * Lyria API generates ~30 seconds of audio, so we need to loop for longer durations
 * Uses concat demuxer for more reliable looping
 */
async function loopAudioToLength(inputPath: string, outputPath: string, targetDuration: number): Promise<void> {
    const actualDuration = await getAudioDuration(inputPath);

    if (actualDuration <= 0) {
        console.warn(`Could not determine duration of ${inputPath}, using file as-is`);
        fs.copyFileSync(inputPath, outputPath);
        return;
    }

    console.log(`Audio duration: ${actualDuration}s, target: ${targetDuration}s`);

    if (actualDuration >= targetDuration) {
        // Audio is long enough, just trim it with crossfade at the end
        await new Promise<void>((resolve, reject) => {
            Ffmpeg(inputPath)
                .outputOptions([
                    "-t", targetDuration.toString(),
                    "-acodec", "libmp3lame",
                    "-ab", "128k"
                ])
                .output(outputPath)
                .on("end", () => {
                    console.log(`Audio trimmed to ${targetDuration}s: ${outputPath}`);
                    resolve();
                })
                .on("error", (err: Error) => reject(err))
                .run();
        });
        return;
    }

    // Calculate how many times we need to loop
    const loopCount = Math.ceil(targetDuration / actualDuration);
    console.log(`Looping audio ${loopCount} times to reach ${targetDuration}s`);

    // Create a concat list file for looping
    const tmpDir = path.dirname(outputPath);
    const concatListPath = path.join(tmpDir, `loop_concat_${Date.now()}.txt`);

    // Write concat list with the input file repeated
    const concatList = Array(loopCount).fill(`file '${inputPath}'`).join("\n");
    fs.writeFileSync(concatListPath, concatList);

    // Use concat demuxer to loop, then trim to exact duration
    await new Promise<void>((resolve, reject) => {
        Ffmpeg()
            .input(concatListPath)
            .inputOptions(["-f", "concat", "-safe", "0"])
            .outputOptions([
                "-t", targetDuration.toString(),
                "-acodec", "libmp3lame",
                "-ab", "128k"
            ])
            .output(outputPath)
            .on("end", () => {
                // Clean up concat list
                if (fs.existsSync(concatListPath)) {
                    fs.unlinkSync(concatListPath);
                }
                console.log(`Audio looped to ${targetDuration}s: ${outputPath}`);
                resolve();
            })
            .on("error", (err: Error) => {
                // Clean up concat list on error
                if (fs.existsSync(concatListPath)) {
                    fs.unlinkSync(concatListPath);
                }
                reject(err);
            })
            .run();
    });
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => {
    return functions.https.onCall({
        region: options.region ?? regions,
        timeoutSeconds: options.timeoutSeconds || 540, // 9 minutes for video generation
        memory: options.memory || "2GiB",
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
        serviceAccount: options?.serviceAccount ?? undefined,
        enforceAppCheck: options.enforceAppCheck ?? undefined,
        consumeAppCheckToken: options.consumeAppCheckToken ?? undefined,
    },
        async (query) => {
            const projectId = process.env.GCP_PROJECT_ID;
            if (!projectId) {
                throw new functions.https.HttpsError("internal", "GCP_PROJECT_ID is not set.");
            }
            const region = options.region ? (Array.isArray(options.region) ? options.region[0] : options.region) : regions[0];
            if (!region) {
                throw new functions.https.HttpsError("internal", "Region is not set.");
            }

            const requestData = query.data;
            const requestId = requestData.requestId;

            if (!requestId) {
                throw new functions.https.HttpsError("invalid-argument", "The function must be called with a requestId.");
            }

            const firestore = admin.firestore();
            const storage = admin.storage();
            const requestDocRef = firestore.collection("plugins/asset/request").doc(requestId);

            try {
                const requestDoc = await requestDocRef.get();
                if (!requestDoc.exists) {
                    throw new functions.https.HttpsError("not-found", "Request document not found.");
                }

                const requestDataFromDb = requestDoc.data();
                const assetId = requestDataFromDb?.assetId;

                if (!assetId) {
                    throw new functions.https.HttpsError("failed-precondition", "Asset ID not found in request.");
                }

                const assetDocRef = firestore.collection("plugins/asset/asset").doc(assetId);
                const assetDoc = await assetDocRef.get();

                if (!assetDoc.exists) {
                    throw new functions.https.HttpsError("not-found", "Asset document not found.");
                }

                const assetData = assetDoc.data();
                const shortVideoDetails = assetData?.shortVideoDetails;

                if (!shortVideoDetails || !shortVideoDetails.scenes) {
                    throw new functions.https.HttpsError("failed-precondition", "Short video details not found in asset.");
                }

                console.log(`Starting short video generation for asset: ${assetId}`);
                console.log(`Number of scenes: ${shortVideoDetails.scenes.length}`);

                // Create temporary directory for processing
                const baseTmpDir = getTempDirectory();
                const tmpDir = path.join(baseTmpDir, `short_video_${assetId}_${Date.now()}`);
                fs.mkdirSync(tmpDir, { recursive: true });
                console.log(`Using temp directory: ${tmpDir}`);

                try {
                    const outputVideoPath = path.join(tmpDir, "output.mp4");
                    const outputSubtitlePath = path.join(tmpDir, "subtitles.srt");

                    // Generate subtitles
                    const subtitles = generateSubtitles(shortVideoDetails.scenes);
                    fs.writeFileSync(outputSubtitlePath, subtitles);

                    // Calculate total duration
                    const totalDuration = shortVideoDetails.scenes.reduce(
                        (sum: number, scene: any) => sum + (scene.duration || 0),
                        0
                    );

                    console.log(`Starting video generation for ${shortVideoDetails.scenes.length} scenes`);

                    // Create audio directory for this asset
                    const audioDir = path.join(tmpDir, "audio");
                    fs.mkdirSync(audioDir, { recursive: true });

                    // Get language from video metadata
                    const language = assetData?.videoMetadata?.language === "ja" ? "ja-JP" : "en-US";

                    // Calculate scene start times for BGM positioning
                    const sceneStartTimes: number[] = [];
                    let currentStartTime = 0;
                    for (const scene of shortVideoDetails.scenes) {
                        sceneStartTimes.push(currentStartTime);
                        currentStartTime += scene.duration;
                    }

                    // Generate BGM tracks first (independent from scenes)
                    const bgmTracks = shortVideoDetails.bgmTracks || [];
                    const bgmFiles: { path: string; startTime: number; endTime: number; fadeIn: number; fadeOut: number; volume: number }[] = [];
                    const audioFiles: string[] = []; // Track audio files for Cloud Storage upload

                    console.log(`\nGenerating ${bgmTracks.length} BGM tracks...`);
                    for (let i = 0; i < bgmTracks.length; i++) {
                        const bgmTrack = bgmTracks[i];
                        const bgmPath = path.join(audioDir, `bgm_${i}.mp3`);

                        // Calculate BGM duration based on scene range
                        const startSceneIdx = Math.max(0, Math.min(bgmTrack.startScene, shortVideoDetails.scenes.length - 1));
                        const endSceneIdx = Math.max(0, Math.min(bgmTrack.endScene, shortVideoDetails.scenes.length - 1));
                        const bgmStartTime = sceneStartTimes[startSceneIdx];
                        const bgmEndTime = sceneStartTimes[endSceneIdx] + shortVideoDetails.scenes[endSceneIdx].duration;
                        const bgmDuration = bgmEndTime - bgmStartTime;

                        console.log(`BGM track ${i + 1}: scenes ${startSceneIdx}-${endSceneIdx}, time ${bgmStartTime}s-${bgmEndTime}s (${bgmDuration}s)`);

                        try {
                            await prepareBGM(
                                projectId,
                                region,
                                `bgm_track_${i}`,
                                bgmTrack.prompt,
                                bgmPath,
                                bgmDuration
                            );
                            audioFiles.push(bgmPath);
                            bgmFiles.push({
                                path: bgmPath,
                                startTime: bgmStartTime,
                                endTime: bgmEndTime,
                                fadeIn: bgmTrack.fadeInDuration || 1.0,
                                fadeOut: bgmTrack.fadeOutDuration || 1.0,
                                volume: bgmTrack.volume || 0.5
                            });
                        } catch (error: any) {
                            console.error(`Failed to generate BGM track ${i}:`, error);
                        }
                    }

                    // Generate video for each scene (with narration only, no BGM)
                    const sceneVideoPaths: string[] = [];

                    // Clear effect logs before processing scenes
                    clearEffectLogs();

                    for (let i = 0; i < shortVideoDetails.scenes.length; i++) {
                        const scene = shortVideoDetails.scenes[i];
                        console.log(`\nProcessing scene ${i + 1}/${shortVideoDetails.scenes.length}`);

                        // Generate image for this scene
                        const imagePath = path.join(tmpDir, `scene_${i}.png`);
                        const imagePrompt = `${scene.visual.image_query}. High quality, cinematic, detailed, professional photography, 16:9 aspect ratio`;

                        try {
                            await generateImage(projectId, region, imagePrompt, imagePath);
                        } catch (error: any) {
                            console.error(`Failed to generate image for scene ${i}:`, error);
                            // Create a fallback colored background if image generation fails
                            const colors = ["blue", "green", "red", "purple", "orange"];
                            const color = colors[i % colors.length];
                            await new Promise<void>((resolve, reject) => {
                                Ffmpeg()
                                    .input(`color=c=${color}:s=1920x1080:d=1`)
                                    .inputFormat("lavfi")
                                    .outputOptions(["-frames:v", "1"])
                                    .output(imagePath)
                                    .on("end", () => resolve())
                                    .on("error", (err: Error) => reject(err))
                                    .run();
                            });
                        }

                        // Generate narration audio
                        const narrationPath = path.join(audioDir, `narration_${i}.mp3`);
                        let narrationDuration = 0;
                        try {
                            await generateNarration(scene.audio.narration_text, narrationPath, language);
                            audioFiles.push(narrationPath);
                            narrationDuration = await getAudioDuration(narrationPath);
                        } catch (error: any) {
                            console.error(`Failed to generate narration for scene ${i}:`, error);
                            // Create silent audio as fallback
                            await new Promise<void>((resolve, reject) => {
                                Ffmpeg()
                                    .input("anullsrc=r=44100:cl=mono")
                                    .inputFormat("lavfi")
                                    .outputOptions(["-t", scene.duration.toString(), "-acodec", "libmp3lame"])
                                    .output(narrationPath)
                                    .on("end", () => resolve())
                                    .on("error", (err: Error) => reject(err))
                                    .run();
                            });
                            narrationDuration = scene.duration;
                        }

                        // Calculate delays for narration - position it within the scene
                        let preDelay = 0;
                        if (narrationDuration < scene.duration) {
                            const diff = scene.duration - narrationDuration;
                            preDelay = diff * 0.2; // 20% wait before narration starts
                        }

                        // Create a properly timed audio track for this scene
                        // First, pad the narration to exactly match scene duration
                        const paddedNarrationPath = path.join(audioDir, `narration_${i}_padded.mp3`);
                        const preDelayMs = Math.round(preDelay * 1000);

                        await new Promise<void>((resolve, reject) => {
                            Ffmpeg()
                                .input(narrationPath)
                                .complexFilter([
                                    // Add delay at the start, then pad with silence to reach scene duration
                                    `[0:a]adelay=${preDelayMs}|${preDelayMs},apad=whole_dur=${scene.duration}[padded]`
                                ])
                                .outputOptions([
                                    "-map", "[padded]",
                                    "-t", scene.duration.toString(),
                                    "-acodec", "libmp3lame",
                                    "-ab", "192k"
                                ])
                                .output(paddedNarrationPath)
                                .on("end", () => {
                                    console.log(`Padded narration created for scene ${i + 1}`);
                                    resolve();
                                })
                                .on("error", (err: Error) => {
                                    console.error(`Failed to pad narration for scene ${i}:`, err);
                                    reject(err);
                                })
                                .run();
                        });

                        // Create video from image with effects and the padded narration
                        const sceneVideoPath = path.join(tmpDir, `scene_${i}.mp4`);
                        const effect = getFFmpegEffect(scene.visual.effect, scene.duration);

                        // Scale and crop image to exactly 1920x1080 before applying zoompan
                        // This ensures consistent coordinates regardless of AI-generated image size
                        // Combine filters into a single string to avoid fluent-ffmpeg escaping issues
                        const scaleFilter = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080";
                        const combinedFilter = `${scaleFilter},${effect}`;
                        console.log(`Scene ${i + 1} filter: ${combinedFilter}`);

                        await new Promise<void>((resolve, reject) => {
                            // -loop 1: loop the static image infinitely
                            // -framerate 25: set input framerate to match output fps
                            // For zoom effects (d=1), each input frame produces 1 output frame
                            // For pan/slide effects (scale+crop with 't'), time variable works correctly
                            Ffmpeg()
                                .input(imagePath)
                                .inputOptions(["-loop", "1", "-framerate", "25"])
                                .videoFilters(combinedFilter)
                                .input(paddedNarrationPath)
                                .outputOptions([
                                    "-map", "0:v",
                                    "-map", "1:a",
                                    "-pix_fmt", "yuv420p",
                                    "-c:v", "libx264",
                                    "-c:a", "aac",
                                    "-ar", "44100",
                                    "-ac", "2",
                                    "-b:a", "192k",
                                    "-preset", "medium",
                                    "-crf", "23",
                                    "-t", scene.duration.toString()
                                ])
                                .output(sceneVideoPath)
                                .on("start", (cmd) => {
                                    console.log(`FFmpeg command for scene ${i + 1}: ${cmd}`);
                                })
                                .on("end", () => {
                                    console.log(`Scene ${i + 1} video created: ${sceneVideoPath}`);
                                    resolve();
                                })
                                .on("error", (err: Error) => {
                                    console.error(`FFmpeg error for scene ${i}:`, err);
                                    reject(err);
                                })
                                .run();
                        });

                        sceneVideoPaths.push(sceneVideoPath);
                    }

                    // Save effect calculation logs to file for debugging
                    const effectLogPath = path.join(tmpDir, "effect_calculations.log");
                    fs.writeFileSync(effectLogPath, getEffectLogs().join("\n"));
                    console.log(`Effect calculation logs saved to: ${effectLogPath}`);

                    // Concatenate all scene videos (without BGM)
                    console.log(`\nConcatenating ${sceneVideoPaths.length} scene videos...`);
                    const concatListPath = path.join(tmpDir, "concat_list.txt");
                    const concatList = sceneVideoPaths.map(p => `file '${p}'`).join("\n");
                    fs.writeFileSync(concatListPath, concatList);

                    // First, concatenate scenes without BGM
                    // Re-encode audio to ensure proper merging (concat demuxer can have issues with audio streams)
                    const concatVideoPath = path.join(tmpDir, "concat_video.mp4");
                    await new Promise<void>((resolve, reject) => {
                        Ffmpeg()
                            .input(concatListPath)
                            .inputOptions(["-f", "concat", "-safe", "0"])
                            .outputOptions([
                                "-c:v", "copy",
                                "-c:a", "aac",
                                "-ar", "44100",
                                "-ac", "2",
                                "-b:a", "192k"
                            ])
                            .output(concatVideoPath)
                            .on("end", () => {
                                console.log("Concatenated video created (without BGM)");
                                resolve();
                            })
                            .on("error", (err: Error) => {
                                console.error("FFmpeg concatenation error:", err);
                                reject(err);
                            })
                            .run();
                    });

                    // Add BGM tracks to the final video
                    if (bgmFiles.length > 0) {
                        console.log(`\nMixing ${bgmFiles.length} BGM tracks into final video...`);

                        // Build FFmpeg complex filter for BGM mixing
                        const ffmpegCommand = Ffmpeg().input(concatVideoPath);

                        // Add each BGM file as input
                        for (const bgm of bgmFiles) {
                            ffmpegCommand.input(bgm.path);
                        }

                        // Build complex filter
                        const filterParts: string[] = [];
                        const bgmOutputs: string[] = [];

                        for (let i = 0; i < bgmFiles.length; i++) {
                            const bgm = bgmFiles[i];
                            const inputIdx = i + 1; // 0 is video, 1+ are BGMs
                            const fadeOutStart = Math.max(0, (bgm.endTime - bgm.startTime) - bgm.fadeOut);
                            const delayMs = Math.round(bgm.startTime * 1000);

                            // Apply fade in/out, delay, and volume adjustment
                            filterParts.push(
                                `[${inputIdx}:a]afade=t=in:st=0:d=${bgm.fadeIn},afade=t=out:st=${fadeOutStart}:d=${bgm.fadeOut},volume=${bgm.volume},adelay=${delayMs}|${delayMs}[bgm${i}]`
                            );
                            bgmOutputs.push(`[bgm${i}]`);
                        }

                        // Mix all BGM tracks with the original audio
                        const mixInputs = `[0:a]${bgmOutputs.join("")}`;
                        filterParts.push(
                            `${mixInputs}amix=inputs=${bgmFiles.length + 1}:duration=first:dropout_transition=2,volume=${1 + bgmFiles.length * 0.5}[aout]`
                        );

                        await new Promise<void>((resolve, reject) => {
                            ffmpegCommand
                                .complexFilter(filterParts)
                                .outputOptions([
                                    "-map", "0:v",
                                    "-map", "[aout]",
                                    "-c:v", "copy",
                                    "-c:a", "aac",
                                    "-ar", "44100",
                                    "-ac", "2",
                                    "-b:a", "192k"
                                ])
                                .output(outputVideoPath)
                                .on("start", (cmd) => {
                                    console.log(`BGM mixing command: ${cmd.substring(0, 300)}...`);
                                })
                                .on("end", () => {
                                    console.log("Final video with BGM created successfully");
                                    resolve();
                                })
                                .on("error", (err: Error) => {
                                    console.error("FFmpeg BGM mixing error:", err);
                                    reject(err);
                                })
                                .run();
                        });
                    } else {
                        // No BGM tracks, just rename the concatenated video
                        console.log("No BGM tracks, using concatenated video as final");
                        fs.renameSync(concatVideoPath, outputVideoPath);
                    }

                    console.log("Video generation completed successfully");

                    // Upload video to Cloud Storage
                    const bucket = storage.bucket();
                    const videoFileName = `assets/${assetId}/short_video.mp4`;
                    const subtitleFileName = `assets/${assetId}/subtitles.srt`;

                    await bucket.upload(outputVideoPath, {
                        destination: videoFileName,
                        metadata: {
                            contentType: "video/mp4",
                        },
                    });

                    await bucket.upload(outputSubtitlePath, {
                        destination: subtitleFileName,
                        metadata: {
                            contentType: "text/plain",
                        },
                    });

                    // Upload audio files to Cloud Storage
                    console.log(`\nUploading ${audioFiles.length} audio files to Cloud Storage...`);
                    for (const audioFile of audioFiles) {
                        const audioFileName = `assets/${assetId}/audio/${path.basename(audioFile)}`;
                        await bucket.upload(audioFile, {
                            destination: audioFileName,
                            metadata: {
                                contentType: "audio/mpeg",
                            },
                        });
                        console.log(`Audio uploaded: gs://${bucket.name}/${audioFileName}`);
                    }

                    const videoUrl = `gs://${bucket.name}/${videoFileName}`;
                    const subtitleUrl = `gs://${bucket.name}/${subtitleFileName}`;

                    console.log(`Video uploaded: ${videoUrl}`);
                    console.log(`Subtitles uploaded: ${subtitleUrl}`);

                    // Update Firestore
                    await assetDocRef.update({
                        videoUrl: videoUrl,
                        subtitleUrl: subtitleUrl,
                        videoDuration: totalDuration,
                        status: "short_video_completed",
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    await requestDocRef.update({ status: "short_video_completed" });

                    return {
                        success: true,
                        assetId: assetId,
                        videoUrl: videoUrl,
                        subtitleUrl: subtitleUrl,
                        videoDuration: totalDuration
                    };

                } finally {
                    // Copy effect calculation logs to test/tmp before cleanup (for debugging)
                    const effectLogPath = path.join(tmpDir, "effect_calculations.log");
                    if (fs.existsSync(effectLogPath) && (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID)) {
                        const testTmpDir = path.join(__dirname, "../../test/tmp");
                        if (!fs.existsSync(testTmpDir)) {
                            fs.mkdirSync(testTmpDir, { recursive: true });
                        }
                        const destLogPath = path.join(testTmpDir, `effect_calculations_${assetId}.log`);
                        fs.copyFileSync(effectLogPath, destLogPath);
                        console.log(`Effect logs copied to: ${destLogPath}`);
                    }

                    // Cleanup temporary files
                    if (fs.existsSync(tmpDir)) {
                        fs.rmSync(tmpDir, { recursive: true, force: true });
                    }
                }

            } catch (error: any) {
                console.error("Error in generateShortVideo:", error);
                await requestDocRef.update({ status: "short_video_failed", error: error.message });
                throw new functions.https.HttpsError("internal", "Failed to generate short video.", error);
            }
        });
};
