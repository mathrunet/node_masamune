/**
 * App Store data types.
 *
 * App Storeデータ型。
 */

import { RatingDistribution, Review } from "./common";

/**
 * Configuration for App Store Connect API Client.
 *
 * App Store Connect APIクライアントの設定。
 */
export interface AppStoreClientConfig {
    keyId: string;
    issuerId: string;
    privateKeyPath: string;
    appId: string;
    vendorNumber?: string;
}

/**
 * App information from App Store.
 *
 * App Storeからのアプリ情報。
 */
export interface AppStoreAppInfo {
    appId: string;
    name: string;
    bundleId: string;
    sku?: string;
    primaryLocale?: string;
}

/**
 * Ratings data from App Store.
 *
 * App Storeからの評価データ。
 */
export interface AppStoreRatings {
    averageRating: number;
    totalRatings: number;
    ratingDistribution: RatingDistribution;
}

/**
 * Review data from App Store.
 *
 * App Storeからのレビューデータ。
 */
export interface AppStoreReview {
    id: string;
    rating: number;
    title?: string;
    body: string;
    reviewerNickname?: string;
    createdDate: string;
    territory?: string;
}

/**
 * Reviews response from App Store.
 *
 * App Storeからのレビューレスポンス。
 */
export interface AppStoreReviewsResponse {
    reviews: AppStoreReview[];
    nextCursor?: string;
}

/**
 * Options for fetching reviews from App Store.
 *
 * App Storeからのレビュー取得オプション。
 */
export interface AppStoreGetReviewsOptions {
    limit?: number;
    cursor?: string;
    sort?: "MOST_RECENT" | "MOST_HELPFUL";
}

/**
 * Aggregated App Store data for marketing analysis.
 *
 * マーケティング分析用の集約されたApp Storeデータ。
 */
export interface AppStoreData {
    appId: string;
    appName?: string;
    averageRating?: number;
    totalRatings?: number;
    ratingDistribution?: RatingDistribution;
    recentReviews?: Review[];
    collectedAt: Date;
}
