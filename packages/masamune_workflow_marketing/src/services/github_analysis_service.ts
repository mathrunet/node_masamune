/**
 * GitHub Analysis Service
 *
 * AI-powered code analysis using Gemini:
 * - File summarization
 * - Folder summarization
 * - Final repository analysis
 *
 * @see https://ai.google.dev/
 */

import { GoogleGenAI, Type } from "@google/genai";
import {
    FrameworkInfo,
    FileSummary,
    FolderSummary,
    FeatureDetail,
    GitHubRepositoryAnalysis,
    LANGUAGE_EXTENSIONS,
} from "../models";

/**
 * Result of AI generation including token usage.
 */
interface GenerationResult<T> {
    data: T;
    inputTokens: number;
    outputTokens: number;
}

/**
 * Configuration for GitHub Analysis Service.
 */
export interface GitHubAnalysisServiceConfig {
    /** GCP Project ID */
    projectId: string;
    /** GCP Region */
    region?: string;
    /** Gemini model name */
    modelName?: string;
}

/**
 * GitHub Analysis Service using Gemini AI.
 */
export class GitHubAnalysisService {
    private genai: GoogleGenAI;
    private modelName: string;

    constructor(config: GitHubAnalysisServiceConfig) {
        this.genai = new GoogleGenAI({
            vertexai: true,
            project: config.projectId,
            location: config.region || "us-central1",
        });
        this.modelName = config.modelName || process.env.GEMINI_MODEL || "gemini-2.5-flash";
    }

    /**
     * Get language from file path.
     */
    getLanguageFromPath(path: string): string | undefined {
        const ext = path.substring(path.lastIndexOf("."));
        return LANGUAGE_EXTENSIONS[ext.toLowerCase()];
    }

    /**
     * Summarize a single file.
     */
    async summarizeFile(
        content: string,
        path: string,
        framework: string
    ): Promise<GenerationResult<FileSummary>> {
        const language = this.getLanguageFromPath(path);

        // Truncate very long files
        const maxLength = 50000;
        const truncatedContent = content.length > maxLength
            ? content.substring(0, maxLength) + "\n... (truncated)"
            : content;

        const prompt = `You are analyzing source code for a ${framework} project.

## File Information
- Path: ${path}
- Language: ${language || "Unknown"}

## File Content
\`\`\`
${truncatedContent}
\`\`\`

## Instructions
Analyze this file and provide:
1. A brief summary (1-2 sentences) of what this file does
2. Key features or functionality it provides (if any)
3. Main exports (classes, functions, etc.) if applicable

Respond in Japanese.`;

        try {
            const response = await this.genai.models.generateContent({
                model: this.modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            summary: { type: Type.STRING },
                            features: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            exports: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                        },
                        required: ["summary"],
                    },
                },
            });

            const text = response.text;
            if (!text) {
                throw new Error("No response from AI model");
            }

            const parsed = JSON.parse(text);
            const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
            const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

            return {
                data: {
                    path,
                    language,
                    summary: parsed.summary || "",
                    features: parsed.features || [],
                    exports: parsed.exports || [],
                    analyzedAt: new Date(),
                },
                inputTokens,
                outputTokens,
            };
        } catch (err: any) {
            console.error(`Failed to summarize file ${path}:`, err.message);
            return {
                data: {
                    path,
                    language,
                    summary: `Error analyzing file: ${err.message}`,
                    analyzedAt: new Date(),
                },
                inputTokens: 0,
                outputTokens: 0,
            };
        }
    }

    /**
     * Summarize a folder from its file summaries.
     */
    async summarizeFolder(
        fileSummaries: FileSummary[],
        folderPath: string,
        framework: string
    ): Promise<GenerationResult<FolderSummary>> {
        const summariesText = fileSummaries
            .map(f => `- ${f.path}: ${f.summary}`)
            .join("\n");

        const featuresText = fileSummaries
            .flatMap(f => f.features || [])
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(", ");

        const prompt = `You are analyzing a folder in a ${framework} project.

## Folder Information
- Path: ${folderPath || "(root)"}
- Files: ${fileSummaries.length}

## File Summaries
${summariesText}

## Features Found
${featuresText || "None identified"}

## Instructions
Based on the file summaries above, provide:
1. A brief summary (2-3 sentences) of what this folder/module does
2. Key features or functionality this folder provides

Respond in Japanese.`;

        try {
            const response = await this.genai.models.generateContent({
                model: this.modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            summary: { type: Type.STRING },
                            features: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                        },
                        required: ["summary", "features"],
                    },
                },
            });

            const text = response.text;
            if (!text) {
                throw new Error("No response from AI model");
            }

            const parsed = JSON.parse(text);
            const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
            const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

            return {
                data: {
                    path: folderPath,
                    summary: parsed.summary || "",
                    features: parsed.features || [],
                    fileCount: fileSummaries.length,
                    analyzedAt: new Date(),
                },
                inputTokens,
                outputTokens,
            };
        } catch (err: any) {
            console.error(`Failed to summarize folder ${folderPath}:`, err.message);
            return {
                data: {
                    path: folderPath,
                    summary: `Error analyzing folder: ${err.message}`,
                    features: [],
                    fileCount: fileSummaries.length,
                    analyzedAt: new Date(),
                },
                inputTokens: 0,
                outputTokens: 0,
            };
        }
    }

    /**
     * Generate final repository analysis.
     */
    async generateFinalSummary(
        folderSummaries: FolderSummary[],
        frameworkInfo: FrameworkInfo,
        repository: string,
        analyzedPath: string
    ): Promise<GenerationResult<GitHubRepositoryAnalysis>> {
        const summariesText = folderSummaries
            .map(f => `## ${f.path || "(root)"}\n${f.summary}\nFeatures: ${f.features.join(", ") || "None"}`)
            .join("\n\n");

        const prompt = `You are creating a comprehensive analysis of a software repository.

## Repository Information
- Repository: ${repository}
- Analyzed Path: ${analyzedPath || "(root)"}
- Framework: ${frameworkInfo.framework}
- Platforms: ${frameworkInfo.platforms.join(", ")}

## Configuration File
${frameworkInfo.configContent ? `\`\`\`\n${frameworkInfo.configContent.substring(0, 3000)}\n\`\`\`` : "Not available"}

