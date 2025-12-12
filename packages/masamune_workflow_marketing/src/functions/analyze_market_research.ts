import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, WorkflowContext } from "@mathrunet/masamune_workflow";
import { GoogleGenAI, Type } from "@google/genai";
import {
    MarketResearch,
    MarketResearchData,
    DemandForecast,
    RevenueStrategy,
    TrafficStrategy,
} from "../models";

/**
 * Project input data for analysis.
 */
interface ProjectInput {
    description?: string;
    concept?: string;
    goal?: string;
    target?: string;
    kpi?: { [key: string]: any };
}

/**
 * A function for analyzing market research data.
 *
 * 市場調査データを分析するためのFunction。
 */
export class AnalyzeMarketResearch extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     *
     * 関数のID。
     */
    id: string = "analyze_market_research";

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

        // 1. task.resultsからmarketResearchDataを取得
        const marketResearchData = task.results?.marketResearchData as MarketResearchData | undefined;

        if (!marketResearchData || "error" in marketResearchData) {
            console.log("AnalyzeMarketResearch: No valid marketResearchData found in task.results");
            return {
                ...action,
                results: {
                    marketResearch: {
                        error: "No valid marketResearchData found. Run research_market action first.",
                        generatedAt: new Date().toISOString(),
                    },
                }
            };
        }

        // 2. task.projectからプロジェクトデータを取得
        const projectData = await this.loadProjectData(task);

        // 3. 環境変数からプロジェクト情報を取得
        const gcpProjectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
        const region = process.env.GCLOUD_REGION || "us-central1";
        const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
        const inputPrice = Number(process.env.MODEL_INPUT_PRICE || 0.0000003);
        const outputPrice = Number(process.env.MODEL_OUTPUT_PRICE || 0.0000025);

        if (!gcpProjectId) {
            console.error("AnalyzeMarketResearch: No GCP project ID found");
            return {
                ...action,
                results: {
                    marketResearch: {
                        error: "No GCP project ID configured",
                        generatedAt: new Date().toISOString(),
                    },
                }
            };
        }

        try {
            // 4. GoogleGenAI を初期化（VertexAI モード）
            const genai = new GoogleGenAI({
                vertexai: true,
                project: gcpProjectId,
                location: region,
            });

            // 5. プロンプトを構築
            const prompt = this.buildAnalysisPrompt(projectData, marketResearchData);

            // 6. Gemini APIを呼び出し
            console.log("AnalyzeMarketResearch: Calling Gemini API for deep analysis...");
            const response = await genai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: this.getResponseSchema(),
                }
            });

            const text = response.text;
            if (!text) {
                throw new Error("Failed to generate content from Gemini.");
            }

            // 7. JSONをパース
            const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
            const firstBrace = cleanedText.indexOf("{");
            const lastBrace = cleanedText.lastIndexOf("}");

            if (firstBrace === -1 || lastBrace === -1) {
                throw new Error("No JSON object found in response.");
            }

            const jsonText = cleanedText.substring(firstBrace, lastBrace + 1);
            const analysisResult = JSON.parse(jsonText);

            // 8. トークン使用量とコストを計算
            const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
            const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
            const cost = inputTokens * inputPrice + outputTokens * outputPrice;

            console.log(`AnalyzeMarketResearch: Generated successfully. Tokens: ${inputTokens} input, ${outputTokens} output. Cost: $${cost.toFixed(6)}`);

            // 9. 結果を返却（researchDataを含める）
            const marketResearch: MarketResearch = {
                ...analysisResult,
                researchData: marketResearchData,
                generatedAt: new Date().toISOString(),
            };

            return {
                ...action,
                usage: (action.usage ?? 0) + cost,
                results: {
                    marketResearch,
                }
            };

        } catch (error: any) {
            console.error("AnalyzeMarketResearch: Failed to analyze market research", error);
            return {
                ...action,
                results: {
                    marketResearch: {
                        error: error.message,
                        generatedAt: new Date().toISOString(),
                    },
                }
            };
        }
    }

    /**
     * Load project data from task.project reference.
     */
    private async loadProjectData(task: any): Promise<ProjectInput> {
        const projectRef = task.project;
        if (!projectRef) {
            return {};
        }

        try {
            const projectDoc = await projectRef.load();
            if (!projectDoc.exists) {
                return {};
            }
            const data = projectDoc.data();
            return {
                description: data?.description,
                concept: data?.concept,
                goal: data?.goal,
                target: data?.target,
                kpi: data?.kpi,
            };
        } catch (error) {
            console.error("AnalyzeMarketResearch: Failed to load project data", error);
            return {};
        }
    }

    /**
     * Build the analysis prompt for Gemini.
     */
    private buildAnalysisPrompt(project: ProjectInput, researchData: MarketResearchData): string {
        return `あなたは戦略的ビジネスアナリストです。以下のプロジェクト情報と市場調査データに基づいて、詳細な戦略分析を行ってください。

## プロジェクト情報
- **概要**: ${project.description || "未提供"}
- **コンセプト**: ${project.concept || "未提供"}
- **目標**: ${project.goal || "未提供"}
- **ターゲット層**: ${project.target || "未提供"}
- **KPI**: ${project.kpi ? JSON.stringify(project.kpi, null, 2) : "未提供"}

## 市場調査データ
${JSON.stringify(researchData, null, 2)}

## 分析タスク

### 1. 需要予測
以下の時点での詳細な需要予測を行ってください：
- **現在**: 現在の市場需要
- **3ヶ月後**: 短期見通し
- **1年後**: 中期予測
- **3年後**: 長期予測
- **5年後**: 戦略的視野

各期間について以下を評価してください：
- 需要レベル（very_high/high/medium/low/very_low）
- 予測の主要因
- 予測の信頼度（high/medium/low）

### 2. 収益向上施策
収益を増加させるための具体的な施策を3〜5つ提案してください：
- 価格最適化
- 新しいマネタイズモデル
- 市場拡大機会
- パートナーシップ機会
- プロダクト強化

各施策について以下を含めてください：
- 優先度（high/medium/low）
- 期待される効果
- 実装ステップ
- 追跡すべきKPI
- タイムライン

### 3. 流入向上施策
ユーザー獲得・流入を増加させるための具体的な施策を3〜5つ提案してください：
- オーガニック成長戦術
- 有料獲得チャネル
- コンテンツマーケティング
- バイラル/紹介メカニズム
- パートナーシップ駆動型成長

### 4. キーインサイト
調査と分析から得られた重要な洞察を5〜7つリストアップしてください。

## 出力指示
- 提供された調査データに基づいて全ての推奨を行ってください
- 実行可能で具体的な戦略を優先してください
- 実装タイムラインを含めてください
- 成功を追跡するための主要指標を特定してください
- 結果は日本語で出力してください`;
    }

    /**
     * Get the response schema for structured output.
     */
    private getResponseSchema(): any {
        return {
            type: Type.OBJECT,
            properties: {
                summary: { type: Type.STRING },
                demandForecast: {
                    type: Type.OBJECT,
                    properties: {
                        currentDemand: this.getDemandPeriodSchema(),
                        threeMonthForecast: this.getDemandPeriodSchema(),
                        oneYearForecast: this.getDemandPeriodSchema(),
                        threeYearForecast: this.getDemandPeriodSchema(),
                        fiveYearForecast: this.getDemandPeriodSchema(),
                        overallTrend: {
                            type: Type.STRING,
                            enum: ["rapidly_growing", "growing", "stable", "declining", "rapidly_declining"]
                        },
                        summary: { type: Type.STRING },
                    },
                    required: ["currentDemand", "threeMonthForecast", "oneYearForecast", "threeYearForecast", "fiveYearForecast", "overallTrend", "summary"]
                },
                revenueStrategies: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            description: { type: Type.STRING },
                            type: {
                                type: Type.STRING,
                                enum: ["pricing", "monetization", "expansion", "partnership", "product", "marketing"]
                            },
                            priority: {
                                type: Type.STRING,
                                enum: ["high", "medium", "low"]
                            },
                            expectedImpact: { type: Type.STRING },
                            implementationSteps: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            },
                            kpiMetrics: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            },
                            timeline: { type: Type.STRING },
                        },
                        required: ["name", "description", "type", "priority", "expectedImpact", "implementationSteps", "kpiMetrics", "timeline"]
                    }
                },
                trafficStrategies: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            description: { type: Type.STRING },
                            channel: {
                                type: Type.STRING,
                                enum: ["organic_search", "paid_ads", "social_media", "content_marketing", "referral", "email", "partnerships", "other"]
                            },
                            priority: {
                                type: Type.STRING,
                                enum: ["high", "medium", "low"]
                            },
                            expectedImpact: { type: Type.STRING },
                            implementationSteps: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            },
                            estimatedCost: { type: Type.STRING },
                            timeline: { type: Type.STRING },
                        },
                        required: ["name", "description", "channel", "priority", "expectedImpact", "implementationSteps", "timeline"]
                    }
                },
                keyInsights: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                },
            },
            required: ["summary", "demandForecast", "revenueStrategies", "trafficStrategies", "keyInsights"]
        };
    }

    /**
     * Get the schema for a demand forecast period.
     */
    private getDemandPeriodSchema(): any {
        return {
            type: Type.OBJECT,
            properties: {
                period: { type: Type.STRING },
                demandLevel: {
                    type: Type.STRING,
                    enum: ["very_high", "high", "medium", "low", "very_low"]
                },
                estimatedMarketSize: { type: Type.STRING },
                growthRate: { type: Type.STRING },
                keyFactors: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                },
                confidence: {
                    type: Type.STRING,
                    enum: ["high", "medium", "low"]
                },
            },
            required: ["period", "demandLevel", "keyFactors", "confidence"]
        };
    }
}

/**
 * Export the function module.
 */
module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => {
    const instance = new AnalyzeMarketResearch();
    return instance.build(regions);
};
