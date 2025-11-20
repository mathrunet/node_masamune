import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { VertexAI } from "@google-cloud/vertexai";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import Ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { HttpFunctionsOptions } from "../lib/src/functions_base";

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

                    // Generate video for each scene
                    const sceneVideoPaths: string[] = [];
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

                        // Create video from image with effects
                        const sceneVideoPath = path.join(tmpDir, `scene_${i}.mp4`);
                        const effect = getFFmpegEffect(scene.visual.effect, scene.duration);

                        await new Promise<void>((resolve, reject) => {
                            Ffmpeg()
                                .input(imagePath)
                                .loop(scene.duration)
                                .fps(25)
                                .videoFilters(effect)
                                .outputOptions([
                                    "-pix_fmt", "yuv420p",
                                    "-c:v", "libx264",
                                    "-preset", "medium",
                                    "-crf", "23",
                                    `-t ${scene.duration}`
                                ])
                                .output(sceneVideoPath)
                                .on("start", (cmd) => {
                                    console.log(`FFmpeg command: ${cmd.substring(0, 200)}...`);
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
