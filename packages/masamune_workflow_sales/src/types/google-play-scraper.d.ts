/**
 * Type definitions for google-play-scraper
 *
 * google-play-scraperの型定義
 */
declare module "google-play-scraper" {
    /**
     * Basic app information returned from list/search
     */
    export interface AppResult {
        appId: string;
        title: string;
        summary?: string;
        developer: string;
        developerId: string;
        icon: string;
        score: number;
        scoreText: string;
        priceText: string;
        free: boolean;
        price: number;
        currency: string;
        genre: string;
        genreId: string;
        url: string;
    }

    /**
     * Detailed app information returned from app()
     */
    export interface AppDetailResult extends AppResult {
        description: string;
        descriptionHTML: string;
        installs: string;
        minInstalls: number;
        maxInstalls: number;
        ratings: number;
        reviews: number;
        histogram: { [key: string]: number };
        available: boolean;
        offersIAP: boolean;
        IAPRange?: string;
        androidVersion: string;
        androidVersionText: string;
        developerEmail?: string;
        developerWebsite?: string;
        developerAddress?: string;
        privacyPolicy?: string;
        developerInternalID: string;
        categories: Array<{ name: string; id: string }>;
        contentRating: string;
        contentRatingDescription?: string;
        adSupported: boolean;
        released?: string;
        updated: number;
        version: string;
        recentChanges?: string;
        comments: string[];
        preregister: boolean;
        earlyAccessEnabled: boolean;
        isAvailableInPlayPass: boolean;
    }

    /**
     * Options for app()
     */
    export interface AppOptions {
        appId: string;
        lang?: string;
        country?: string;
    }

    /**
     * Options for developer()
     */
    export interface DeveloperOptions {
        devId: string;
        lang?: string;
        country?: string;
        num?: number;
        fullDetail?: boolean;
    }

    /**
     * Options for list()
     */
    export interface ListOptions {
        category?: string;
        collection?: string;
        num?: number;
        lang?: string;
        country?: string;
        fullDetail?: boolean;
        age?: string;
    }

    /**
     * Options for search()
     */
    export interface SearchOptions {
        term: string;
        num?: number;
        lang?: string;
        country?: string;
        fullDetail?: boolean;
        price?: "all" | "free" | "paid";
    }

    /**
     * Get detailed information about an app
     */
    export function app(options: AppOptions): Promise<AppDetailResult>;

    /**
     * Get a list of apps by a developer
     */
    export function developer(options: DeveloperOptions): Promise<AppResult[]>;

    /**
     * Get a list of apps from a category/collection
     */
    export function list(options: ListOptions): Promise<AppResult[]>;

    /**
     * Search for apps
     */
    export function search(options: SearchOptions): Promise<AppResult[]>;

    /**
     * Get list of available categories
     */
    export function categories(): Promise<string[]>;

    /**
     * Get similar apps
     */
    export function similar(options: { appId: string; lang?: string; country?: string; fullDetail?: boolean }): Promise<AppResult[]>;

    /**
     * Get app permissions
     */
    export function permissions(options: { appId: string; lang?: string; country?: string }): Promise<any>;

    /**
     * Get app data safety information
     */
    export function datasafety(options: { appId: string; lang?: string }): Promise<any>;

    /**
     * Get search suggestions
     */
    export function suggest(options: { term: string; lang?: string; country?: string }): Promise<string[]>;

    /**
     * Available collections
     */
    export const collection: {
        TOP_FREE: string;
        TOP_PAID: string;
        GROSSING: string;
        TRENDING: string;
        TOP_FREE_GAMES: string;
        TOP_PAID_GAMES: string;
        TOP_GROSSING_GAMES: string;
        NEW_FREE: string;
        NEW_PAID: string;
        NEW_FREE_GAMES: string;
        NEW_PAID_GAMES: string;
    };

    /**
     * Available categories
     */
    export const category: {
        [key: string]: string;
    };

    /**
     * Sort options for reviews
     */
    export const sort: {
        NEWEST: number;
        RATING: number;
        HELPFULNESS: number;
    };
}
