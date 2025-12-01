/**
 * App Store Connect API Client
 *
 * Collects app data from App Store Connect:
 * - App information
 * - Ratings and reviews
 *
 * @see https://developer.apple.com/documentation/appstoreconnectapi
 */

import * as fs from "fs";
import * as jwt from "jsonwebtoken";

/**
 * Date range for data collection.
 */
export interface DateRange {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
}

/**
 * Rating distribution across star levels.
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
 */
export interface Review {
    id: string;
    rating: number;
    title?: string;
    text: string;
    authorName?: string;
    date: string;
}

/**
 * Configuration for App Store Client.
 */
export interface AppStoreClientConfig {
    /** API Key ID */
    keyId: string;
    /** Issuer ID */
    issuerId: string;
    /** Path to .p8 private key file */
    privateKeyPath: string;
    /** App's Apple ID */
    appId: string;
    /** Vendor number for sales reports (optional) */
    vendorNumber?: string;
}

/**
 * App basic information.
 */
export interface AppInfo {
    appId: string;
    name: string;
    bundleId: string;
    sku: string;
    primaryLocale: string;
}

/**
 * Ratings data.
 */
export interface AppRatings {
    averageRating: number;
    totalRatings: number;
    ratingDistribution: RatingDistribution;
}

/**
 * Review data from App Store.
 */
export interface AppStoreReview {
    id: string;
    rating: number;
    title: string;
    body: string;
    reviewerNickname: string;
    createdDate: string;
    territory: string;
}

/**
 * Reviews response from App Store.
 */
export interface AppStoreReviewsResponse {
    reviews: AppStoreReview[];
    nextCursor?: string;
}

/**
 * Options for fetching App Store reviews.
 */
export interface AppStoreGetReviewsOptions {
    limit?: number;
    cursor?: string;
    sort?: "createdDate" | "-createdDate" | "rating" | "-rating";
}

const APP_STORE_API_BASE = "https://api.appstoreconnect.apple.com/v1";

/**
 * App Store Connect API Client.
 */
export class AppStoreClient {
    private keyId: string;
    private issuerId: string;
    private privateKey: string;
    private appId: string;
    private vendorNumber?: string;
    private tokenCache: { token: string; expiresAt: number } | null = null;

    constructor(config: AppStoreClientConfig) {
        // Validate private key file exists
        if (!fs.existsSync(config.privateKeyPath)) {
            throw new Error(`Private key file not found: ${config.privateKeyPath}`);
        }

        this.keyId = config.keyId;
        this.issuerId = config.issuerId;
        this.privateKey = fs.readFileSync(config.privateKeyPath, "utf-8");
        this.appId = config.appId;
        this.vendorNumber = config.vendorNumber;
    }

    /**
     * Generate JWT token for App Store Connect API.
     */
    private generateToken(): string {
        // Check cache
        const now = Math.floor(Date.now() / 1000);
        if (this.tokenCache && this.tokenCache.expiresAt > now + 60) {
            return this.tokenCache.token;
        }

        // Token expires in 20 minutes (max allowed)
        const expiresAt = now + 20 * 60;

        const payload = {
            iss: this.issuerId,
            iat: now,
            exp: expiresAt,
            aud: "appstoreconnect-v1",
        };

        const token = jwt.sign(payload, this.privateKey, {
            algorithm: "ES256",
            header: {
                alg: "ES256",
                kid: this.keyId,
                typ: "JWT",
            },
        });

        // Cache the token
        this.tokenCache = { token, expiresAt };

        return token;
    }

    /**
     * Make authenticated API request.
     */
    private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const token = this.generateToken();
        const url = endpoint.startsWith("http") ? endpoint : `${APP_STORE_API_BASE}${endpoint}`;

