/**
 * Marketing analysis data types (AI-generated).
 *
 * マーケティング分析データ型（AI生成）。
 */

/**
 * Key metric with trend indicator.
 *
 * トレンド指標付きの主要メトリクス。
 */
export interface KeyMetric {
    metric: string;
    value: string;
    trend: "up" | "down" | "stable";
}

/**
 * Overall analysis summary.
 *
 * 全体分析のサマリー。
 */
export interface OverallAnalysis {
    summary: string;
    highlights: string[];
    concerns: string[];
    keyMetrics: KeyMetric[];
}

/**
 * Improvement suggestion from AI analysis.
 *
 * AI分析からの改善提案。
 */
export interface ImprovementSuggestion {
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    category: "user_acquisition" | "retention" | "engagement" | "monetization" | "quality" | "development";
    expectedImpact?: string;
}

/**
 * Sentiment breakdown for reviews.
 *
 * レビューの感情分析内訳。
 */
export interface SentimentBreakdown {
    positive: number;
    neutral: number;
    negative: number;
}

/**
 * Review analysis data.
 *
 * レビュー分析データ。
 */
export interface ReviewAnalysis {
    sentiment: SentimentBreakdown;
    commonThemes: string[];
    actionableInsights: string[];
}

/**
 * Trend analysis data.
 *
 * トレンド分析データ。
 */
export interface TrendAnalysis {
    userGrowthTrend: string;
    engagementTrend: string;
    ratingTrend: string;
    predictions: string[];
}

/**
 * Complete marketing analytics data from AI analysis.
 *
 * AI分析からの完全なマーケティング分析データ。
 */
export interface MarketingAnalyticsData {
    overallAnalysis?: OverallAnalysis;
    improvementSuggestions?: ImprovementSuggestion[];
    trendAnalysis?: TrendAnalysis;
    reviewAnalysis?: ReviewAnalysis;
    generatedAt: string;
}
