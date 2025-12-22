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
    MarketResearchData,
    MarketResearch,
    CompetitivePositioningAnalysis,
    MarketOpportunityPriorityAnalysis,
} from "../models";
import { getTranslations, MarketingTranslations } from "../locales";

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
    marketResearchData?: MarketResearchData;
    marketResearch?: MarketResearch;
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
     * Translations for the current locale.
     */
    private translations: MarketingTranslations = getTranslations("en");

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

        // 市場調査データを取得（あれば）
        const marketResearchData = task.results?.marketResearchData as MarketResearchData | undefined;
        const marketResearch = task.results?.marketResearch as MarketResearch | undefined;

        // 市場調査データが有効かどうかをチェック
        const hasValidMarketResearchData = marketResearchData && !("error" in marketResearchData);
        const hasValidMarketResearch = marketResearch && !("error" in marketResearch);

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
            // 4. Localeを取得して翻訳を初期化
            const locale = typeof action.locale === "object"
                ? action.locale["@language"]
                : action.locale;
            this.translations = getTranslations(locale);

            // 5. GoogleGenAI を初期化（VertexAI モード）
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
                marketResearchData: hasValidMarketResearchData ? marketResearchData : undefined,
                marketResearch: hasValidMarketResearch ? marketResearch : undefined,
            };

            // 市場調査データが統合されるかどうかのフラグ（Firestoreはundefinedを許可しないため、必ずbooleanにする）
            const marketDataIntegrated = !!(hasValidMarketResearchData || hasValidMarketResearch);

            // レビューデータを抽出
            const reviews: Review[] = [
                ...(googlePlayConsole?.recentReviews || []),
                ...(appStore?.recentReviews || []),
            ];

            // 価格を数値に変換（環境変数は文字列の可能性があるため）
            const inputPriceNum = Number(inputPrice);
            const outputPriceNum = Number(outputPrice);

            // 5. 各解析を並列実行
            const [
                overallResult,
                suggestionsResult,
                trendResult,
                reviewResult,
                githubImprovementsResult,
                competitivePositioningResult,
                marketOpportunityResult,
            ] = await Promise.all([
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
                    // 競合ポジショニング分析（市場調査データがある場合のみ）
                    marketDataIntegrated
                        ? this.generateCompetitivePositioning(genai, combinedData, modelName)
                        : Promise.resolve(null),
                    // 市場機会優先度分析（市場調査データがある場合のみ）
                    marketDataIntegrated
                        ? this.generateMarketOpportunityPriority(genai, combinedData, modelName)
                        : Promise.resolve(null),
                ]);

            // 6. トークン使用量を集計してコストを計算
            const totalInputTokens =
                overallResult.inputTokens +
                suggestionsResult.inputTokens +
                trendResult.inputTokens +
                reviewResult.inputTokens +
                (githubImprovementsResult?.inputTokens ?? 0) +
                (competitivePositioningResult?.inputTokens ?? 0) +
                (marketOpportunityResult?.inputTokens ?? 0);

            const totalOutputTokens =
                overallResult.outputTokens +
                suggestionsResult.outputTokens +
                trendResult.outputTokens +
                reviewResult.outputTokens +
                (githubImprovementsResult?.outputTokens ?? 0) +
                (competitivePositioningResult?.outputTokens ?? 0) +
                (marketOpportunityResult?.outputTokens ?? 0);

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
                        // 市場調査データがある場合のみ追加
                        ...(competitivePositioningResult?.data ? { competitivePositioning: competitivePositioningResult.data } : {}),
                        ...(marketOpportunityResult?.data ? { marketOpportunityPriority: marketOpportunityResult.data } : {}),
                        marketDataIntegrated,
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
        // 市場調査データのセクションを構築
        let marketResearchSection = "";
        if (data.marketResearchData || data.marketResearch) {
            marketResearchSection = `
## 市場調査データ
${data.marketResearchData ? `
### 市場ポテンシャル
${JSON.stringify(data.marketResearchData.marketPotential, null, 2)}

### 競合分析
${JSON.stringify(data.marketResearchData.competitorAnalysis, null, 2)}
` : ""}
${data.marketResearch ? `
### 需要予測
${JSON.stringify(data.marketResearch.demandForecast, null, 2)}

### キーインサイト
${JSON.stringify(data.marketResearch.keyInsights, null, 2)}
` : ""}
`;
        }

        return `You are an expert app marketing analyst. Analyze the following marketing data and provide a comprehensive overview.

## Marketing Data

### Google Play Data
${data.googlePlayConsole ? JSON.stringify(data.googlePlayConsole, null, 2) : "Not available"}

### App Store Data
${data.appStore ? JSON.stringify(data.appStore, null, 2) : "Not available"}

### Firebase Analytics Data
${data.firebaseAnalytics ? JSON.stringify(data.firebaseAnalytics, null, 2) : "Not available"}
${marketResearchSection}
## Instructions
1. Write a concise summary (2-3 paragraphs) analyzing the overall app performance
2. List 3-5 key highlights (positive points)
3. List 2-4 concerns or areas needing attention
4. Identify 4-6 key metrics with their values and trends (up/down/stable)
${data.marketResearchData || data.marketResearch ? "5. Integrate market research insights into your analysis, considering market potential and competitive landscape" : ""}

${this.translations.respondInLanguage}`;
    }

    /**
     * Build prompt for improvement suggestions.
     */
    private buildImprovementSuggestionsPrompt(data: CombinedData): string {
        // 市場調査データのセクションを構築
        let marketResearchSection = "";
        if (data.marketResearchData || data.marketResearch) {
            marketResearchSection = `
## 市場調査データ
${data.marketResearchData ? `
### ビジネス機会
${JSON.stringify(data.marketResearchData.businessOpportunities, null, 2)}

### 差別化機会
${JSON.stringify(data.marketResearchData.competitorAnalysis.differentiationOpportunities, null, 2)}

### 市場ギャップ
${JSON.stringify(data.marketResearchData.competitorAnalysis.marketGaps, null, 2)}
` : ""}
${data.marketResearch ? `
### 収益向上施策（市場調査ベース）
${JSON.stringify(data.marketResearch.revenueStrategies, null, 2)}

### 流入向上施策（市場調査ベース）
${JSON.stringify(data.marketResearch.trafficStrategies, null, 2)}
` : ""}
`;
        }

        return `You are an expert app marketing strategist. Based on the following marketing data, provide actionable improvement suggestions.

## Marketing Data

### Google Play Data
${data.googlePlayConsole ? JSON.stringify(data.googlePlayConsole, null, 2) : "Not available"}

### App Store Data
${data.appStore ? JSON.stringify(data.appStore, null, 2) : "Not available"}

### Firebase Analytics Data
${data.firebaseAnalytics ? JSON.stringify(data.firebaseAnalytics, null, 2) : "Not available"}
${marketResearchSection}
## Instructions
Provide 5-8 specific, actionable improvement suggestions. For each suggestion:
1. title: Brief title (under 50 characters)
2. description: Detailed explanation with specific steps (100-200 characters)
3. priority: "high", "medium", or "low"
4. category: One of "user_acquisition", "retention", "engagement", "monetization", "quality", "development"
5. expectedImpact: Expected outcome if implemented
${data.marketResearchData || data.marketResearch ? `
Important: Consider the market research data when making recommendations:
- Prioritize suggestions that address identified market gaps
- Leverage business opportunities and differentiation points
- Align with revenue and traffic strategies from market research
` : ""}
Focus on data-driven recommendations. ${this.translations.respondInLanguage}`;
    }

    /**
     * Build prompt for trend analysis.
     */
    private buildTrendAnalysisPrompt(data: CombinedData): string {
        // 市場調査データのセクションを構築
        let marketResearchSection = "";
        if (data.marketResearchData || data.marketResearch) {
            marketResearchSection = `
## 市場調査データ
${data.marketResearch ? `
### 需要予測
${JSON.stringify(data.marketResearch.demandForecast, null, 2)}

### 市場全体トレンド
${data.marketResearch.demandForecast.overallTrend}
` : ""}
${data.marketResearchData ? `
### 市場ドライバー
${JSON.stringify(data.marketResearchData.marketPotential.marketDrivers, null, 2)}

### 市場ポテンシャル概要
${data.marketResearchData.marketPotential.summary}
` : ""}
`;
        }

        return `You are an expert data analyst specializing in mobile app trends. Analyze the following marketing data and provide trend insights.

## Marketing Data

### Google Play Data
${data.googlePlayConsole ? JSON.stringify(data.googlePlayConsole, null, 2) : "Not available"}

### App Store Data
${data.appStore ? JSON.stringify(data.appStore, null, 2) : "Not available"}

### Firebase Analytics Data
${data.firebaseAnalytics ? JSON.stringify(data.firebaseAnalytics, null, 2) : "Not available"}
${marketResearchSection}
## Instructions
Analyze trends and provide:
1. userGrowthTrend: Analysis of user acquisition and growth patterns (2-3 sentences)
2. engagementTrend: Analysis of user engagement metrics (2-3 sentences)
3. ratingTrend: Analysis of app ratings and user satisfaction (2-3 sentences)
4. predictions: 3-5 predictions for the next period based on current trends
${data.marketResearchData || data.marketResearch ? "5. Consider market demand forecasts and market drivers when making predictions" : ""}

${this.translations.respondInLanguage}`;
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

${this.translations.respondInLanguage}`;
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

Important:
- codeReferences filePath must be selected from the "Available File Paths" list above
- Focus on code changes that improve marketing metrics (user acquisition, retention, engagement, monetization)
- Each improvement suggestion should be specific and actionable

${this.translations.respondInLanguage}`;
    }

    /**
     * Generate competitive positioning analysis.
     *
     * 競合ポジショニング分析を生成。
     */
    private async generateCompetitivePositioning(
        genai: GoogleGenAI,
        data: CombinedData,
        modelName: string
    ): Promise<GenerationResult<CompetitivePositioningAnalysis>> {
        try {
            const prompt = this.buildCompetitivePositioningPrompt(data);
            const response = await genai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            marketPosition: { type: Type.STRING },
                            competitorComparison: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        competitor: { type: Type.STRING },
                                        ourStrengths: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING },
                                        },
                                        ourWeaknesses: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING },
                                        },
                                        battleStrategy: { type: Type.STRING },
                                    },
                                    required: ["competitor", "ourStrengths", "ourWeaknesses", "battleStrategy"],
                                },
                            },
                            differentiationStrategy: { type: Type.STRING },
                            quickWins: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                        },
                        required: ["marketPosition", "competitorComparison", "differentiationStrategy", "quickWins"],
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
                data: JSON.parse(text) as CompetitivePositioningAnalysis,
                inputTokens,
                outputTokens,
            };
        } catch (err: any) {
            console.error("Failed to generate competitive positioning:", err.message);
            return {
                data: {
                    marketPosition: "",
                    competitorComparison: [],
                    differentiationStrategy: "",
                    quickWins: [],
                },
                inputTokens: 0,
                outputTokens: 0,
            };
        }
    }

    /**
     * Build prompt for competitive positioning analysis.
     *
     * 競合ポジショニング分析用のプロンプトを生成。
     */
    private buildCompetitivePositioningPrompt(data: CombinedData): string {
        const competitors = data.marketResearchData?.competitorAnalysis.competitors || [];
        const competitorsList = competitors
            .map((c) => `- ${c.name}: ${c.description}\n  強み: ${c.strengths.join(", ")}\n  弱み: ${c.weaknesses.join(", ")}`)
            .join("\n");

        return `あなたは競合分析の専門家です。以下のアプリパフォーマンスデータと市場調査の競合データに基づいて、競合ポジショニング分析を行ってください。

## 当アプリのパフォーマンスデータ

### Google Play Console
${data.googlePlayConsole ? JSON.stringify(data.googlePlayConsole, null, 2) : "データなし"}

### App Store
${data.appStore ? JSON.stringify(data.appStore, null, 2) : "データなし"}

### Firebase Analytics
${data.firebaseAnalytics ? JSON.stringify(data.firebaseAnalytics, null, 2) : "データなし"}

## 市場調査：競合情報
${competitorsList || "競合データなし"}

## 市場ランドスケープ
${data.marketResearchData?.competitorAnalysis.marketLandscape || "情報なし"}

## 差別化機会
${JSON.stringify(data.marketResearchData?.competitorAnalysis.differentiationOpportunities || [], null, 2)}

## 分析指示
以下の観点で分析してください：

1. **marketPosition**: 現在の市場での位置づけ（2-3文）
   - 市場シェアの推定
   - 競合との相対的な強さ

2. **competitorComparison**: 各競合との比較（3-5社）
   - **competitor**: 競合名
   - **ourStrengths**: 当アプリの優位点（2-4点）
   - **ourWeaknesses**: 当アプリの劣位点（2-4点）
   - **battleStrategy**: この競合に対する具体的な対抗戦略（1-2文）

3. **differentiationStrategy**: 総合的な差別化戦略（3-4文）
   - 複数の競合に対して有効な差別化ポイント

4. **quickWins**: Quick-win differentiation tactics (3-5 points)
   - Things that can be executed in 1-2 weeks

${this.translations.respondInLanguage}`;
    }

    /**
     * Generate market opportunity priority analysis.
     *
     * 市場機会優先度分析を生成。
     */
    private async generateMarketOpportunityPriority(
        genai: GoogleGenAI,
        data: CombinedData,
        modelName: string
    ): Promise<GenerationResult<MarketOpportunityPriorityAnalysis>> {
        try {
            const prompt = this.buildMarketOpportunityPriorityPrompt(data);
            const response = await genai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            prioritizedOpportunities: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        opportunity: { type: Type.STRING },
                                        fitScore: {
                                            type: Type.STRING,
                                            enum: ["excellent", "good", "moderate", "poor"],
                                        },
                                        fitReason: { type: Type.STRING },
                                        requiredChanges: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING },
                                        },
                                        estimatedEffort: {
                                            type: Type.STRING,
                                            enum: ["low", "medium", "high"],
                                        },
                                        recommendedAction: { type: Type.STRING },
                                    },
                                    required: ["opportunity", "fitScore", "fitReason", "requiredChanges", "estimatedEffort", "recommendedAction"],
                                },
                            },
                            strategicRecommendation: { type: Type.STRING },
                        },
                        required: ["prioritizedOpportunities", "strategicRecommendation"],
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
                data: JSON.parse(text) as MarketOpportunityPriorityAnalysis,
                inputTokens,
                outputTokens,
            };
        } catch (err: any) {
            console.error("Failed to generate market opportunity priority:", err.message);
            return {
                data: {
                    prioritizedOpportunities: [],
                    strategicRecommendation: "",
                },
                inputTokens: 0,
                outputTokens: 0,
            };
        }
    }

    /**
     * Build prompt for market opportunity priority analysis.
     *
     * 市場機会優先度分析用のプロンプトを生成。
     */
    private buildMarketOpportunityPriorityPrompt(data: CombinedData): string {
        const opportunities = data.marketResearchData?.businessOpportunities || [];
        const opportunitiesList = opportunities
            .map((o) => `- **${o.title}** (${o.type}, インパクト: ${o.potentialImpact}, 時間枠: ${o.timeframe})\n  ${o.description}\n  要件: ${o.requirements.join(", ")}\n  リスク: ${o.risks.join(", ")}`)
            .join("\n\n");

        const marketGaps = data.marketResearchData?.competitorAnalysis.marketGaps || [];

        return `あなたは戦略コンサルタントです。以下のアプリパフォーマンスデータと市場機会データに基づいて、機会の優先順位付けを行ってください。

## 当アプリのパフォーマンスデータ

### Google Play Console
${data.googlePlayConsole ? JSON.stringify(data.googlePlayConsole, null, 2) : "データなし"}

### App Store
${data.appStore ? JSON.stringify(data.appStore, null, 2) : "データなし"}

### Firebase Analytics
${data.firebaseAnalytics ? JSON.stringify(data.firebaseAnalytics, null, 2) : "データなし"}

## 市場調査：ビジネス機会
${opportunitiesList || "機会データなし"}

## 市場調査：市場ギャップ
${JSON.stringify(marketGaps, null, 2)}

## 需要予測サマリー
${data.marketResearch?.demandForecast.summary || "情報なし"}

## 分析指示
各ビジネス機会と市場ギャップを、当アプリの現状と照らし合わせて優先順位付けしてください。

1. **prioritizedOpportunities**: 優先順位付けされた機会リスト（5-8件）
   - **opportunity**: 機会名（市場調査データから）
   - **fitScore**: 当アプリとの適合度
     - "excellent": 既存機能・リソースで即座に対応可能
     - "good": 小規模な追加開発で対応可能
     - "moderate": 中規模の開発・投資が必要
     - "poor": 大規模な方向転換が必要
   - **fitReason**: 適合度の理由（1-2文）
   - **requiredChanges**: 必要な変更・施策（2-4点）
   - **estimatedEffort**: 実装工数の見積もり（low/medium/high）
   - **recommendedAction**: 推奨アクション（1文）

2. **strategicRecommendation**: Strategic recommendations (3-4 sentences)
   - Priority opportunities to pursue
   - Resource allocation proposals

${this.translations.respondInLanguage}`;
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new AnalyzeMarketingData(options).build(regions);

// Export class for testing
module.exports.AnalyzeMarketingData = AnalyzeMarketingData;
