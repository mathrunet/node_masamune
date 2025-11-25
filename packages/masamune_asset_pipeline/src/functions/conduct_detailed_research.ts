import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { VertexAI, SchemaType } from "@google-cloud/vertexai";
import { HttpFunctionsOptions } from "@mathrunet/masamune";

/**
 * Determines the next function to call based on asset type
 */
function getNextFunctionName(assetType: string): string {
    const functionMap: { [key: string]: string } = {
        short_video: "generateShortVideoMetadata",
        long_video: "generateVideoMetadata",
        manga: "generateMangaMetadata",
        image: "generateImageMetadata"
    };
    return functionMap[assetType] || "unknown";
}

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

                if (!theme) {
                    throw new functions.https.HttpsError("failed-precondition", "Theme not found in asset.");
                }

                // Initialize Vertex AI
                const vertexAI = new VertexAI({ project: projectId, location: region });

                const modelName = process.env.GEMINI_MODEL || "gemini-2.5-pro";
                const model = vertexAI.preview.getGenerativeModel({
                    model: modelName,
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: SchemaType.OBJECT,
                            properties: {
                                title: { type: SchemaType.STRING },
                                report: { type: SchemaType.STRING },
                                assetType: {
                                    type: SchemaType.STRING,
                                    enum: ["short_video", "long_video", "manga", "image"]
                                },
                                assetTypeReason: { type: SchemaType.STRING }
                            },
                            required: ["title", "report", "assetType", "assetTypeReason"]
                        }
                    },
                    tools: [{
                        // @ts-ignore
                        googleSearch: {}
                    }]
                });

                const prompt = `
            You are a professional researcher conducting deep research for content creation.
            Based on the following theme, please conduct detailed research using Google Search and generate a comprehensive research report.

            The report must contain enough information to create a 10-15 minute video or detailed visual content.
            Include:
            - Historical background and context
            - Key facts, statistics, and data points
            - Interesting anecdotes and stories
            - Visual descriptions (for image/video creation)
            - Timeline of events (if applicable)
            - Character/person descriptions (if applicable)
            - Multiple perspectives and viewpoints
            - Current relevance and impact

            Theme: ${theme}

            Additionally, determine the most suitable asset type for this content:
            - short_video: For 60-second impactful content (trending topics, quick facts)
            - long_video: For 10-15 minute comprehensive explanations (deep dives, documentaries)
            - manga: For story-based or character-driven narratives
            - image: For single concept visualization (infographics, art)

            Please output in the following JSON format:
            {
                "title": "Report Title",
                "report": "Detailed Research Report with multiple sections...",
                "assetType": "short_video|long_video|manga|image",
                "assetTypeReason": "Explanation for why this asset type was chosen"
            }
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

                // Validate asset type
                const validAssetTypes = ["short_video", "long_video", "manga", "image"];
                if (!validAssetTypes.includes(json.assetType)) {
                    throw new Error(`Invalid asset type: ${json.assetType}`);
                }

                await assetDocRef.update({
                    title: json.title,
                    report: json.report,
                    assetType: json.assetType,
                    assetTypeReason: json.assetTypeReason,
                    status: "detailed_research_completed",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                await requestDocRef.update({ status: "detailed_research_completed" });

                // Trigger next process based on asset type
                // Note: These functions will be implemented in future phases
                const nextFunctionName = getNextFunctionName(json.assetType);
                console.log(`Next function to call: ${nextFunctionName}`);

                // TODO: Actually call the next function when they are implemented
                // Example: await admin.functions().httpsCallable(nextFunctionName)({ requestId });

                return {
                    success: true,
                    assetId: assetId,
                    assetType: json.assetType,
                    nextFunction: nextFunctionName
                };

            } catch (error: any) {
                console.error("Error in conductDetailedResearch:", error);
                await requestDocRef.update({ status: "detailed_research_failed", error: error.message });
                throw new functions.https.HttpsError("internal", "Failed to conduct detailed research.", error);
            }
        });
};
