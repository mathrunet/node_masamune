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

/**
 * Code reference for a specific improvement.
 *
 * 特定の改善のためのコード参照。
 */
export interface CodeReference {
    /** File path in the repository */
    filePath: string;
    /** Current functionality description */
    currentFunctionality: string;
    /** Proposed change description */
    proposedChange: string;
    /** Type of modification needed */
    modificationType: "add" | "modify" | "refactor" | "optimize";
}

/**
 * GitHub-aware improvement suggestion with code references.
 *
 * コード参照付きのGitHub対応改善提案。
 */
export interface GitHubImprovementSuggestion {
    /** Brief title of the improvement */
    title: string;
    /** Detailed description of what to improve */
    description: string;
    /** Priority level */
    priority: "high" | "medium" | "low";
    /** Category of improvement */
    category: "user_acquisition" | "retention" | "engagement" | "monetization" | "quality" | "development";
    /** Expected impact if implemented */
    expectedImpact: string;
    /** Code-specific references */
    codeReferences: CodeReference[];
    /** Related feature from GitHub analysis */
    relatedFeature?: string;
}

/**
 * GitHub-based improvements analysis result.
 *
 * GitHubベースの改善分析結果。
 */
export interface GitHubImprovementsAnalysis {
    /** Repository analyzed */
    repository: string;
    /** Framework detected */
    framework: string;
    /** List of improvements with code references */
    improvements: GitHubImprovementSuggestion[];
    /** Summary of improvement areas */
    improvementSummary: string;
    /** When analysis was generated */
    generatedAt: string;
}
