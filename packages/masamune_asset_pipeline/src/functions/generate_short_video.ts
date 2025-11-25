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
 */
function getFFmpegEffect(effect: { type: string; intensity: string }, duration: number, width: number = 1920, height: number = 1080) {
    const intensityMultipliers = { low: 1.0, medium: 1.5, high: 2.0 };
    const multiplier = intensityMultipliers[effect.intensity as keyof typeof intensityMultipliers] || 1.0;

    switch (effect.type) {
        case "zoom_in":
            return `zoompan=z='min(zoom+0.0015*${multiplier},1.5)':d=${duration * 25}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
        case "zoom_out":
            return `zoompan=z='max(zoom-0.0015*${multiplier},1.0)':d=${duration * 25}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
        case "pan_left":
            return `zoompan=z=1.2:d=${duration * 25}:x='if(gte(on,1),x-${2 * multiplier},0)':s=${width}x${height}`;
        case "pan_right":
            return `zoompan=z=1.2:d=${duration * 25}:x='if(gte(on,1),x+${2 * multiplier},0)':s=${width}x${height}`;
        case "slide_up":
            return `zoompan=z=1.2:d=${duration * 25}:y='if(gte(on,1),y-${2 * multiplier},0)':s=${width}x${height}`;
        case "slide_down":
            return `zoompan=z=1.2:d=${duration * 25}:y='if(gte(on,1),y+${2 * multiplier},0)':s=${width}x${height}`;
        case "static":
        default:
            return `scale=${width}:${height}`;
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

    try {
        // Generate music prompt based on bgmFileId and atmosphere
        // Lyria generates 30-second clips, which works well for our scenes
        const musicPrompt = `${musicAtmosphere}, instrumental background music, cinematic, high quality`;

        await generateBGMWithLyria(projectId, region, musicPrompt, outputPath);
        console.log(`BGM generated successfully with Lyria: ${outputPath}`);
    } catch (error: any) {
        console.warn(`Failed to generate BGM with Lyria: ${error.message}`);
        console.warn(`Full error:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        if (error.response) {
            console.warn(`Lyria API Response:`, error.response.data || error.response.statusText);
        }
        console.log("Falling back to silent audio");

        // Fallback: create silent audio
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

                    // Generate video for each scene
                    const sceneVideoPaths: string[] = [];
                    const audioFiles: string[] = []; // Track audio files for Cloud Storage upload

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
                        try {
                            await generateNarration(scene.audio.narration_text, narrationPath, language);
                            audioFiles.push(narrationPath);
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
                        }

                        // Prepare BGM
                        const bgmPath = path.join(audioDir, `bgm_${i}.mp3`);
                        const musicAtmosphere = assetData?.shortVideoOverview?.musicAtmosphere || "cinematic orchestral";
                        try {
                            await prepareBGM(
                                projectId,
                                region,
                                scene.audio.bgm_file_id,
                                musicAtmosphere,
                                bgmPath,
                                scene.duration
                            );
                            audioFiles.push(bgmPath);
                        } catch (error: any) {
                            console.error(`Failed to prepare BGM for scene ${i}:`, error);
                        }

                        // Create video from image with effects and audio
                        const sceneVideoPath = path.join(tmpDir, `scene_${i}.mp4`);
                        const effect = getFFmpegEffect(scene.visual.effect, scene.duration);

                        await new Promise<void>((resolve, reject) => {
                            const ffmpegCommand = Ffmpeg()
                                .input(imagePath)
                                .loop(scene.duration)
                                .fps(25)
                                .videoFilters(effect)
                                .input(narrationPath) // Add narration
                                .input(bgmPath); // Add BGM

                            ffmpegCommand
                                .complexFilter([
                                    // Mix narration and BGM
                                    "[1:a][2:a]amix=inputs=2:duration=first:dropout_transition=2,volume=2[aout]"
                                ])
                                .outputOptions([
                                    "-map", "0:v",  // Use video from first input
                                    "-map", "[aout]", // Use mixed audio
                                    "-pix_fmt", "yuv420p",
                                    "-c:v", "libx264",
                                    "-c:a", "aac",
                                    "-b:a", "192k",
                                    "-preset", "medium",
                                    "-crf", "23",
                                    `-t ${scene.duration}`
                                ])
                                .output(sceneVideoPath)
                                .on("start", (cmd) => {
                                    console.log(`FFmpeg command: ${cmd.substring(0, 200)}...`);
                                })
                                .on("end", () => {
                                    console.log(`Scene ${i + 1} video with audio created: ${sceneVideoPath}`);
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

                    // Concatenate all scene videos
                    console.log(`\nConcatenating ${sceneVideoPaths.length} scene videos...`);
                    const concatListPath = path.join(tmpDir, "concat_list.txt");
                    const concatList = sceneVideoPaths.map(p => `file '${p}'`).join("\n");
                    fs.writeFileSync(concatListPath, concatList);

                    await new Promise<void>((resolve, reject) => {
                        Ffmpeg()
                            .input(concatListPath)
                            .inputOptions(["-f", "concat", "-safe", "0"])
                            .outputOptions([
                                "-c", "copy"
                            ])
                            .output(outputVideoPath)
                            .on("end", () => {
                                console.log("Final video created successfully");
                                resolve();
                            })
                            .on("error", (err: Error) => {
                                console.error("FFmpeg concatenation error:", err);
                                reject(err);
                            })
                            .run();
                    });

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
