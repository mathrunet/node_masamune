/**
 * PDF generation data types.
 *
 * PDF生成データ型。
 */

import { RatingDistribution } from "./common";
import { GeneratedCharts } from "./chart_data";
import { OverallAnalysis, ImprovementSuggestion, TrendAnalysis, ReviewAnalysis, GitHubImprovementsAnalysis } from "./marketing_analysis_data";
import { GitHubRepositoryAnalysis } from "./github_analysis_data";

/**
 * Input data for PDF generation.
 *
 * PDF生成用の入力データ。
 */
export interface PDFInputData {
    googlePlayConsole?: {
        packageName?: string;
        averageRating?: number;
        totalRatings?: number;
        ratingDistribution?: RatingDistribution;
        [key: string]: any;
    };
    appStore?: {
        appId?: string;
        appName?: string;
        averageRating?: number;
        totalRatings?: number;
        ratingDistribution?: RatingDistribution;
        [key: string]: any;
    };
    firebaseAnalytics?: {
        dau?: number;
        wau?: number;
        mau?: number;
        newUsers?: number;
        totalUsers?: number;
        averageSessionDuration?: number;
        sessionsPerUser?: number;
        demographics?: {
            ageGroups?: { [key: string]: number };
            countryDistribution?: { [key: string]: number };
        };
        [key: string]: any;
    };
    marketingAnalytics?: {
        overallAnalysis?: OverallAnalysis;
        improvementSuggestions?: ImprovementSuggestion[];
        trendAnalysis?: TrendAnalysis;
        reviewAnalysis?: ReviewAnalysis;
        generatedAt?: string;
        [key: string]: any;
    };
    /** GitHub repository analysis data */
    githubRepository?: GitHubRepositoryAnalysis | { [key: string]: any };
    /** GitHub-aware improvements */
    githubImprovements?: GitHubImprovementsAnalysis | { [key: string]: any };
}

/**
 * Options for PDF generation.
 *
 * PDF生成オプション。
 */
export interface PDFGenerationOptions {
    data: PDFInputData;
    charts?: GeneratedCharts;
    appName?: string;
    reportType?: "daily" | "weekly" | "monthly";
    dateRange?: {
        startDate: string;
        endDate: string;
    };
}
