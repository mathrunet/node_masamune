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
import { getTranslations } from "../locales";

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
            const locale = typeof action.locale === "object"
                ? action.locale["@language"]
                : action.locale;
            const prompt = this.buildAnalysisPrompt(projectData, marketResearchData, locale);

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
    private buildAnalysisPrompt(project: ProjectInput, researchData: MarketResearchData, locale?: string): string {
        const t = getTranslations(locale);
        return `You are a strategic business analyst. Based on the following project information and market research data, conduct a detailed strategic analysis.

## Project Information
- **Description**: ${project.description || "Not provided"}
- **Concept**: ${project.concept || "Not provided"}
- **Goal**: ${project.goal || "Not provided"}
- **Target Audience**: ${project.target || "Not provided"}
- **KPIs**: ${project.kpi ? JSON.stringify(project.kpi, null, 2) : "Not provided"}

## Market Research Data
${JSON.stringify(researchData, null, 2)}

## Analysis Tasks

### 1. Demand Forecast
Provide detailed demand forecasts for the following time periods:
- **Current**: Current market demand
- **3 months**: Short-term outlook
- **1 year**: Medium-term forecast
- **3 years**: Long-term forecast
- **5 years**: Strategic horizon

For each period, evaluate:
- Demand level (very_high/high/medium/low/very_low)
- Key factors driving the forecast
- Forecast confidence (high/medium/low)

### 2. Revenue Enhancement Strategies
Propose 3-5 specific strategies to increase revenue:
- Pricing optimization
- New monetization models
- Market expansion opportunities
- Partnership opportunities
- Product enhancements

For each strategy, include:
- Priority (high/medium/low)
- Expected impact
- Implementation steps
- KPIs to track
- Timeline

### 3. Traffic Growth Strategies
Propose 3-5 specific strategies to increase user acquisition and traffic:
- Organic growth tactics
- Paid acquisition channels
- Content marketing
- Viral/referral mechanisms
- Partnership-driven growth

### 4. Key Insights
List 5-7 key insights derived from the research and analysis.

## Output Instructions
- Base all recommendations on the provided research data
- Prioritize actionable and specific strategies
- Include implementation timelines
- Identify key metrics for tracking success
- ${t.respondInLanguage}`;
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
