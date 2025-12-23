/**
 * Type definitions for app-store-scraper
 *
 * app-store-scraperの型定義
 */
declare module "app-store-scraper" {
    /**
     * App information returned from various methods
     */
    export interface AppResult {
        id: number;
        appId: string;
        title: string;
        url: string;
        description: string;
        icon: string;
        genres: string[];
        genreIds: string[];
        primaryGenre: string;
        primaryGenreId: number;
        contentRating: string;
        languages: string[];
        size: string;
        requiredOsVersion: string;
        released: string;
        updated: string;
        releaseNotes?: string;
        version: string;
        price: number;
        currency: string;
        free: boolean;
        developerId: number;
        developer: string;
        developerUrl: string;
        developerWebsite?: string;
        score: number;
        reviews: number;
        currentVersionScore: number;
        currentVersionReviews: number;
        screenshots: string[];
        ipadScreenshots: string[];
        appletvScreenshots: string[];
        supportedDevices: string[];
    }

    /**
     * Options for app()
     */
    export interface AppOptions {
        id?: number;
        appId?: string;
        country?: string;
        lang?: string;
        ratings?: boolean;
    }

    /**
     * Options for developer()
     */
    export interface DeveloperOptions {
        devId: number;
        country?: string;
        lang?: string;
    }

    /**
     * Options for list()
     */
    export interface ListOptions {
        collection?: string;
        category?: number;
        country?: string;
        lang?: string;
        num?: number;
        fullDetail?: boolean;
    }

    /**
     * Options for search()
     */
    export interface SearchOptions {
        term: string;
        num?: number;
        page?: number;
        country?: string;
        lang?: string;
        idsOnly?: boolean;
    }

    /**
     * Review information
     */
    export interface ReviewResult {
        id: string;
        userName: string;
        userUrl: string;
        version: string;
        score: number;
        title: string;
        text: string;
        url: string;
        updated: string;
    }

    /**
     * Options for reviews()
     */
    export interface ReviewOptions {
        id?: number;
        appId?: string;
        country?: string;
        page?: number;
        sort?: number;
    }

    /**
     * Rating information
     */
    export interface RatingResult {
        ratings: number;
        histogram: {
            1: number;
            2: number;
            3: number;
            4: number;
            5: number;
        };
    }

    /**
     * Get detailed information about an app
     */
    export function app(options: AppOptions): Promise<AppResult>;

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
     * Get search suggestions
     */
    export function suggest(options: { term: string; country?: string }): Promise<string[]>;

    /**
     * Get similar apps
     */
    export function similar(options: { id: number; country?: string }): Promise<AppResult[]>;

    /**
     * Get app reviews
     */
    export function reviews(options: ReviewOptions): Promise<ReviewResult[]>;

    /**
     * Get app ratings
     */
    export function ratings(options: { id: number; country?: string }): Promise<RatingResult>;

    /**
     * Get app privacy details
     */
    export function privacy(options: { id: number }): Promise<any>;

    /**
     * Available collections
     */
    export const collection: {
        TOP_FREE_IOS: string;
        TOP_PAID_IOS: string;
        TOP_GROSSING: string;
        TOP_FREE_IPAD: string;
        TOP_PAID_IPAD: string;
        TOP_GROSSING_IPAD: string;
        NEW_IOS: string;
        NEW_FREE_IOS: string;
        NEW_PAID_IOS: string;
    };

    /**
     * Available categories
     */
    export const category: {
        BOOKS: number;
        BUSINESS: number;
        CATALOGS: number;
        EDUCATION: number;
        ENTERTAINMENT: number;
        FINANCE: number;
        FOOD_AND_DRINK: number;
        GAMES: number;
        GAMES_ACTION: number;
        GAMES_ADVENTURE: number;
        GAMES_ARCADE: number;
        GAMES_BOARD: number;
        GAMES_CARD: number;
        GAMES_CASINO: number;
        GAMES_CASUAL: number;
        GAMES_EDUCATIONAL: number;
        GAMES_FAMILY: number;
        GAMES_MUSIC: number;
        GAMES_PUZZLE: number;
        GAMES_RACING: number;
        GAMES_ROLE_PLAYING: number;
        GAMES_SIMULATION: number;
        GAMES_SPORTS: number;
        GAMES_STRATEGY: number;
        GAMES_TRIVIA: number;
        GAMES_WORD: number;
        HEALTH_AND_FITNESS: number;
        KIDS: number;
        LIFESTYLE: number;
        MAGAZINES_AND_NEWSPAPERS: number;
        MEDICAL: number;
        MUSIC: number;
        NAVIGATION: number;
        NEWS: number;
        PHOTO_AND_VIDEO: number;
        PRODUCTIVITY: number;
        REFERENCE: number;
        SHOPPING: number;
        SOCIAL_NETWORKING: number;
        SPORTS: number;
        STICKERS: number;
        TRAVEL: number;
        UTILITIES: number;
        WEATHER: number;
    };

    /**
     * Sort options for reviews
     */
    export const sort: {
        RECENT: number;
        HELPFUL: number;
    };
}
