import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, Project, WorkflowContext } from "@mathrunet/masamune_workflow";
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Overall analysis result.
 */
interface OverallAnalysis {
    summary: string;
    highlights: string[];
    concerns: string[];
    keyMetrics: {
        metric: string;
        value: string;
        trend: "up" | "down" | "stable";
    }[];
}

/**
 * Improvement suggestion.
 */
interface ImprovementSuggestion {
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    category: string;
    expectedImpact?: string;
}

/**
 * Trend analysis result.
 */
interface TrendAnalysis {
    userGrowthTrend: string;
    engagementTrend: string;
    ratingTrend: string;
    predictions: string[];
}

/**
 * Review analysis result.
 */
interface ReviewAnalysis {
    sentiment: {
        positive: number;
        neutral: number;
        negative: number;
    };
    commonThemes: string[];
    actionableInsights: string[];
}

/**
 * Combined marketing data for analysis.
 */
interface CombinedData {
    googlePlayConsole?: { [key: string]: any };
    appStore?: { [key: string]: any };
    firebaseAnalytics?: { [key: string]: any };
}

/**
 * Review data structure.
 */
interface Review {
    rating: number;
    text: string;
}

/**
 * A function for analyzing marketing data using AI (Gemini).
 *
 * AIを使用してマーケティングデータを解析するためのFunction。
 */
