import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, Project, WorkflowContext } from "@mathrunet/masamune_workflow";
import { VertexAI, SchemaType } from "@google-cloud/vertexai";
import {
    MarketResearchData,
    MarketPotential,
    CompetitorAnalysis,
    BusinessOpportunity,
} from "../models";
import { getTranslations } from "../locales";

/**
 * Project input data for market research.
 */
interface ProjectInput {
    description?: string;
    concept?: string;
    goal?: string;
    target?: string;
    kpi?: { [key: string]: any };
}

/**
 * A function for conducting market research using Gemini with Google Search.
 *
 * Gemini + Google Searchを使用して市場調査を行うためのFunction。
 */
export class ResearchMarket extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     *
     * 関数のID。
     */
    id: string = "research_market";

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

        // 1. task.projectからプロジェクトデータを取得
        const projectData = await this.loadProjectData(task);

        // 2. プロジェクトデータの検証
        if (!this.hasValidProjectData(projectData)) {
            console.log("ResearchMarket: Insufficient project data for market research");
            return {
                ...action,
                results: {
                    marketResearchData: {
                        error: "Insufficient project data. At least 'description' is required.",
                        generatedAt: new Date().toISOString(),
                    },
                }
            };
        }

        // 3. 環境変数からプロジェクト情報を取得
        const gcpProjectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
        const region = process.env.GCLOUD_REGION || "us-central1";
        const modelName = process.env.GEMINI_MODEL || "gemini-2.5-pro";
        const inputPrice = Number(process.env.MODEL_INPUT_PRICE || 0.0000003);
        const outputPrice = Number(process.env.MODEL_OUTPUT_PRICE || 0.0000025);

        if (!gcpProjectId) {
            console.error("ResearchMarket: No GCP project ID found");
            return {
                ...action,
                results: {
                    marketResearchData: {
                        error: "No GCP project ID configured",
                        generatedAt: new Date().toISOString(),
                    },
                }
            };
        }

        try {
            // 4. VertexAI を初期化
            const vertexAI = new VertexAI({ project: gcpProjectId, location: region });

            // 5. Google Searchを有効にしたモデルを取得
            const model = vertexAI.preview.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: this.getResponseSchema(),
                },
                tools: [{
                    // @ts-ignore - googleSearch is a valid tool for grounding
                    googleSearch: {}
                }]
            });

            // 6. プロンプトを構築
            const locale = typeof action.locale === "object"
                ? action.locale["@language"]
                : action.locale;
            const prompt = this.buildResearchPrompt(projectData, locale);

            // 7. Gemini APIを呼び出し
            console.log("ResearchMarket: Calling Gemini API with Google Search grounding...");
            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.candidates?.[0].content.parts[0].text;

            if (!text) {
                throw new Error("Failed to generate content from Gemini.");
            }

            // 8. JSONをパース
            const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
            const firstBrace = cleanedText.indexOf("{");
            const lastBrace = cleanedText.lastIndexOf("}");

            if (firstBrace === -1 || lastBrace === -1) {
                throw new Error("No JSON object found in response.");
            }

            const jsonText = cleanedText.substring(firstBrace, lastBrace + 1);
            const researchResult = JSON.parse(jsonText) as MarketResearchData;

            // 9. トークン使用量とコストを計算
            const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
            const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
            const cost = inputTokens * inputPrice + outputTokens * outputPrice;

            console.log(`ResearchMarket: Generated successfully. Tokens: ${inputTokens} input, ${outputTokens} output. Cost: $${cost.toFixed(6)}`);

            // 10. 結果を返却
            return {
                ...action,
                usage: (action.usage ?? 0) + cost,
                results: {
                    marketResearchData: {
                        ...researchResult,
                        generatedAt: new Date().toISOString(),
                    },
                }
            };

        } catch (error: any) {
            console.error("ResearchMarket: Failed to conduct market research", error);
            return {
                ...action,
                results: {
                    marketResearchData: {
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
            console.error("ResearchMarket: Failed to load project data", error);
            return {};
        }
    }

    /**
     * Check if project data is sufficient for market research.
     */
    private hasValidProjectData(project: ProjectInput): boolean {
        // At minimum, description is required
        return !!project.description && project.description.trim().length > 0;
    }

    /**
     * Build the research prompt for Gemini.
     */
    private buildResearchPrompt(project: ProjectInput, locale?: string): string {
        const t = getTranslations(locale);
        return `You are a professional market research analyst. Based on the following project information, conduct comprehensive market research using Google Search.

## Project Information
- **Description**: ${project.description || "Not provided"}
- **Concept**: ${project.concept || "Not provided"}
- **Goal**: ${project.goal || "Not provided"}
- **Target Audience**: ${project.target || "Not provided"}
- **KPIs**: ${project.kpi ? JSON.stringify(project.kpi, null, 2) : "Not provided"}

## Research Objectives
Investigate and analyze the market from the following perspectives:

### 1. Market Potential Analysis
- Current market size and growth trends
- TAM (Total Addressable Market), SAM (Serviceable Addressable Market), SOM (Serviceable Obtainable Market) estimates
- Key market drivers
- Market entry barriers
- Target market segments

### 2. Competitive Analysis
- Direct competitors (3-5 companies)
- Indirect competitors (adjacent market players)
- Strengths and weaknesses of each competitor
- Pricing and business models
- Market positioning
- Differentiation points against competitors
- Market gaps (unmet needs)

### 3. Business Opportunities
- Opportunities arising from market gaps
- Opportunities based on emerging trends
- Opportunities from technology shifts
- Underserved target segments

## Research Instructions
- Use Google Search to collect real-time market data
- Include quantitative data (market size, growth rate, market share, etc.) whenever possible
- Record source URLs
- Prioritize data from the last 12 months
- ${t.respondInLanguage}`;
    }

    /**
     * Get the response schema for structured output.
     */
    private getResponseSchema(): any {
        return {
            type: SchemaType.OBJECT,
            properties: {
                marketPotential: {
                    type: SchemaType.OBJECT,
                    properties: {
                        summary: { type: SchemaType.STRING },
                        tam: { type: SchemaType.STRING },
                        sam: { type: SchemaType.STRING },
                        som: { type: SchemaType.STRING },
                        marketDrivers: {
                            type: SchemaType.ARRAY,
                            items: { type: SchemaType.STRING }
                        },
                        marketBarriers: {
                            type: SchemaType.ARRAY,
                            items: { type: SchemaType.STRING }
                        },
                        targetSegments: {
                            type: SchemaType.ARRAY,
                            items: { type: SchemaType.STRING }
                        },
                    },
                    required: ["summary", "marketDrivers", "marketBarriers", "targetSegments"]
                },
                competitorAnalysis: {
                    type: SchemaType.OBJECT,
                    properties: {
                        competitors: {
                            type: SchemaType.ARRAY,
                            items: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    name: { type: SchemaType.STRING },
                                    description: { type: SchemaType.STRING },
                                    marketShare: { type: SchemaType.STRING },
                                    strengths: {
                                        type: SchemaType.ARRAY,
                                        items: { type: SchemaType.STRING }
                                    },
                                    weaknesses: {
                                        type: SchemaType.ARRAY,
                                        items: { type: SchemaType.STRING }
                                    },
                                    pricing: { type: SchemaType.STRING },
                                    targetAudience: { type: SchemaType.STRING },
                                    sourceUrl: { type: SchemaType.STRING },
                                },
                                required: ["name", "description", "strengths", "weaknesses"]
                            }
                        },
                        marketLandscape: { type: SchemaType.STRING },
                        competitiveAdvantages: {
                            type: SchemaType.ARRAY,
                            items: { type: SchemaType.STRING }
                        },
                        differentiationOpportunities: {
                            type: SchemaType.ARRAY,
                            items: { type: SchemaType.STRING }
                        },
                        marketGaps: {
                            type: SchemaType.ARRAY,
                            items: { type: SchemaType.STRING }
                        },
                    },
                    required: ["competitors", "marketLandscape", "competitiveAdvantages", "differentiationOpportunities", "marketGaps"]
                },
                businessOpportunities: {
                    type: SchemaType.ARRAY,
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            title: { type: SchemaType.STRING },
                            description: { type: SchemaType.STRING },
                            type: {
                                type: SchemaType.STRING,
                                enum: ["market_gap", "emerging_trend", "underserved_segment", "technology_shift", "regulatory_change", "other"]
                            },
                            potentialImpact: {
                                type: SchemaType.STRING,
                                enum: ["high", "medium", "low"]
                            },
                            timeframe: {
                                type: SchemaType.STRING,
                                enum: ["immediate", "short_term", "medium_term", "long_term"]
                            },
                            requirements: {
                                type: SchemaType.ARRAY,
                                items: { type: SchemaType.STRING }
                            },
                            risks: {
                                type: SchemaType.ARRAY,
                                items: { type: SchemaType.STRING }
                            },
                        },
                        required: ["title", "description", "type", "potentialImpact", "timeframe", "requirements", "risks"]
                    }
                },
                dataSources: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING }
                },
            },
            required: ["marketPotential", "competitorAnalysis", "businessOpportunities", "dataSources"]
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
    const instance = new ResearchMarket();
    return instance.build(regions);
};
