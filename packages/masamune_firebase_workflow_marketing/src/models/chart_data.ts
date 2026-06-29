/**
 * Chart generation data types.
 *
 * チャート生成データ型。
 */

import { RatingDistribution } from "./common";
import { SentimentBreakdown } from "./marketing_analysis_data";

/**
 * Chart generation options.
 *
 * チャート生成オプション。
 */
export interface ChartOptions {
    width?: number;
    height?: number;
    backgroundColor?: string;
    format?: "png" | "webp" | "svg";
}

/**
 * Demographics chart data.
 *
 * 人口統計チャートデータ。
 */
export interface DemographicsChartData {
    labels: string[];
    values: number[];
}

/**
 * Country distribution chart data.
 *
 * 国別分布チャートデータ。
 */
export interface CountryDistributionChartData {
    labels: string[];
    values: number[];
}

/**
 * Engagement chart data.
 *
 * エンゲージメントチャートデータ。
 */
export interface EngagementChartData {
    dau: number;
    wau: number;
    mau: number;
}

/**
 * Sentiment chart data.
 *
 * 感情分析チャートデータ。
 */
export interface SentimentChartData {
    positive: number;
    neutral: number;
    negative: number;
}

/**
 * Generated chart buffers.
 *
 * 生成されたチャートバッファ。
 */
export interface GeneratedCharts {
    ratingDistribution?: Buffer;
    demographics?: Buffer;
    countryDistribution?: Buffer;
    engagement?: Buffer;
    sentiment?: Buffer;
    retentionRatio?: Buffer;
}

/**
 * Input data for chart generation.
 *
 * チャート生成用の入力データ。
 */
export interface ChartInputData {
    googlePlayConsole?: {
        ratingDistribution?: RatingDistribution;
        [key: string]: any;
    };
    appStore?: {
        ratingDistribution?: RatingDistribution;
        [key: string]: any;
    };
    firebaseAnalytics?: {
        dau?: number;
        wau?: number;
        mau?: number;
        demographics?: {
            ageGroups?: { [key: string]: number };
            countryDistribution?: { [key: string]: number };
        };
        [key: string]: any;
    };
    marketingAnalytics?: {
        reviewAnalysis?: {
            sentiment?: SentimentBreakdown;
        };
        [key: string]: any;
    };
}
