/**
 * Date range for data collection.
 * データ収集の日付範囲。
 */
export interface DateRange {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
}

/**
 * Rating distribution across star levels.
 * 星評価の分布。
 */
export interface RatingDistribution {
    star1: number;
    star2: number;
    star3: number;
    star4: number;
    star5: number;
}

/**
 * User review data.
 * ユーザーレビューデータ。
 */
export interface Review {
    id: string;
    rating: number;
    title?: string;
    text: string;
    authorName?: string;
    date: string;
    language?: string;
    replyText?: string;
    replyDate?: string;
}

/**
 * Google Play metrics data.
 * Google Playのメトリクスデータ。
 */
export interface GooglePlayData {
    packageName: string;
    dateRange: DateRange;

    // Downloads & Installs
    totalInstalls?: number;
    activeInstalls?: number;
    newInstalls?: number;
    uninstalls?: number;
    updateInstalls?: number;

    // Ratings & Reviews
    averageRating?: number;
    totalRatings?: number;
    ratingDistribution?: RatingDistribution;
    recentReviews?: Review[];

    // Revenue (if available)
    totalRevenue?: number;
    revenueCurrency?: string;

    // Crash data
    crashRate?: number;
    anrRate?: number;

    collectedAt: Date;
}

/**
 * Configuration for Google Play Client.
 */
export interface GooglePlayClientConfig {
    /** Path to service account JSON file */
    serviceAccountPath: string;
    /** App package name (e.g., com.example.app) */
    packageName: string;
}

/**
 * App information from Google Play.
 */
export interface GooglePlayAppInfo {
    packageName: string;
    title: string;
    description?: string;
}

/**
 * Install statistics from Google Play.
 */
export interface GooglePlayInstallStats {
    totalInstalls: number;
    totalUninstalls: number;
    activeInstalls: number;
    dailyStats: Array<{
        date: string;
        installs: number;
        uninstalls: number;
        updates: number;
    }>;
}

/**
 * Ratings data from Google Play.
 */
export interface GooglePlayRatings {
    averageRating: number;
    totalRatings: number;
    ratingDistribution: {
        1: number;
        2: number;
        3: number;
        4: number;
        5: number;
    };
}

/**
 * Review data from Google Play.
 */
export interface GooglePlayReview {
    reviewId: string;
    authorName: string;
    rating: number;
    text: string;
    timestamp: Date;
    language: string;
    deviceName?: string;
    appVersionCode?: number;
    appVersionName?: string;
}

/**
 * Reviews response from Google Play.
 */
export interface GooglePlayReviewsResponse {
    reviews: GooglePlayReview[];
    nextPageToken?: string;
}

/**
 * Revenue statistics from Google Play.
 */
export interface GooglePlayRevenueStats {
    totalRevenue: number;
    currency: string;
    dailyRevenue: Array<{
        date: string;
        revenue: number;
        transactions: number;
    }>;
}

/**
 * Options for fetching reviews.
 */
export interface GetReviewsOptions {
    maxResults?: number;
    pageToken?: string;
    translationLanguage?: string;
}
