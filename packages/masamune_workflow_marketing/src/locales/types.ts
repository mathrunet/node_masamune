/**
 * Marketing Translations Type Definition
 *
 * Defines all translatable strings for the marketing workflow package.
 */

/**
 * Marketing translations interface.
 * All strings used in reports, PDFs, and AI prompts.
 */
export interface MarketingTranslations {
    // AI Language Instructions
    respondInLanguage: string;
    languageName: string;

    // Report Headers
    executiveSummary: string;
    highlightsAndConcerns: string;
    userAnalytics: string;
    ratingsAndReviews: string;
    improvementSuggestions: string;
    competitivePositioning: string;
    marketOpportunityPriority: string;
    trendAnalysisAndPredictions: string;
    codebaseImprovements: string;

    // Competitive Positioning
    marketPosition: string;
    competitorComparison: string;
    ourStrengths: string;
    ourWeaknesses: string;
    battleStrategy: string;
    differentiationStrategy: string;
    quickWins: string;

    // Market Opportunity
    prioritizedOpportunities: string;
    opportunity: string;
    fitScore: string;
    effort: string;
    reason: string;
    requiredChanges: string;
    recommendedAction: string;
    strategicRecommendations: string;

    // GitHub Improvements
    relatedFeature: string;
    fileModifications: string;
    expectedImpact: string;

    // Effort Levels
    low: string;
    medium: string;
    high: string;

    // Fit Scores
    excellent: string;
    good: string;
    moderate: string;
    poor: string;

    // Misc
    continued: string;
    highlights: string;
    concerns: string;

    // Report metadata
    reportType: string;
    dailyReport: string;
    weeklyReport: string;
    monthlyReport: string;
    period: string;
    generated: string;
    dataSources: string;
    aiAnalysis: string;

    // User Analytics
    activeUsers: string;
    sessionStatistics: string;
    avgSessionDuration: string;
    sessionsPerUser: string;
    retention: string;
    ageDemographics: string;
    countryDistribution: string;
    newUsers: string;

    // Ratings & Reviews
    overallRatings: string;
    platform: string;
    rating: string;
    totalRatings: string;
    ratingDistribution: string;
    sentimentAnalysis: string;
    positive: string;
    neutral: string;
    negative: string;
    commonThemes: string;
    actionableInsights: string;

    // Trend Analysis
    userGrowth: string;
    engagement: string;
    ratings: string;
    predictions: string;

    // Table Headers
    metric: string;
    value: string;
    trend: string;
    percentage: string;

    // Code modification types
    add: string;
    modify: string;
    refactor: string;
    optimize: string;
    current: string;
    proposed: string;
    file: string;
    type: string;

    // PDF specific
    pageOf: string;
    generatedBy: string;

    // Repository info
    repository: string;
    framework: string;
}

/**
 * Supported locale codes.
 */
export type SupportedLocale =
    | "en"
    | "ja"
    | "zh_CN"
    | "ko_KR"
    | "es_ES"
    | "fr_FR"
    | "de_DE"
    | "pt_PT"
    | "ru_RU"
    | "id_ID";

/**
 * Font family types for PDF generation.
 */
export type FontFamily =
    | "NotoSansJP"
    | "NotoSansSC"
    | "NotoSansKR"
    | "NotoSans"
    | "Helvetica";
