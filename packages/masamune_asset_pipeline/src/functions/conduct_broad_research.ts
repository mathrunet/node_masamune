import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { VertexAI, SchemaType } from "@google-cloud/vertexai";
import { HttpFunctionsOptions } from "@mathrunet/masamune";

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => functions.https.onCall(
    {
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

        // Initialize Vertex AI
        const vertexAI = new VertexAI({ project: projectId, location: region });

        const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-pro";

        const data = query.data;
        const requestId = data.requestId;

        if (!requestId) {
            throw new functions.https.HttpsError("invalid-argument", "The function must be called with a requestId.");
        }

        const firestore = admin.firestore();
        const requestDocRef = firestore.collection("plugins/asset/request").doc(requestId);
        const requestDoc = await requestDocRef.get();

        if (!requestDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Request document not found.");
        }

        const requestData = requestDoc.data();
        const channelTheme = requestData?.channelTheme;

        if (!channelTheme) {
            throw new functions.https.HttpsError("failed-precondition", "Channel theme is missing.");
        }

        try {
            // Update status to processing
            await requestDocRef.update({ status: "broad_research_processing" });

            // Use Gemini to generate themes
            const model = vertexAI.preview.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            themes: {
                                type: SchemaType.ARRAY,
                                items: {
                                    type: SchemaType.STRING
                                }
                            }
                        },
                        required: ["themes"]
                    }
                },
                tools: [{
                    // @ts-ignore
                    googleSearch: {}
                }]
            });

            const prompt = `
            You are a professional video planner.
            Based on the channel theme "${channelTheme}", please propose 3 specific themes for new videos.
            The themes should be suitable for creating 10-15 minute videos.
            
            Output the result in the following JSON format:
            {
                "themes": [
                    "Theme 1",
                    "Theme 2",
                    "Theme 3"
                ]
            }
            `;

            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.candidates?.[0].content.parts[0].text;

            if (!text) {
                throw new Error("Failed to generate content from Gemini.");
            }

            const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
            const json = JSON.parse(cleanedText);
            const themes = json.themes;

            // TODO: Check for duplicates using vector search (Phase 2)
            // For now, just pick the first one
            const selectedTheme = themes[0];

            // Save the selected theme to a new asset document
            const assetDocRef = firestore.collection("plugins/asset/asset").doc();
            await assetDocRef.set({
                requestId: requestId,
                theme: selectedTheme,
                channelTheme: channelTheme,
                status: "broad_research_completed",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Update request status
            await requestDocRef.update({ status: "broad_research_completed", assetId: assetDocRef.id });

            return { success: true, selectedTheme: selectedTheme, assetId: assetDocRef.id };

        } catch (error: any) {
            console.error("Error in conductBroadResearch:", error);
            await requestDocRef.update({ status: "broad_research_failed", error: error.message });
            throw new functions.https.HttpsError("internal", "Failed to conduct broad research.", error);
        }
    }
);
