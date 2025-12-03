import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, Project, WorkflowContext } from "@mathrunet/masamune_workflow";
import { GoogleGenAI, Type } from "@google/genai";
import {
    OverallAnalysis,
    ImprovementSuggestion,
    TrendAnalysis,
    ReviewAnalysis,
    Review,
    GitHubRepositoryAnalysis,
    GitHubImprovementsAnalysis,
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
 * Combined marketing data for analysis.
 */
interface CombinedData {
    googlePlayConsole?: { [key: string]: any };
    appStore?: { [key: string]: any };
    firebaseAnalytics?: { [key: string]: any };
    githubRepository?: GitHubRepositoryAnalysis;
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
        const githubRepository = task.results?.githubRepository as GitHubRepositoryAnalysis | undefined;

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
        const inputPrice = process.env.MODEL_INPUT_PRICE || 0.0000003;
        const outputPrice = process.env.MODEL_OUTPUT_PRICE || 0.0000025;

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
                githubRepository,
            };

            // レビューデータを抽出
            const reviews: Review[] = [
                ...(googlePlayConsole?.recentReviews || []),
                ...(appStore?.recentReviews || []),
            ];

            // 価格を数値に変換（環境変数は文字列の可能性があるため）
            const inputPriceNum = Number(inputPrice);
            const outputPriceNum = Number(outputPrice);

            // 5. 各解析を並列実行
            const [overallResult, suggestionsResult, trendResult, reviewResult, githubImprovementsResult] =
                await Promise.all([
                    this.generateOverallAnalysis(genai, combinedData, modelName),
                    this.generateImprovementSuggestions(genai, combinedData, modelName),
                    this.generateTrendAnalysis(genai, combinedData, modelName),
                    reviews.length > 0
                        ? this.analyzeReviews(genai, reviews, modelName)
                        : Promise.resolve({
                            data: {
                                sentiment: { positive: 0, neutral: 0, negative: 0 },
                                commonThemes: [],
                                actionableInsights: [],
                            },
                            inputTokens: 0,
                            outputTokens: 0,
                        }),
                    // GitHub改善提案（GitHubデータがある場合のみ）
                    githubRepository && !("error" in githubRepository)
                        ? this.generateGitHubImprovements(genai, combinedData, modelName)
                        : Promise.resolve(null),
                ]);

            // 6. トークン使用量を集計してコストを計算
            const totalInputTokens =
                overallResult.inputTokens +
                suggestionsResult.inputTokens +
                trendResult.inputTokens +
                reviewResult.inputTokens +
                (githubImprovementsResult?.inputTokens ?? 0);

            const totalOutputTokens =
                overallResult.outputTokens +
                suggestionsResult.outputTokens +
                trendResult.outputTokens +
                reviewResult.outputTokens +
                (githubImprovementsResult?.outputTokens ?? 0);

            // コスト計算（1トークンあたりのドル × トークン数）
            const aiCost = totalInputTokens * inputPriceNum + totalOutputTokens * outputPriceNum;

            // 7. 結果を marketingAnalytics キーで返却
            return {
                ...action,
                usage: (action.usage ?? 0) + aiCost,
                results: {
                    marketingAnalytics: {
                        overallAnalysis: overallResult.data,
                        improvementSuggestions: suggestionsResult.data,
                        trendAnalysis: trendResult.data,
                        reviewAnalysis: reviewResult.data,
                        generatedAt: new Date().toISOString(),
                    },
                    // GitHub改善提案（GitHubデータがある場合のみ）
                    ...(githubImprovementsResult?.data ? { githubImprovements: githubImprovementsResult.data } : {}),
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
    ): Promise<GenerationResult<OverallAnalysis>> {
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

            const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
            const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

            return {
                data: JSON.parse(text) as OverallAnalysis,
                inputTokens,
                outputTokens,
            };
        } catch (err: any) {
            console.error("Failed to generate overall analysis:", err.message);
            return {
                data: {
                    summary: "",
                    highlights: [],
                    concerns: [],
                    keyMetrics: [],
                },
                inputTokens: 0,
                outputTokens: 0,
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
    ): Promise<GenerationResult<ImprovementSuggestion[]>> {
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

            const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
            const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

            return {
                data: JSON.parse(text) as ImprovementSuggestion[],
                inputTokens,
                outputTokens,
            };
        } catch (err: any) {
            console.error("Failed to generate improvement suggestions:", err.message);
            return {
                data: [],
                inputTokens: 0,
                outputTokens: 0,
            };
        }
    }

    /**
     * Generate trend analysis.
     */
    private async generateTrendAnalysis(
        genai: GoogleGenAI,
        data: CombinedData,
        modelName: string
    ): Promise<GenerationResult<TrendAnalysis>> {
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

            const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
            const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

            return {
                data: JSON.parse(text) as TrendAnalysis,
                inputTokens,
                outputTokens,
            };
        } catch (err: any) {
            console.error("Failed to generate trend analysis:", err.message);
            return {
                data: {
                    userGrowthTrend: "",
                    engagementTrend: "",
                    ratingTrend: "",
                    predictions: [],
                },
                inputTokens: 0,
                outputTokens: 0,
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
    ): Promise<GenerationResult<ReviewAnalysis>> {
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

            const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
            const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

            return {
                data: JSON.parse(text) as ReviewAnalysis,
                inputTokens,
                outputTokens,
            };
        } catch (err: any) {
            console.error("Failed to analyze reviews:", err.message);
            return {
                data: {
                    sentiment: { positive: 0, neutral: 0, negative: 0 },
                    commonThemes: [],
                    actionableInsights: [],
                },
                inputTokens: 0,
                outputTokens: 0,
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

    /**
     * Generate GitHub-aware improvement suggestions.
     *
     * GitHubリポジトリ分析に基づく改善提案を生成。
     */
    private async generateGitHubImprovements(
        genai: GoogleGenAI,
        data: CombinedData,
        modelName: string
    ): Promise<GenerationResult<GitHubImprovementsAnalysis>> {
        try {
            const prompt = this.buildGitHubImprovementsPrompt(data);
            const response = await genai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            improvementSummary: { type: Type.STRING },
                            improvements: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING },
                                        description: { type: Type.STRING },
                                        priority: { type: Type.STRING },
                                        category: { type: Type.STRING },
                                        expectedImpact: { type: Type.STRING },
                                        relatedFeature: { type: Type.STRING },
                                        codeReferences: {
                                            type: Type.ARRAY,
                                            items: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    filePath: { type: Type.STRING },
                                                    currentFunctionality: { type: Type.STRING },
                                                    proposedChange: { type: Type.STRING },
                                                    modificationType: { type: Type.STRING },
                                                },
                                                required: ["filePath", "currentFunctionality", "proposedChange", "modificationType"],
                                            },
                                        },
                                    },
                                    required: ["title", "description", "priority", "category", "expectedImpact", "codeReferences"],
                                },
                            },
                        },
                        required: ["improvementSummary", "improvements"],
                    },
                },
            });

            const text = response.text;
            if (!text) {
                throw new Error("No response from AI model");
            }

            const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
            const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

            const parsed = JSON.parse(text);
            const githubRepo = data.githubRepository!;

            return {
                data: {
                    repository: githubRepo.repository,
                    framework: githubRepo.framework,
                    improvements: parsed.improvements,
                    improvementSummary: parsed.improvementSummary,
                    generatedAt: new Date().toISOString(),
                },
                inputTokens,
                outputTokens,
            };
        } catch (err: any) {
            console.error("Failed to generate GitHub improvements:", err.message);
            return {
                data: {
                    repository: data.githubRepository?.repository ?? "",
                    framework: data.githubRepository?.framework ?? "",
                    improvements: [],
                    improvementSummary: "",
                    generatedAt: new Date().toISOString(),
                },
                inputTokens: 0,
                outputTokens: 0,
            };
        }
    }

    /**
     * Build prompt for GitHub-aware improvements.
     *
     * GitHub対応改善提案用のプロンプトを生成。
     */
    private buildGitHubImprovementsPrompt(data: CombinedData): string {
        const github = data.githubRepository!;

        // フィーチャーをテキストに変換（最大15件に制限）
        const featuresText = github.features
            .slice(0, 15)
            .map((f) => `### ${f.name}\n${f.description}\nFiles: ${f.relatedFiles.join(", ")}`)
            .join("\n\n");

        // 全てのファイルパスを収集
        const allFilePaths = github.features
            .slice(0, 15)
            .flatMap((f) => f.relatedFiles)
            .filter((v, i, a) => a.indexOf(v) === i) // 重複排除
            .join("\n- ");

        return `あなたはアプリ開発とマーケティング戦略の専門家です。以下のマーケティングデータとコードベース分析に基づいて、具体的なコード改善提案を行ってください。

## アプリケーション情報
- Repository: ${github.repository}
- Framework: ${github.framework}
- Platforms: ${github.platforms.join(", ")}

## アプリケーション概要
${github.overview}

## アーキテクチャ
${github.architecture}

## 機能とファイル
${featuresText}

## 利用可能なファイルパス
以下のファイルパスのみをcodeReferencesで使用してください：
- ${allFilePaths}

## マーケティングデータ

### Google Play Console
${data.googlePlayConsole ? JSON.stringify(data.googlePlayConsole, null, 2) : "データなし"}

### App Store
${data.appStore ? JSON.stringify(data.appStore, null, 2) : "データなし"}

### Firebase Analytics
${data.firebaseAnalytics ? JSON.stringify(data.firebaseAnalytics, null, 2) : "データなし"}

## 指示
マーケティングデータとコードベース分析に基づいて、5-8個の具体的な改善提案を行ってください。

各提案には必ず以下を含めてください：
1. **title**: 簡潔なタイトル（50文字以内）
2. **description**: 詳細な説明（100-200文字）
3. **priority**: "high", "medium", "low" のいずれか
4. **category**: "user_acquisition", "retention", "engagement", "monetization", "quality", "development" のいずれか
5. **expectedImpact**: 期待される効果（具体的な数値目標があれば含める）
6. **relatedFeature**: 上記の機能名から関連するものを選択
7. **codeReferences**: 具体的なファイル修正の配列
   - **filePath**: 上記「利用可能なファイルパス」から選択した実際のパス
   - **currentFunctionality**: 現在のファイル/機能の説明
   - **proposedChange**: 提案する具体的な変更内容
   - **modificationType**: "add"（新規追加）, "modify"（修正）, "refactor"（リファクタリング）, "optimize"（最適化）のいずれか

重要：
- codeReferencesのfilePathは必ず「利用可能なファイルパス」リストから選択してください
- マーケティング指標（ユーザー獲得、リテンション、エンゲージメント、収益化）を改善するコード変更に焦点を当ててください
- 各改善提案は具体的で実行可能なものにしてください

日本語で回答してください。`;
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new AnalyzeMarketingData(options).build(regions);

// Export class for testing
module.exports.AnalyzeMarketingData = AnalyzeMarketingData;
