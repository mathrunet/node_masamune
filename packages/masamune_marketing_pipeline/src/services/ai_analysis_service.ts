/**
 * AI Analysis Service
 *
 * Provides AI-powered analysis of marketing data using Vertex AI (Gemini).
 * - Overall analysis and summary
 * - Improvement suggestions
 * - Trend analysis
 * - Review sentiment analysis
 * - Cover image generation
 *
 * @see https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini
 */

import { VertexAI, SchemaType } from "@google-cloud/vertexai";
import { CombinedMarketingData, Review } from "../models/marketing_data";
import { withRetry } from "../utils/error_handler";

/**
 * Configuration for AI Analysis Service.
 */
export interface AIAnalysisServiceConfig {
    /** Google Cloud Project ID */
    projectId: string;
    /** Google Cloud Region */
    region?: string;
    /** Model for text generation (default: gemini-2.0-flash) */
    textModel?: string;
    /** Model for image generation (default: gemini-2.5-flash-image) */
    imageModel?: string;
}

/**
 * Overall analysis result.
 */
export interface OverallAnalysis {
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
 * AI-generated improvement suggestion.
 */
export interface AIImprovementSuggestion {
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    category: string;
    expectedImpact?: string;
}

/**
 * AI-generated trend analysis result.
 */
export interface AITrendAnalysis {
    userGrowthTrend: string;
    engagementTrend: string;
    ratingTrend: string;
    predictions: string[];
}

/**
 * Review analysis result.
 */
export interface ReviewAnalysis {
    sentiment: {
        positive: number;
        neutral: number;
        negative: number;
    };
    commonThemes: string[];
    actionableInsights: string[];
}

/**
 * Cover image generation options.
 */
export interface CoverImageOptions {
    appName: string;
    period: string;
    highlights: string[];
}

/**
 * Full AI analysis report.
 */
export interface AIAnalysisReport {
    overallAnalysis: OverallAnalysis;
    improvementSuggestions: AIImprovementSuggestion[];
    trendAnalysis: AITrendAnalysis;
    reviewAnalysis: ReviewAnalysis;
    generatedAt: Date;
}

/**
 * AI Analysis Service using Vertex AI (Gemini).
 */
export class AIAnalysisService {
    private vertexAI: VertexAI;
    private projectId: string;
    private region: string;
    private textModel: string;
    private imageModel: string;

    constructor(config: AIAnalysisServiceConfig) {
        this.projectId = config.projectId;
        this.region = config.region || "us-central1";
        this.textModel = config.textModel || "gemini-2.0-flash";
        this.imageModel = config.imageModel || "gemini-2.5-flash-image";

        this.vertexAI = new VertexAI({
            project: this.projectId,
            location: this.region,
        });
    }

