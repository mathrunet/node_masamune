/**
 * Google Play Developer API Client
 *
 * Collects app statistics from Google Play Console:
 * - Install/uninstall statistics
 * - Ratings and reviews
 * - Revenue data
 *
 * @see https://developers.google.com/android-publisher
 */

import { google, androidpublisher_v3 } from "googleapis";
import * as fs from "fs";
import { DateRange, GooglePlayData, RatingDistribution, Review } from "../models/marketing_data";
import { withRetry, MarketingPipelineError, ErrorCategory } from "../utils/error_handler";

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

/**
 * Google Play Developer API Client.
 */
export class GooglePlayClient {
    private androidPublisher: androidpublisher_v3.Androidpublisher;
    private packageName: string;

    constructor(config: GooglePlayClientConfig) {
        // Validate service account file exists
        if (!fs.existsSync(config.serviceAccountPath)) {
            throw new MarketingPipelineError(
                `Service account file not found: ${config.serviceAccountPath}`,
                ErrorCategory.AUTHENTICATION,
                false
            );
        }

        // Load service account credentials
        const serviceAccount = JSON.parse(fs.readFileSync(config.serviceAccountPath, "utf-8"));

        // Create JWT auth client
        const auth = new google.auth.JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: ["https://www.googleapis.com/auth/androidpublisher"],
        });

        // Initialize Android Publisher API
        this.androidPublisher = google.androidpublisher({
            version: "v3",
            auth: auth,
        });

        this.packageName = config.packageName;
    }

    /**
     * Get app information.
     */
    async getAppInfo(): Promise<GooglePlayAppInfo> {
        return withRetry(async () => {
            const response = await this.androidPublisher.edits.insert({
                packageName: this.packageName,
            });

            const editId = response.data.id!;

            try {
                const listingsResponse = await this.androidPublisher.edits.listings.list({
                    packageName: this.packageName,
                    editId: editId,
                });

                const listings = listingsResponse.data.listings || [];
                const defaultListing = listings.find((l) => l.language === "en-US") || listings[0];

                return {
                    packageName: this.packageName,
                    title: defaultListing?.title || this.packageName,
                    description: defaultListing?.fullDescription || undefined,
                };
            } finally {
                // Clean up the edit
                await this.androidPublisher.edits.delete({
                    packageName: this.packageName,
                    editId: editId,
                }).catch(() => {
                    // Ignore delete errors
                });
            }
        });
    }

    /**
     * Get install statistics for a date range.
     *
     * Note: Google Play Console API doesn't directly provide install stats via API.
     * This requires using Google Play Console Reports (CSV) or Cloud Storage exports.
     * For now, we return placeholder data structure.
     */
    async getInstallStats(dateRange: DateRange): Promise<GooglePlayInstallStats> {
        // Google Play doesn't have a direct API for install stats
        // Stats need to be accessed via:
        // 1. Google Play Console web interface
        // 2. Cloud Storage exports (if configured)
        // 3. BigQuery exports (if configured)

        // Return structure with zeros - actual implementation would need
        // Cloud Storage or BigQuery integration
        console.warn(
            "GooglePlayClient.getInstallStats: Direct API not available. " +
            "Configure Cloud Storage or BigQuery exports for actual data."
        );

        return {
            totalInstalls: 0,
            totalUninstalls: 0,
            activeInstalls: 0,
            dailyStats: [],
        };
    }

    /**
     * Get ratings summary.
     */
    async getRatings(): Promise<GooglePlayRatings> {
        return withRetry(async () => {
            // Fetch reviews to calculate ratings
            // Note: This is an approximation based on available reviews
            const reviews = await this.getReviews({ maxResults: 100 });

            if (reviews.reviews.length === 0) {
                return {
                    averageRating: 0,
                    totalRatings: 0,
                    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                };
            }

            const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            let totalRating = 0;

            for (const review of reviews.reviews) {
                const rating = Math.round(review.rating) as 1 | 2 | 3 | 4 | 5;
                if (rating >= 1 && rating <= 5) {
                    distribution[rating]++;
                    totalRating += review.rating;
                }
            }

            const totalRatings = reviews.reviews.length;
            const averageRating = totalRatings > 0 ? totalRating / totalRatings : 0;

            return {
                averageRating: Math.round(averageRating * 10) / 10,
                totalRatings,
                ratingDistribution: distribution,
            };
        });
    }

    /**
     * Get reviews.
     */
    async getReviews(options: GetReviewsOptions = {}): Promise<GooglePlayReviewsResponse> {
        return withRetry(async () => {
            const response = await this.androidPublisher.reviews.list({
                packageName: this.packageName,
                maxResults: options.maxResults || 100,
                token: options.pageToken,
                translationLanguage: options.translationLanguage,
            });

            const reviews: GooglePlayReview[] = (response.data.reviews || []).map((review) => {
                const comment = review.comments?.[0]?.userComment;
                return {
                    reviewId: review.reviewId || "",
                    authorName: review.authorName || "Anonymous",
                    rating: comment?.starRating || 0,
                    text: comment?.text || "",
                    timestamp: comment?.lastModified?.seconds
                        ? new Date(parseInt(comment.lastModified.seconds) * 1000)
                        : new Date(),
                    language: comment?.reviewerLanguage || "unknown",
                    deviceName: comment?.device || undefined,
                    appVersionCode: comment?.appVersionCode || undefined,
                    appVersionName: comment?.appVersionName || undefined,
                };
            });

            return {
                reviews,
                nextPageToken: response.data.tokenPagination?.nextPageToken || undefined,
            };
        });
    }

    /**
     * Get revenue statistics for a date range.
     *
     * Note: Revenue data requires Google Play Console Reports or BigQuery exports.
     */
    async getRevenueStats(dateRange: DateRange): Promise<GooglePlayRevenueStats> {
        // Revenue data is not available via direct API
        // Requires Cloud Storage or BigQuery exports configuration
        console.warn(
            "GooglePlayClient.getRevenueStats: Direct API not available. " +
            "Configure Cloud Storage or BigQuery exports for actual data."
        );

        return {
            totalRevenue: 0,
            currency: "USD",
            dailyRevenue: [],
        };
    }

    /**
     * Collect all Google Play data for a date range.
     */
    async collectAllData(dateRange: DateRange): Promise<GooglePlayData> {
        const [installStats, ratings, reviewsResponse, revenueStats] = await Promise.all([
            this.getInstallStats(dateRange).catch((err) => {
                console.error("Failed to get install stats:", err.message);
                return {
                    totalInstalls: 0,
                    totalUninstalls: 0,
                    activeInstalls: 0,
                    dailyStats: [],
                };
            }),
            this.getRatings().catch((err) => {
                console.error("Failed to get ratings:", err.message);
                return {
                    averageRating: 0,
                    totalRatings: 0,
                    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                };
            }),
            this.getReviews({ maxResults: 50 }).catch((err) => {
                console.error("Failed to get reviews:", err.message);
                return { reviews: [] };
            }),
            this.getRevenueStats(dateRange).catch((err) => {
                console.error("Failed to get revenue stats:", err.message);
                return { totalRevenue: 0, currency: "USD", dailyRevenue: [] };
            }),
        ]);

        // Convert rating distribution format
        const ratingDistribution: RatingDistribution = {
            star1: ratings.ratingDistribution[1],
            star2: ratings.ratingDistribution[2],
            star3: ratings.ratingDistribution[3],
            star4: ratings.ratingDistribution[4],
            star5: ratings.ratingDistribution[5],
        };

        // Convert reviews format
        const recentReviews: Review[] = reviewsResponse.reviews.map((r) => ({
            id: r.reviewId,
            rating: r.rating,
            text: r.text,
            authorName: r.authorName,
            date: r.timestamp.toISOString().split("T")[0],
            language: r.language,
        }));

        return {
            packageName: this.packageName,
            dateRange: dateRange,
            totalInstalls: installStats.totalInstalls,
            activeInstalls: installStats.activeInstalls,
            newInstalls: installStats.totalInstalls,
            uninstalls: installStats.totalUninstalls,
            updateInstalls: installStats.dailyStats.reduce((sum, d) => sum + d.updates, 0),
            averageRating: ratings.averageRating,
            totalRatings: ratings.totalRatings,
            ratingDistribution: ratingDistribution,
            recentReviews: recentReviews,
            totalRevenue: revenueStats.totalRevenue,
            revenueCurrency: revenueStats.currency,
            collectedAt: new Date(),
        };
    }
}
