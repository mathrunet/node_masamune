import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { VertexAI, SchemaType } from "@google-cloud/vertexai";
import { HttpFunctionsOptions } from "@mathrunet/masamune";

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => {
    return functions.https.onCall({
        region: options.region ?? regions,
        timeoutSeconds: options.timeoutSeconds,
        memory: options.memory,
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

            const data = query.data;
            const requestId = data.requestId;

            if (!requestId) {
                throw new functions.https.HttpsError("invalid-argument", "The function must be called with a requestId.");
            }

            const firestore = admin.firestore();
            const requestDocRef = firestore.collection("plugins/asset/request").doc(requestId);

            try {
                const requestDoc = await requestDocRef.get();
                if (!requestDoc.exists) {
                    throw new functions.https.HttpsError("not-found", "Request document not found.");
                }

                const requestData = requestDoc.data();
                const assetId = requestData?.assetId;

                if (!assetId) {
                    throw new functions.https.HttpsError("failed-precondition", "Asset ID not found in request.");
                }

                const assetDocRef = firestore.collection("plugins/asset/asset").doc(assetId);
                const assetDoc = await assetDocRef.get();

                if (!assetDoc.exists) {
                    throw new functions.https.HttpsError("not-found", "Asset document not found.");
                }

                const assetData = assetDoc.data();
                const theme = assetData?.theme;
                const title = assetData?.title;
                const report = assetData?.report;

                if (!theme || !report) {
                    throw new functions.https.HttpsError("failed-precondition", "Theme or report not found in asset.");
                }

                // Initialize Vertex AI
                const vertexAI = new VertexAI({ project: projectId, location: region });

                const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
                const model = vertexAI.preview.getGenerativeModel({
                    model: modelName,
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: SchemaType.OBJECT,
                            properties: {
                                videoMetadata: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        title: { type: SchemaType.STRING },
                                        description: { type: SchemaType.STRING },
                                        promotionText: { type: SchemaType.STRING },
                                        keywords: {
                                            type: SchemaType.ARRAY,
                                            items: { type: SchemaType.STRING }
                                        },
                                        language: { type: SchemaType.STRING }
                                    },
                                    required: ["title", "description", "promotionText", "keywords", "language"]
                                },
                                shortVideoOverview: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        details: { type: SchemaType.STRING },
                                        visualAtmosphere: { type: SchemaType.STRING },
                                        musicAtmosphere: { type: SchemaType.STRING }
                                    },
                                    required: ["details", "visualAtmosphere", "musicAtmosphere"]
                                },
                                shortVideoDetails: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        scenes: {
                                            type: SchemaType.ARRAY,
                                            items: {
                                                type: SchemaType.OBJECT,
                                                properties: {
                                                    visual: {
                                                        type: SchemaType.OBJECT,
                                                        properties: {
                                                            image_query: { type: SchemaType.STRING },
                                                            effect: {
                                                                type: SchemaType.OBJECT,
                                                                properties: {
                                                                    type: {
                                                                        type: SchemaType.STRING,
                                                                        enum: ["zoom_in", "zoom_out", "pan_left", "pan_right", "static", "slide_up", "slide_down"]
                                                                    },
                                                                    intensity: {
                                                                        type: SchemaType.STRING,
                                                                        enum: ["low", "medium", "high"]
                                                                    }
                                                                },
                                                                required: ["type", "intensity"]
                                                            },
                                                            transition: {
                                                                type: SchemaType.OBJECT,
                                                                properties: {
                                                                    type: {
                                                                        type: SchemaType.STRING,
                                                                        enum: ["crossfade", "fade_black", "wipe", "none"]
                                                                    },
                                                                    duration: { type: SchemaType.NUMBER }
                                                                },
                                                                required: ["type", "duration"]
                                                            }
                                                        },
                                                        required: ["image_query", "effect", "transition"]
                                                    },
                                                    audio: {
                                                        type: SchemaType.OBJECT,
                                                        properties: {
                                                            narration_text: { type: SchemaType.STRING },
                                                            se_file_ids: {
                                                                type: SchemaType.ARRAY,
                                                                items: { type: SchemaType.STRING }
                                                            }
                                                        },
                                                        required: ["narration_text", "se_file_ids"]
                                                    },
                                                    duration: { type: SchemaType.NUMBER }
                                                },
                                                required: ["visual", "audio", "duration"]
                                            }
                                        },
                                        bgmTracks: {
                                            type: SchemaType.ARRAY,
                                            items: {
                                                type: SchemaType.OBJECT,
                                                properties: {
                                                    prompt: { type: SchemaType.STRING },
                                                    startScene: { type: SchemaType.INTEGER },
                                                    endScene: { type: SchemaType.INTEGER },
                                                    fadeInDuration: { type: SchemaType.NUMBER },
                                                    fadeOutDuration: { type: SchemaType.NUMBER },
                                                    volume: { type: SchemaType.NUMBER }
                                                },
                                                required: ["prompt", "startScene", "endScene", "fadeInDuration", "fadeOutDuration", "volume"]
                                            }
                                        }
                                    },
                                    required: ["scenes", "bgmTracks"]
                                }
                            },
                            required: ["videoMetadata", "shortVideoOverview", "shortVideoDetails"]
                        }
                    }
                });

                const prompt = `
You are a professional video content creator specializing in creating engaging 60-second short videos.
Based on the research report below, create comprehensive metadata for a short video (approximately 60 seconds).

Theme: ${theme}
Title: ${title}

Research Report:
${report}

Please create:

1. **Video Metadata** (for platform upload):
   - title: Catchy, SEO-optimized title (max 100 characters)
   - description: Engaging description (150-300 characters)
   - promotionText: Hook text for social media (max 280 characters)
   - keywords: Array of 5-10 relevant keywords
   - language: "en", "ja", etc.

2. **Short Video Overview**:
   - details: Brief overview of the video content
   - visualAtmosphere: Description of visual style (e.g., "dramatic, high-contrast, cinematic")
   - musicAtmosphere: Description of music style (e.g., "epic orchestral with traditional Japanese instruments")

3. **Short Video Details**:

   **3.1 Scenes** - Create 3-5 scenes totaling ~60 seconds:
   For each scene, provide:
   - visual.image_query: Detailed description for image generation (be specific: composition, lighting, colors, style)
   - visual.effect.type: One of: "zoom_in", "zoom_out", "pan_left", "pan_right", "static", "slide_up", "slide_down"
   - visual.effect.intensity: "low", "medium", or "high"
   - visual.transition.type: One of: "crossfade", "fade_black", "wipe", "none"
   - visual.transition.duration: Transition duration in seconds (0.5-2.0)
   - audio.narration_text: Compelling narration (conversational, engaging, fast-paced)
   - audio.se_file_ids: Array of sound effects (e.g., ["sword_clash_01", "fire_whoosh_01"])
   - duration: Scene duration in seconds (10-20 seconds per scene)

   **3.2 BGM Tracks** - Define background music independently from scenes:
   IMPORTANT: BGM tracks are SEPARATE from scene cuts. A single BGM track typically spans multiple scenes.
   For short videos (~60 seconds), usually 1-2 BGM tracks are sufficient.

   For each BGM track, provide:
   - prompt: Descriptive prompt for AI music generation (describe mood, instruments, tempo, texture - avoid generic terms like "epic orchestral")
     Example: "Mysterious ambient soundscape with soft piano notes, ethereal pads, and subtle string textures. Slow tempo, contemplative mood."
   - startScene: Scene index where this BGM starts (0-based)
   - endScene: Scene index where this BGM ends (inclusive, 0-based)
   - fadeInDuration: Fade in duration in seconds (0.5-2.0)
   - fadeOutDuration: Fade out duration in seconds (0.5-2.0)
   - volume: Volume level (0.3-0.8, where 0.5 is normal - lower for narration-heavy sections)

IMPORTANT GUIDELINES:
- Make it highly engaging and dopamine-inducing
- Use fast-paced editing and dynamic visuals
- Include impactful sound effects
- Narration should be punchy and enthusiastic
- Total duration should be 50-70 seconds
- Each scene should have a clear visual hook
- Use dramatic transitions between scenes
- BGM should flow continuously across scene transitions (this is key for professional short videos!)
- For most short videos, a single BGM track spanning all scenes works best
- Only use multiple BGM tracks if there's a clear mood shift in the video

Output in the specified JSON format.
`;

                const result = await model.generateContent(prompt);
                const response = result.response;
                const text = response.candidates?.[0].content.parts[0].text;

                if (!text) {
                    throw new Error("Failed to generate content from Gemini.");
                }

                const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
                console.log("Raw Gemini response:", cleanedText);

                const firstBrace = cleanedText.indexOf("{");
                const lastBrace = cleanedText.lastIndexOf("}");

                if (firstBrace === -1 || lastBrace === -1) {
                    throw new Error("No JSON object found in response.");
                }

                const jsonText = cleanedText.substring(firstBrace, lastBrace + 1);
                const json = JSON.parse(jsonText);

                // Validate the structure
                if (!json.videoMetadata || !json.shortVideoOverview || !json.shortVideoDetails) {
                    throw new Error("Invalid response structure from Gemini.");
                }

                // Update Firestore with the generated metadata
                await assetDocRef.update({
                    videoMetadata: json.videoMetadata,
                    shortVideoOverview: json.shortVideoOverview,
                    shortVideoDetails: json.shortVideoDetails,
                    status: "short_video_metadata_completed",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                await requestDocRef.update({ status: "short_video_metadata_completed" });

                console.log("Short video metadata generation completed successfully");

                return { success: true, assetId: assetId };

            } catch (error: any) {
                console.error("Error in generateShortVideoMetadata:", error);
                await requestDocRef.update({ status: "short_video_metadata_failed", error: error.message });
                throw new functions.https.HttpsError("internal", "Failed to generate short video metadata.", error);
            }
        });
};
