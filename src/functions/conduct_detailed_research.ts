import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { VertexAI, SchemaType } from "@google-cloud/vertexai";
import { HttpFunctionsOptions } from "../lib/src/functions_base";

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
                                report: { type: SchemaType.STRING }
                            },
                            required: ["title", "report"]
                        }
                    },
                    tools: [{
                        // @ts-ignore
                        googleSearch: {}
                    }]
                });

                const prompt = `
            You are a professional researcher.
            Based on the following theme, please conduct detailed research using Google Search and generate a comprehensive research report.
            The report should be detailed, factual, and suitable for creating deep content later.

            Theme: ${theme}

            Please output in the following JSON format:
            {
                "title": "Report Title",
                "report": "Detailed Research Report..."
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

                await assetDocRef.update({
                    title: json.title,
                    report: json.report,
                    status: "detailed_research_completed",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                await requestDocRef.update({ status: "detailed_research_completed" });

                return { success: true, assetId: assetId };

            } catch (error: any) {
                console.error("Error in conductDetailedResearch:", error);
                await requestDocRef.update({ status: "detailed_research_failed", error: error.message });
                throw new functions.https.HttpsError("internal", "Failed to conduct detailed research.", error);
            }
        });
};
