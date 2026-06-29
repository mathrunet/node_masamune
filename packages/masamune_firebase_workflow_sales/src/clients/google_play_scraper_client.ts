import * as gplay from "google-play-scraper";
import { ModelTimestamp } from "@mathrunet/masamune";
import {
    GooglePlayDeveloperInfo,
    GooglePlayDeveloperApp,
    CategoryRankingConfig,
    SearchConfig
} from "../models/google_play_developer_data";

/**
 * Configuration for GooglePlayScraperClient.
 *
 * GooglePlayScraperClientの設定。
 */
export interface GooglePlayScraperClientConfig {
    /** Language code (default: "ja") / 言語コード */
    lang?: string;
    /** Country code (default: "jp") / 国コード */
    country?: string;
    /** Throttle interval in ms (default: 1000) / リクエスト間隔（ミリ秒） */
    throttle?: number;
}

/**
 * Client for scraping Google Play developer information.
 *
 * Google Playデベロッパー情報をスクレイピングするクライアント。
 */
export class GooglePlayScraperClient {
    private config: Required<GooglePlayScraperClientConfig>;

    constructor(config: GooglePlayScraperClientConfig = {}) {
        this.config = {
            lang: config.lang ?? "ja",
            country: config.country ?? "jp",
            throttle: config.throttle ?? 1000
        };
    }

    /**
     * Get developer information by developer ID.
     *
     * デベロッパーIDからデベロッパー情報を取得。
     *
     * @param devId Developer ID / デベロッパーID
     * @returns Developer information or null / デベロッパー情報またはnull
     */
    async getDeveloperInfo(devId: string): Promise<GooglePlayDeveloperInfo | null> {
        try {
            // Get developer's apps
            const apps = await gplay.developer({
                devId: devId,
                lang: this.config.lang,
                country: this.config.country,
                num: 50
            });

            if (!apps || apps.length === 0) {
                return null;
            }

            // Convert to our app format
            const developerApps: GooglePlayDeveloperApp[] = apps.map(app => ({
                appId: app.appId,
                title: app.title,
                summary: app.summary,
                score: app.score,
                icon: app.icon,
                genre: app.genre,
                price: app.price,
                free: app.free
            }));

            // Create basic developer info
            const developerInfo: GooglePlayDeveloperInfo = {
                developerId: devId,
                developerName: apps[0].developer,
                apps: developerApps,
                collectedTime: new ModelTimestamp(new Date())
            };

            // Enrich with email and other details from first app
            return await this.enrichDeveloperInfo(developerInfo);
        } catch (error) {
            console.warn(`Failed to get developer info for: ${devId}`, error);
            return null;
        }
    }

    /**
     * Get app details including developer email.
     *
     * デベロッパーのメールアドレスを含むアプリ詳細を取得。
     *
     * @param appId App ID (package name) / アプリID
     * @returns App details or null / アプリ詳細またはnull
     */
    async getAppDetails(appId: string): Promise<gplay.AppDetailResult | null> {
        try {
            await this.throttle();
            return await gplay.app({
                appId: appId,
                lang: this.config.lang,
                country: this.config.country
            });
        } catch (error) {
            console.warn(`Failed to get app details for: ${appId}`, error);
            return null;
        }
    }

    /**
     * Get apps from category ranking.
     *
     * カテゴリランキングからアプリ一覧を取得。
     *
     * @param options Category ranking options / カテゴリランキングオプション
     * @returns List of apps / アプリ一覧
     */
    async getListApps(options: CategoryRankingConfig): Promise<gplay.AppResult[]> {
        try {
            await this.throttle();
            return await gplay.list({
                category: options.category,
                collection: options.collection,
                num: options.num ?? 50,
                lang: this.config.lang,
                country: this.config.country
            });
        } catch (error) {
            console.warn(`Failed to get list apps for category: ${options.category}`, error);
            return [];
        }
    }

    /**
     * Search for apps by keyword.
     *
     * キーワードでアプリを検索。
     *
     * @param options Search options / 検索オプション
     * @returns List of apps / アプリ一覧
     */
    async searchApps(options: SearchConfig): Promise<gplay.AppResult[]> {
        try {
            await this.throttle();
            return await gplay.search({
                term: options.term,
                num: options.num ?? 50,
                lang: this.config.lang,
                country: this.config.country,
                price: options.price ?? "all"
            });
        } catch (error) {
            console.warn(`Failed to search apps for term: ${options.term}`, error);
            return [];
        }
    }

    /**
     * Get list of available categories.
     *
     * 利用可能なカテゴリ一覧を取得。
     *
     * @returns List of category IDs / カテゴリID一覧
     */
    async getCategories(): Promise<string[]> {
        try {
            return await gplay.categories();
        } catch (error) {
            console.warn("Failed to get categories", error);
            return [];
        }
    }

    /**
     * Extract unique developer IDs from app list.
     *
     * アプリ一覧から重複のないデベロッパーIDを抽出。
     *
     * @param apps List of apps / アプリ一覧
     * @returns Unique developer IDs / 重複のないデベロッパーID一覧
     */
    extractDeveloperIds(apps: gplay.AppResult[]): string[] {
        const devIds = new Set<string>();
        for (const app of apps) {
            if (app.developerId) {
                devIds.add(app.developerId);
            }
        }
        return Array.from(devIds);
    }

    /**
     * Enrich developer info with email and other details from first app.
     *
     * 最初のアプリからメールアドレス等の詳細情報を補完。
     *
     * @param devInfo Basic developer info / 基本デベロッパー情報
     * @returns Enriched developer info / 補完されたデベロッパー情報
     */
    private async enrichDeveloperInfo(
        devInfo: GooglePlayDeveloperInfo
    ): Promise<GooglePlayDeveloperInfo> {
        if (devInfo.apps.length === 0) {
            return devInfo;
        }

        // Try to get details from first few apps until we find email
        const appsToTry = devInfo.apps.slice(0, 3);
        for (const app of appsToTry) {
            const appDetails = await this.getAppDetails(app.appId);
            if (appDetails) {
                if (appDetails.developerEmail) {
                    devInfo.email = appDetails.developerEmail;
                    devInfo.website = appDetails.developerWebsite;
                    devInfo.address = appDetails.developerAddress;
                    devInfo.privacyPolicyUrl = appDetails.privacyPolicy;
                    break;
                }
            }
        }

        return devInfo;
    }

    /**
     * Sleep for throttle interval.
     *
     * スロットル間隔だけスリープ。
     */
    private async throttle(): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, this.config.throttle));
    }
}