export class AnalyzeMarketingData extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     *
     * 関数のID。
     */
    id: string = "analyze_marketing_data";

    /**
     * The process of the function.
     *
     * @param context
     * The context of the function.
     *
     * @returns
     * The action of the function.
     */
    async process(context: WorkflowContext): Promise<Action> {
        const action = context.action;
        const task = context.task;

        // 1. task.results から各データを取得
        const googlePlayConsole = task.results?.googlePlayConsole as { [key: string]: any } | undefined;
        const appStore = task.results?.appStore as { [key: string]: any } | undefined;
        const firebaseAnalytics = task.results?.firebaseAnalytics as { [key: string]: any } | undefined;

        // 2. いずれのデータも無ければ空データを返却
        if (!googlePlayConsole && !appStore && !firebaseAnalytics) {
            console.log("AnalyzeMarketingData: No marketing data found in task.results");
            return {
                ...action,
                results: {
                    marketingAnalytics: {},
                }
            };
        }

        // 3. 環境変数からプロジェクト情報を取得
        const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
        const region = process.env.GCLOUD_REGION || "us-central1";
        const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

        if (!projectId) {
            console.error("AnalyzeMarketingData: No GCP project ID found");
            return {
                ...action,
                results: {
                    marketingAnalytics: {
                        error: "No GCP project ID configured",
                    },
                }
            };
        }

        try {
            // 4. GoogleGenAI を初期化（VertexAI モード）
            const genai = new GoogleGenAI({
                vertexai: true,
                project: projectId,
                location: region,
            });

            const combinedData: CombinedData = {
                googlePlayConsole,
                appStore,
                firebaseAnalytics,
            };

            // レビューデータを抽出
            const reviews: Review[] = [
                ...(googlePlayConsole?.recentReviews || []),
                ...(appStore?.recentReviews || []),
            ];

            // 5. 各解析を並列実行
            const [overallAnalysis, improvementSuggestions, trendAnalysis, reviewAnalysis] =
                await Promise.all([
                    this.generateOverallAnalysis(genai, combinedData, modelName),
                    this.generateImprovementSuggestions(genai, combinedData, modelName),
                    this.generateTrendAnalysis(genai, combinedData, modelName),
                    reviews.length > 0
                        ? this.analyzeReviews(genai, reviews, modelName)
                        : Promise.resolve({
                            sentiment: { positive: 0, neutral: 0, negative: 0 },
                            commonThemes: [],
                            actionableInsights: [],
                        }),
                ]);

            // 6. 結果を marketingAnalytics キーで返却
            return {
                ...action,
                results: {
                    marketingAnalytics: {
                        overallAnalysis,
                        improvementSuggestions,
                        trendAnalysis,
                        reviewAnalysis,
                        generatedAt: new Date().toISOString(),
                    },
                }
            };
        } catch (error: any) {
            console.error("AnalyzeMarketingData: Failed to analyze data", error);
            return {
                ...action,
                results: {
                    marketingAnalytics: {
                        error: error.message,
                    },
                }
            };
        }
    }

    /**
     * Generate overall analysis from marketing data.
     */
    private async generateOverallAnalysis(
        genai: GoogleGenAI,
        data: CombinedData,
        modelName: string
    ): Promise<OverallAnalysis> {
        try {
            const prompt = this.buildOverallAnalysisPrompt(data);
            const response = await genai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            summary: { type: Type.STRING },
                            highlights: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            concerns: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            keyMetrics: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        metric: { type: Type.STRING },
                                        value: { type: Type.STRING },
                                        trend: { type: Type.STRING },
                                    },
                                },
                            },
                        },
                        required: ["summary", "highlights", "concerns", "keyMetrics"],
                    },
                },
            });

            const text = response.text;
            if (!text) {
                throw new Error("No response from AI model");
            }

            return JSON.parse(text) as OverallAnalysis;
        } catch (err: any) {
            console.error("Failed to generate overall analysis:", err.message);
            return {
                summary: "",
                highlights: [],
                concerns: [],
                keyMetrics: [],
            };
        }
    }

    /**
     * Generate improvement suggestions.
     */
    private async generateImprovementSuggestions(
        genai: GoogleGenAI,
        data: CombinedData,
        modelName: string
    ): Promise<ImprovementSuggestion[]> {
        try {
            const prompt = this.buildImprovementSuggestionsPrompt(data);
            const response = await genai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                description: { type: Type.STRING },
                                priority: { type: Type.STRING },
                                category: { type: Type.STRING },
                                expectedImpact: { type: Type.STRING },
                            },
                            required: ["title", "description", "priority", "category"],
                        },
                    },
                },
            });

            const text = response.text;
            if (!text) {
                throw new Error("No response from AI model");
            }

            return JSON.parse(text) as ImprovementSuggestion[];
        } catch (err: any) {
            console.error("Failed to generate improvement suggestions:", err.message);
            return [];
        }
    }

    /**
     * Generate trend analysis.
     */
    private async generateTrendAnalysis(
        genai: GoogleGenAI,
        data: CombinedData,
        modelName: string
    ): Promise<TrendAnalysis> {
        try {
            const prompt = this.buildTrendAnalysisPrompt(data);
            const response = await genai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            userGrowthTrend: { type: Type.STRING },
                            engagementTrend: { type: Type.STRING },
                            ratingTrend: { type: Type.STRING },
                            predictions: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                        },
                        required: ["userGrowthTrend", "engagementTrend", "ratingTrend", "predictions"],
                    },
                },
            });

            const text = response.text;
            if (!text) {
                throw new Error("No response from AI model");
            }

            return JSON.parse(text) as TrendAnalysis;
        } catch (err: any) {
            console.error("Failed to generate trend analysis:", err.message);
            return {
                userGrowthTrend: "",
                engagementTrend: "",
                ratingTrend: "",
                predictions: [],
            };
        }
    }

    /**
     * Analyze reviews and extract insights.
     */
    private async analyzeReviews(
        genai: GoogleGenAI,
        reviews: Review[],
        modelName: string
    ): Promise<ReviewAnalysis> {
        try {
            const prompt = this.buildReviewAnalysisPrompt(reviews);
            const response = await genai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            sentiment: {
                                type: Type.OBJECT,
                                properties: {
                                    positive: { type: Type.NUMBER },
                                    neutral: { type: Type.NUMBER },
                                    negative: { type: Type.NUMBER },
                                },
                            },
                            commonThemes: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            actionableInsights: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                        },
                        required: ["sentiment", "commonThemes", "actionableInsights"],
                    },
                },
            });

            const text = response.text;
            if (!text) {
                throw new Error("No response from AI model");
            }

            return JSON.parse(text) as ReviewAnalysis;
        } catch (err: any) {
            console.error("Failed to analyze reviews:", err.message);
            return {
                sentiment: { positive: 0, neutral: 0, negative: 0 },
                commonThemes: [],
                actionableInsights: [],
            };
        }
    }

    /**
     * Build prompt for overall analysis.
     */
    private buildOverallAnalysisPrompt(data: CombinedData): string {
        return `You are an expert app marketing analyst. Analyze the following marketing data and provide a comprehensive overview.

## Marketing Data

### Google Play Data
${data.googlePlayConsole ? JSON.stringify(data.googlePlayConsole, null, 2) : "Not available"}

### App Store Data
${data.appStore ? JSON.stringify(data.appStore, null, 2) : "Not available"}

### Firebase Analytics Data
${data.firebaseAnalytics ? JSON.stringify(data.firebaseAnalytics, null, 2) : "Not available"}

## Instructions
1. Write a concise summary (2-3 paragraphs) analyzing the overall app performance
2. List 3-5 key highlights (positive points)
3. List 2-4 concerns or areas needing attention
4. Identify 4-6 key metrics with their values and trends (up/down/stable)

Respond in Japanese.`;
    }

    /**
     * Build prompt for improvement suggestions.
     */
    private buildImprovementSuggestionsPrompt(data: CombinedData): string {
        return `You are an expert app marketing strategist. Based on the following marketing data, provide actionable improvement suggestions.

## Marketing Data

### Google Play Data
${data.googlePlayConsole ? JSON.stringify(data.googlePlayConsole, null, 2) : "Not available"}

### App Store Data
${data.appStore ? JSON.stringify(data.appStore, null, 2) : "Not available"}

### Firebase Analytics Data
${data.firebaseAnalytics ? JSON.stringify(data.firebaseAnalytics, null, 2) : "Not available"}

## Instructions
Provide 5-8 specific, actionable improvement suggestions. For each suggestion:
1. title: Brief title (under 50 characters)
2. description: Detailed explanation with specific steps (100-200 characters)
3. priority: "high", "medium", or "low"
4. category: One of "user_acquisition", "retention", "engagement", "monetization", "quality", "development"
5. expectedImpact: Expected outcome if implemented

Focus on data-driven recommendations. Respond in Japanese.`;
    }

    /**
     * Build prompt for trend analysis.
     */
    private buildTrendAnalysisPrompt(data: CombinedData): string {
        return `You are an expert data analyst specializing in mobile app trends. Analyze the following marketing data and provide trend insights.

## Marketing Data

### Google Play Data
${data.googlePlayConsole ? JSON.stringify(data.googlePlayConsole, null, 2) : "Not available"}

### App Store Data
${data.appStore ? JSON.stringify(data.appStore, null, 2) : "Not available"}

### Firebase Analytics Data
${data.firebaseAnalytics ? JSON.stringify(data.firebaseAnalytics, null, 2) : "Not available"}

## Instructions
Analyze trends and provide:
1. userGrowthTrend: Analysis of user acquisition and growth patterns (2-3 sentences)
2. engagementTrend: Analysis of user engagement metrics (2-3 sentences)
3. ratingTrend: Analysis of app ratings and user satisfaction (2-3 sentences)
4. predictions: 3-5 predictions for the next period based on current trends

Respond in Japanese.`;
    }

    /**
     * Build prompt for review analysis.
     */
    private buildReviewAnalysisPrompt(reviews: Review[]): string {
        const reviewsText = reviews
            .slice(0, 50) // Limit to 50 reviews to avoid token limits
            .map((r) => `Rating: ${r.rating}/5\nText: ${r.text}\n---`)
            .join("\n");

        return `You are an expert in user feedback analysis. Analyze the following app reviews and extract insights.

## Reviews
${reviewsText}

## Instructions
Analyze the reviews and provide:
1. sentiment: Percentage breakdown of positive, neutral, and negative reviews (must sum to 100)
2. commonThemes: List 3-6 recurring themes or topics mentioned by users
3. actionableInsights: List 3-5 specific, actionable insights based on the feedback

Respond in Japanese.`;
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new AnalyzeMarketingData(options).build(regions);

// Export class for testing
module.exports.AnalyzeMarketingData = AnalyzeMarketingData;
