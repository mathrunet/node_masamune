import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, Project, WorkflowContext } from "@mathrunet/masamune_workflow";
import { VertexAI, SchemaType } from "@google-cloud/vertexai";
import {
    MarketResearchData,
    MarketPotential,
    CompetitorAnalysis,
    BusinessOpportunity,
} from "../models";

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
            const prompt = this.buildResearchPrompt(projectData);

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
    private buildResearchPrompt(project: ProjectInput): string {
        return `あなたは専門の市場調査アナリストです。以下のプロジェクト情報に基づいて、Google検索を使用して包括的な市場調査を行ってください。

## プロジェクト情報
- **概要**: ${project.description || "未提供"}
- **コンセプト**: ${project.concept || "未提供"}
- **目標**: ${project.goal || "未提供"}
- **ターゲット層**: ${project.target || "未提供"}
- **KPI**: ${project.kpi ? JSON.stringify(project.kpi, null, 2) : "未提供"}

## 調査目的
以下の観点から市場を調査・分析してください：

### 1. 市場ポテンシャル分析
- 現在の市場規模と成長トレンド
- TAM（Total Addressable Market）、SAM（Serviceable Addressable Market）、SOM（Serviceable Obtainable Market）の推定
- 市場を牽引する主要因
- 市場参入の障壁
- ターゲットとなる市場セグメント

### 2. 競合分析
- 直接競合するサービス・製品（3-5社）
- 間接競合（隣接市場のプレイヤー）
- 各競合の強み・弱み
- 価格帯やビジネスモデル
- 市場でのポジショニング
- 競合に対する差別化ポイント
- 市場のギャップ（満たされていないニーズ）

### 3. ビジネス機会
- 市場のギャップから生まれる機会
- 新興トレンドに基づく機会
- 技術変革やテクノロジーシフトによる機会
- ターゲット未開拓のセグメント

## 調査指示
- Google検索を使用してリアルタイムの市場データを収集してください
- 可能な限り定量的なデータ（市場規模、成長率、シェアなど）を含めてください
- 情報源のURLを記録してください
- 直近12ヶ月以内の最新データを優先してください
- 調査結果は日本語で出力してください`;
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
