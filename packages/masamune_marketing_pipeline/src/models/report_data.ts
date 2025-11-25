import { Timestamp } from "firebase-admin/firestore";
import {
    DateRange,
    GooglePlayData,
    AppStoreData,
    FirebaseAnalyticsData,
    GitHubData,
} from "./marketing_data";

/**
 * Trend direction type.
 * トレンドの方向性。
 */
export type TrendDirection = "up" | "down" | "stable";

/**
 * Trend analysis for key metrics.
 * 主要メトリクスのトレンド分析。
 */
export interface TrendAnalysis {
    downloads: TrendDirection;
    ratings: TrendDirection;
    activeUsers: TrendDirection;
    engagement: TrendDirection;

    downloadChangePercent?: number;
    ratingChangePercent?: number;
    activeUsersChangePercent?: number;
    engagementChangePercent?: number;
}

/**
 * Improvement suggestion from AI analysis.
 * AI分析からの改善提案。
 */
export interface ImprovementSuggestion {
    id: string;
    category: "ux" | "marketing" | "performance" | "feature" | "support" | "other";
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
    expectedImpact?: string;
    /** Whether a GitHub issue has been created for this. */
    issueCreated?: boolean;
    /** GitHub issue URL if created. */
    issueUrl?: string;
}

/**
 * AI-generated analysis results.
 * AIによる分析結果。
 */
export interface AIAnalysis {
    /** Overall summary of the report (総評). */
    summary: string;
    /** Key highlights and positive points. */
    highlights: string[];
    /** Areas of concern. */
    concerns: string[];
    /** Improvement suggestions (改善点). */
    improvements: ImprovementSuggestion[];
    /** Trend analysis. */
    trends?: TrendAnalysis;
    /** Generated at timestamp. */
    generatedAt: Date;
    /** Model used for generation. */
    modelUsed?: string;
}

/**
 * Graph data for the report.
 * レポート用のグラフデータ。
 */
export interface ReportGraphs {
    /** Downloads trend chart (base64 or URL). */
    downloadsChart?: string;
    /** Ratings trend chart. */
    ratingsTrend?: string;
    /** User demographics chart. */
    userDemographics?: string;
    /** Country distribution chart. */
    countryDistribution?: string;
    /** Engagement metrics chart. */
    engagementChart?: string;
    /** Revenue chart. */
    revenueChart?: string;
}

/**
 * Cover image data.
 * カバー画像データ。
 */
export interface CoverImage {
    /** Image URL in Cloud Storage. */
    url: string;
    /** Prompt used to generate the image. */
    prompt: string;
    /** Generation timestamp. */
    generatedAt: Date;
}

/**
 * Report status type.
 * レポートのステータスタイプ。
 */
export type ReportStatus = "draft" | "completed" | "archived";

/**
 * Complete marketing report.
 * 完全なマーケティングレポート。
 *
 * Path: plugins/marketing/reports/{reportId}
 */
export interface MarketingReport {
    /** Unique identifier for the report. */
    reportId: string;
    /** App ID this report is for. */
    appId: string;
    /** Display name of the app. */
    appName: string;
    /** Type of report. */
    reportType: "daily" | "weekly" | "monthly";
    /** Date range covered by the report. */
    dateRange: DateRange;

    // Raw collected data
    rawData: {
        googlePlay?: GooglePlayData;
        appStore?: AppStoreData;
        firebaseAnalytics?: FirebaseAnalyticsData;
        github?: GitHubData;
    };

    // AI-generated analysis
    analysis?: AIAnalysis;

    // Generated graphs
    graphs?: ReportGraphs;

    // Cover image
    coverImage?: CoverImage;

    // PDF
    pdfUrl?: string;
    pdfGeneratedAt?: Timestamp;

    // Metadata
    status: ReportStatus;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

/**
 * Report summary for list views.
 * 一覧表示用のレポートサマリー。
 */
export interface ReportSummary {
    reportId: string;
    appId: string;
    appName: string;
    reportType: "daily" | "weekly" | "monthly";
    dateRange: DateRange;
    status: ReportStatus;
    highlights?: string[];
    pdfUrl?: string;
    createdAt: Timestamp;
}
