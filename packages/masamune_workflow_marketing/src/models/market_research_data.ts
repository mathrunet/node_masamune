/**
 * Market research data types.
 *
 * 市場調査データ型。
 */

/**
 * Demand level indicator.
 *
 * 需要レベル指標。
 */
export type DemandLevel = "very_high" | "high" | "medium" | "low" | "very_low";

/**
 * Trend direction indicator.
 *
 * トレンド方向指標。
 */
export type TrendDirection = "rapidly_growing" | "growing" | "stable" | "declining" | "rapidly_declining";

/**
 * Confidence level for forecasts.
 *
 * 予測の信頼度。
 */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Strategy priority level.
 *
 * 施策の優先度。
 */
export type StrategyPriority = "high" | "medium" | "low";

/**
 * Business opportunity type.
 *
 * ビジネス機会の種類。
 */
export type BusinessOpportunityType =
    | "market_gap"
    | "emerging_trend"
    | "underserved_segment"
    | "technology_shift"
    | "regulatory_change"
    | "other";

/**
 * Opportunity timeframe.
 *
 * 機会の時間枠。
 */
export type OpportunityTimeframe = "immediate" | "short_term" | "medium_term" | "long_term";

/**
 * Revenue strategy type.
 *
 * 収益施策の種類。
 */
export type RevenueStrategyType =
    | "pricing"
    | "monetization"
    | "expansion"
    | "partnership"
    | "product"
    | "marketing";

/**
 * Traffic strategy channel.
 *
 * 流入施策のチャネル。
 */
export type TrafficChannel =
    | "organic_search"
    | "paid_ads"
    | "social_media"
    | "content_marketing"
    | "referral"
    | "email"
    | "partnerships"
    | "other";

/**
 * Market potential analysis.
 *
 * 市場ポテンシャル分析。
 */
export interface MarketPotential {
    /** Overall market assessment summary */
    summary: string;
    /** Total addressable market (TAM) */
    tam?: string;
    /** Serviceable addressable market (SAM) */
    sam?: string;
    /** Serviceable obtainable market (SOM) */
    som?: string;
    /** Key market drivers */
    marketDrivers: string[];
    /** Market barriers */
    marketBarriers: string[];
    /** Target market segments */
    targetSegments: string[];
}

/**
 * Competitor information.
 *
 * 競合情報。
 */
export interface Competitor {
    /** Competitor name/service */
    name: string;
    /** Brief description */
    description: string;
    /** Estimated market share (if known) */
    marketShare?: string;
    /** Key strengths */
    strengths: string[];
    /** Key weaknesses */
    weaknesses: string[];
    /** Pricing model/range (if known) */
    pricing?: string;
    /** Target audience */
    targetAudience?: string;
    /** Source URL (from Google Search) */
    sourceUrl?: string;
}

/**
 * Competitor analysis results.
 *
 * 競合分析結果。
 */
export interface CompetitorAnalysis {
    /** List of identified competitors */
    competitors: Competitor[];
    /** Market landscape summary */
    marketLandscape: string;
    /** Competitive advantages for the project */
    competitiveAdvantages: string[];
    /** Differentiation opportunities */
    differentiationOpportunities: string[];
    /** Market gaps identified */
    marketGaps: string[];
}

/**
 * Business opportunity identified through research.
 *
 * 調査で特定されたビジネス機会。
 */
export interface BusinessOpportunity {
    /** Opportunity title */
    title: string;
    /** Detailed description */
    description: string;
    /** Opportunity type */
    type: BusinessOpportunityType;
    /** Potential impact */
    potentialImpact: StrategyPriority;
    /** Time to capitalize */
    timeframe: OpportunityTimeframe;
    /** Required resources/actions */
    requirements: string[];
    /** Associated risks */
    risks: string[];
}

/**
 * Market research data (Action 1 output).
 *
 * 市場調査データ（Action 1の出力）。
 */
export interface MarketResearchData {
    /** Market potential analysis */
    marketPotential: MarketPotential;
    /** Competitor analysis */
    competitorAnalysis: CompetitorAnalysis;
    /** Identified business opportunities */
    businessOpportunities: BusinessOpportunity[];
    /** Data sources used (from Google Search) */
    dataSources: string[];
    /** Generation timestamp */
    generatedAt: string;
}

/**
 * Demand forecast for a specific time period.
 *
 * 特定期間の需要予測。
 */
export interface DemandForecastPeriod {
    /** Time period label (e.g., "now", "3_months", "1_year") */
    period: string;
    /** Demand level assessment */
    demandLevel: DemandLevel;
    /** Estimated market size (if available) */
    estimatedMarketSize?: string;
    /** Growth rate percentage */
    growthRate?: string;
    /** Key factors affecting this forecast */
    keyFactors: string[];
    /** Confidence in this forecast */
    confidence: ConfidenceLevel;
}

/**
 * Complete demand forecast analysis.
 *
 * 完全な需要予測分析。
 */
export interface DemandForecast {
    /** Current market demand assessment */
    currentDemand: DemandForecastPeriod;
    /** 3-month forecast */
    threeMonthForecast: DemandForecastPeriod;
    /** 1-year forecast */
    oneYearForecast: DemandForecastPeriod;
    /** 3-year forecast */
    threeYearForecast: DemandForecastPeriod;
    /** 5-year forecast */
    fiveYearForecast: DemandForecastPeriod;
    /** Overall market trend */
    overallTrend: TrendDirection;
    /** Summary of demand analysis */
    summary: string;
}

/**
 * Revenue strategy recommendation.
 *
 * 収益施策の推奨。
 */
export interface RevenueStrategy {
    /** Strategy name */
    name: string;
    /** Detailed description */
    description: string;
    /** Strategy type */
    type: RevenueStrategyType;
    /** Priority level */
    priority: StrategyPriority;
    /** Expected revenue impact */
    expectedImpact: string;
    /** Implementation steps */
    implementationSteps: string[];
    /** Key metrics to track */
    kpiMetrics: string[];
    /** Timeline for implementation */
    timeline: string;
}

/**
 * Traffic growth strategy recommendation.
 *
 * 流入増加施策の推奨。
 */
export interface TrafficStrategy {
    /** Strategy name */
    name: string;
    /** Detailed description */
    description: string;
    /** Channel type */
    channel: TrafficChannel;
    /** Priority level */
    priority: StrategyPriority;
    /** Expected traffic increase */
    expectedImpact: string;
    /** Implementation steps */
    implementationSteps: string[];
    /** Estimated cost/resources */
    estimatedCost?: string;
    /** Timeline for results */
    timeline: string;
}

/**
 * Complete market research result (Action 2 output).
 *
 * 完全な市場調査結果（Action 2の出力）。
 */
export interface MarketResearch {
    /** Research summary */
    summary: string;
    /** Demand forecast across time periods */
    demandForecast: DemandForecast;
    /** Revenue growth strategies */
    revenueStrategies: RevenueStrategy[];
    /** Traffic growth strategies */
    trafficStrategies: TrafficStrategy[];
    /** Key insights and recommendations */
    keyInsights: string[];
    /** Research data reference (Action 1 results) */
    researchData: MarketResearchData;
    /** Generation timestamp */
    generatedAt: string;
}