## Folder Summaries
${summariesText}

## Instructions
Based on all the information above, provide a comprehensive analysis including:

1. **overview**: A detailed overview (3-5 paragraphs) of what this application/service does
2. **features**: List of main features with descriptions and related files
3. **architecture**: Overview of the application architecture
4. **dependencies**: List of main dependencies/libraries used
5. **apiEndpoints**: List of API endpoints if this is a backend service (optional)

Respond in Japanese.`;

        try {
            const response = await this.genai.models.generateContent({
                model: this.modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            overview: { type: Type.STRING },
                            features: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING },
                                        description: { type: Type.STRING },
                                        relatedFiles: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING },
                                        },
                                    },
                                    required: ["name", "description"],
                                },
                            },
                            architecture: { type: Type.STRING },
                            dependencies: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            apiEndpoints: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                        },
                        required: ["overview", "features", "architecture", "dependencies"],
                    },
                },
            });

            const text = response.text;
            if (!text) {
                throw new Error("No response from AI model");
            }

            const parsed = JSON.parse(text);
            const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
            const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

            // Map features to proper structure
            const features: FeatureDetail[] = (parsed.features || []).map((f: any) => ({
                name: f.name || "",
                description: f.description || "",
                relatedFiles: f.relatedFiles || [],
            }));

            return {
                data: {
                    repository,
                    analyzedPath: analyzedPath || "/",
                    framework: frameworkInfo.framework,
                    platforms: frameworkInfo.platforms,
                    overview: parsed.overview || "",
                    features,
                    architecture: parsed.architecture || "",
                    dependencies: parsed.dependencies || [],
                    apiEndpoints: parsed.apiEndpoints,
                    analyzedAt: new Date().toISOString(),
                },
                inputTokens,
                outputTokens,
            };
        } catch (err: any) {
            console.error("Failed to generate final summary:", err.message);
            return {
                data: {
                    repository,
                    analyzedPath: analyzedPath || "/",
                    framework: frameworkInfo.framework,
                    platforms: frameworkInfo.platforms,
                    overview: `Error generating analysis: ${err.message}`,
                    features: [],
                    architecture: "",
                    dependencies: [],
                    analyzedAt: new Date().toISOString(),
                },
                inputTokens: 0,
                outputTokens: 0,
            };
        }
    }

    /**
     * Calculate cost from token usage.
     */
    calculateCost(inputTokens: number, outputTokens: number): number {
        const inputPrice = Number(process.env.MODEL_INPUT_PRICE) || 0.0000003;
        const outputPrice = Number(process.env.MODEL_OUTPUT_PRICE) || 0.0000025;
        return inputTokens * inputPrice + outputTokens * outputPrice;
    }
}