    /**
     * Generate overall analysis from marketing data.
     */
    async generateOverallAnalysis(data: CombinedMarketingData): Promise<OverallAnalysis> {
        return withRetry(async () => {
            const model = this.vertexAI.getGenerativeModel({
                model: this.textModel,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            summary: { type: SchemaType.STRING },
                            highlights: {
                                type: SchemaType.ARRAY,
                                items: { type: SchemaType.STRING },
                            },
                            concerns: {
                                type: SchemaType.ARRAY,
                                items: { type: SchemaType.STRING },
                            },
                            keyMetrics: {
                                type: SchemaType.ARRAY,
                                items: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        metric: { type: SchemaType.STRING },
                                        value: { type: SchemaType.STRING },
                                        trend: { type: SchemaType.STRING },
                                    },
                                },
                            },
                        },
                        required: ["summary", "highlights", "concerns", "keyMetrics"],
                    },
                },
            });

            const prompt = this.buildOverallAnalysisPrompt(data);
            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                throw new Error("No response from AI model");
            }

            return JSON.parse(text) as OverallAnalysis;
        });
    }

    /**
     * Generate improvement suggestions.
     */
    async generateImprovementSuggestions(data: CombinedMarketingData): Promise<AIImprovementSuggestion[]> {
        return withRetry(async () => {
            const model = this.vertexAI.getGenerativeModel({
                model: this.textModel,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: SchemaType.ARRAY,
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                title: { type: SchemaType.STRING },
                                description: { type: SchemaType.STRING },
                                priority: { type: SchemaType.STRING },
                                category: { type: SchemaType.STRING },
                                expectedImpact: { type: SchemaType.STRING },
                            },
                            required: ["title", "description", "priority", "category"],
                        },
                    },
                },
            });

            const prompt = this.buildImprovementSuggestionsPrompt(data);
            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                throw new Error("No response from AI model");
            }

            return JSON.parse(text) as AIImprovementSuggestion[];
        });
    }

    /**
     * Generate trend analysis.
     */
    async generateTrendAnalysis(data: CombinedMarketingData): Promise<AITrendAnalysis> {
        return withRetry(async () => {
            const model = this.vertexAI.getGenerativeModel({
                model: this.textModel,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            userGrowthTrend: { type: SchemaType.STRING },
                            engagementTrend: { type: SchemaType.STRING },
                            ratingTrend: { type: SchemaType.STRING },
                            predictions: {
                                type: SchemaType.ARRAY,
                                items: { type: SchemaType.STRING },
                            },
                        },
                        required: ["userGrowthTrend", "engagementTrend", "ratingTrend", "predictions"],
                    },
                },
            });

            const prompt = this.buildTrendAnalysisPrompt(data);
            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                throw new Error("No response from AI model");
            }

            return JSON.parse(text) as AITrendAnalysis;
        });
    }

    /**
     * Analyze reviews and extract insights.
     */
    async analyzeReviews(reviews: Review[]): Promise<ReviewAnalysis> {
        return withRetry(async () => {
            const model = this.vertexAI.getGenerativeModel({
                model: this.textModel,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            sentiment: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    positive: { type: SchemaType.NUMBER },
                                    neutral: { type: SchemaType.NUMBER },
                                    negative: { type: SchemaType.NUMBER },
                                },
                            },
                            commonThemes: {
                                type: SchemaType.ARRAY,
                                items: { type: SchemaType.STRING },
                            },
                            actionableInsights: {
                                type: SchemaType.ARRAY,
                                items: { type: SchemaType.STRING },
                            },
                        },
                        required: ["sentiment", "commonThemes", "actionableInsights"],
                    },
                },
            });

            const prompt = this.buildReviewAnalysisPrompt(reviews);
            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                throw new Error("No response from AI model");
            }

            return JSON.parse(text) as ReviewAnalysis;
        });
    }

    /**
     * Generate a cover image for the report.
     */
    async generateCoverImage(options: CoverImageOptions): Promise<Buffer> {
        return withRetry(async () => {
            const model = this.vertexAI.preview.getGenerativeModel({
                model: this.imageModel,
            });

            const prompt = `Generate a professional, modern marketing report cover image.
The image should be:
- Clean and minimalist design
- Professional business aesthetic
- 16:9 aspect ratio
- Include abstract data visualization elements (charts, graphs, growth arrows)
- Color scheme: professional blues, greens, and white
- NO text in the image

App: ${options.appName}
Period: ${options.period}
Key highlights to represent visually: ${options.highlights.join(", ")}

Create a visually appealing cover that conveys growth, analytics, and business success.`;

            const result = await model.generateContent(prompt);
            const response = result.response;

            // Extract image data from response
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
            return Buffer.from(imagePart.inlineData.data, "base64");
        });
    }

    /**
     * Generate a full AI analysis report.
     */
    async generateFullReport(data: CombinedMarketingData): Promise<AIAnalysisReport> {
        const reviews = [
            ...(data.googlePlay?.recentReviews || []),
            ...(data.appStore?.recentReviews || []),
        ];

        const [overallAnalysis, improvementSuggestions, trendAnalysis, reviewAnalysis] = await Promise.all([
            this.generateOverallAnalysis(data),
            this.generateImprovementSuggestions(data),
            this.generateTrendAnalysis(data),
            reviews.length > 0
                ? this.analyzeReviews(reviews)
                : Promise.resolve({
                      sentiment: { positive: 0, neutral: 0, negative: 0 },
                      commonThemes: [],
                      actionableInsights: [],
                  }),
        ]);

        return {
            overallAnalysis,
            improvementSuggestions,
            trendAnalysis,
            reviewAnalysis,
            generatedAt: new Date(),
        };
    }

    /**
     * Build prompt for overall analysis.
     */
    private buildOverallAnalysisPrompt(data: CombinedMarketingData): string {
        return `You are an expert app marketing analyst. Analyze the following marketing data and provide a comprehensive overview.

## Marketing Data

### Date Range
${data.dateRange.startDate} to ${data.dateRange.endDate}

### Google Play Data
${data.googlePlay ? JSON.stringify(data.googlePlay, null, 2) : "Not available"}

### App Store Data
${data.appStore ? JSON.stringify(data.appStore, null, 2) : "Not available"}

### Firebase Analytics Data
${data.firebaseAnalytics ? JSON.stringify(data.firebaseAnalytics, null, 2) : "Not available"}

### GitHub Data
${data.github ? JSON.stringify(data.github, null, 2) : "Not available"}

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
    private buildImprovementSuggestionsPrompt(data: CombinedMarketingData): string {
        return `You are an expert app marketing strategist. Based on the following marketing data, provide actionable improvement suggestions.

## Marketing Data

### Date Range
${data.dateRange.startDate} to ${data.dateRange.endDate}

### Google Play Data
${data.googlePlay ? JSON.stringify(data.googlePlay, null, 2) : "Not available"}

### App Store Data
${data.appStore ? JSON.stringify(data.appStore, null, 2) : "Not available"}

### Firebase Analytics Data
${data.firebaseAnalytics ? JSON.stringify(data.firebaseAnalytics, null, 2) : "Not available"}

### GitHub Data
${data.github ? JSON.stringify(data.github, null, 2) : "Not available"}

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
    private buildTrendAnalysisPrompt(data: CombinedMarketingData): string {
        return `You are an expert data analyst specializing in mobile app trends. Analyze the following marketing data and provide trend insights.

## Marketing Data

### Date Range
${data.dateRange.startDate} to ${data.dateRange.endDate}

### Google Play Data
${data.googlePlay ? JSON.stringify(data.googlePlay, null, 2) : "Not available"}

### Firebase Analytics Data
${data.firebaseAnalytics ? JSON.stringify(data.firebaseAnalytics, null, 2) : "Not available"}

### GitHub Data
${data.github ? JSON.stringify(data.github, null, 2) : "Not available"}

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