        const response = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                ...options.headers,
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`App Store Connect API error: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        return response.json() as Promise<T>;
    }

    /**
     * Get app basic information.
     */
    async getAppInfo(): Promise<AppInfo> {
        try {
            const response = await this.apiRequest<any>(`/apps/${this.appId}`);

            const app = response.data;
            return {
                appId: app.id,
                name: app.attributes.name,
                bundleId: app.attributes.bundleId,
                sku: app.attributes.sku,
                primaryLocale: app.attributes.primaryLocale,
            };
        } catch (err: any) {
            console.error("Failed to get app info:", err.message);
            throw err;
        }
    }

    /**
     * Get app ratings.
     * Note: App Store Connect API doesn't directly provide ratings summary.
     * We need to calculate from customer reviews or use App Analytics.
     */
    async getRatings(): Promise<AppRatings> {
        try {
            // Fetch reviews to calculate ratings
            const reviews = await this.getReviews({ limit: 200 });

            if (reviews.reviews.length === 0) {
                return {
                    averageRating: 0,
                    totalRatings: 0,
                    ratingDistribution: {
                        star1: 0,
                        star2: 0,
                        star3: 0,
                        star4: 0,
                        star5: 0,
                    },
                };
            }

            const distribution: RatingDistribution = {
                star1: 0,
                star2: 0,
                star3: 0,
                star4: 0,
                star5: 0,
            };

            let totalRating = 0;

            for (const review of reviews.reviews) {
                totalRating += review.rating;
                switch (review.rating) {
                    case 1:
                        distribution.star1++;
                        break;
                    case 2:
                        distribution.star2++;
                        break;
                    case 3:
                        distribution.star3++;
                        break;
                    case 4:
                        distribution.star4++;
                        break;
                    case 5:
                        distribution.star5++;
                        break;
                }
            }

            const totalRatings = reviews.reviews.length;
            const averageRating = totalRatings > 0 ? Math.round((totalRating / totalRatings) * 10) / 10 : 0;

            return {
                averageRating,
                totalRatings,
                ratingDistribution: distribution,
            };
        } catch (err: any) {
            console.error("Failed to get ratings:", err.message);
            return {
                averageRating: 0,
                totalRatings: 0,
                ratingDistribution: { star1: 0, star2: 0, star3: 0, star4: 0, star5: 0 },
            };
        }
    }

    /**
     * Get customer reviews.
     */
    async getReviews(options: AppStoreGetReviewsOptions = {}): Promise<AppStoreReviewsResponse> {
        try {
            const limit = options.limit || 100;
            const sort = options.sort || "-createdDate";

            let url = `/apps/${this.appId}/customerReviews?limit=${limit}&sort=${sort}`;
            if (options.cursor) {
                url = options.cursor;
            }

            const response = await this.apiRequest<any>(url);

            const reviews: AppStoreReview[] = (response.data || []).map((review: any) => ({
                id: review.id,
                rating: review.attributes.rating,
                title: review.attributes.title || "",
                body: review.attributes.body || "",
                reviewerNickname: review.attributes.reviewerNickname || "Anonymous",
                createdDate: review.attributes.createdDate,
                territory: review.attributes.territory,
            }));

            return {
                reviews,
                nextCursor: response.links?.next,
            };
        } catch (err: any) {
            console.error("Failed to get reviews:", err.message);
            return { reviews: [] };
        }
    }

    /**
     * Collect all App Store data for a date range.
     */
    async collectAllData(dateRange: DateRange): Promise<{ [key: string]: any }> {
        const [appInfo, ratings, reviewsResponse] = await Promise.all([
            this.getAppInfo().catch((err) => {
                console.error("Failed to get app info:", err.message);
                return null;
            }),
            this.getRatings().catch((err) => {
                console.error("Failed to get ratings:", err.message);
                return {
                    averageRating: 0,
                    totalRatings: 0,
                    ratingDistribution: { star1: 0, star2: 0, star3: 0, star4: 0, star5: 0 },
                };
            }),
            this.getReviews({ limit: 50 }).catch((err) => {
                console.error("Failed to get reviews:", err.message);
                return { reviews: [] };
            }),
        ]);

        // Convert reviews to common format
        const recentReviews: Review[] = reviewsResponse.reviews.map((r) => ({
            id: r.id,
            rating: r.rating,
            title: r.title,
            text: r.body,
            authorName: r.reviewerNickname,
            date: r.createdDate.split("T")[0],
        }));

        return {
            appId: this.appId,
            dateRange: dateRange,
            averageRating: ratings.averageRating,
            totalRatings: ratings.totalRatings,
            ratingDistribution: ratings.ratingDistribution,
            recentReviews: recentReviews,
            collectedAt: new Date().toISOString(),
        };
    }
}
