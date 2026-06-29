import * as appStore from "app-store-scraper";
import { ModelTimestamp } from "@mathrunet/masamune";
import {
    AppStoreDeveloperInfo,
    AppStoreDeveloperApp,
    AppStoreCategoryRankingConfig,
    AppStoreSearchConfig,
    WebsiteContactInfo
} from "../models/app_store_developer_data";
import { WebsiteContactClient } from "./website_contact_client";

/**
 * Configuration for AppStoreScraperClient.
 *
 * AppStoreScraperClientの設定。
 */
export interface AppStoreScraperClientConfig {
    /** Language code (default: "ja") / 言語コード */
    lang?: string;
    /** Country code (default: "jp") / 国コード */
    country?: string;
    /** Throttle interval in ms (default: 1000) / リクエスト間隔（ミリ秒） */
    throttle?: number;
    /** Enable website scraping for email (default: true) / Webサイトからのメール抽出を有効にする */
    enableWebsiteScraping?: boolean;
}

/**
 * Client for scraping App Store developer information.
 *
 * App Storeデベロッパー情報をスクレイピングするクライアント。
 */
export class AppStoreScraperClient {
    private config: Required<AppStoreScraperClientConfig>;
    private websiteContactClient: WebsiteContactClient | null = null;

    constructor(config: AppStoreScraperClientConfig = {}) {
        this.config = {
            lang: config.lang ?? "ja",
            country: config.country ?? "jp",
            throttle: config.throttle ?? 1000,
            enableWebsiteScraping: config.enableWebsiteScraping ?? true
        };

        if (this.config.enableWebsiteScraping) {
            this.websiteContactClient = new WebsiteContactClient();
        }
    }

    /**
     * Get developer information by developer ID.
     *
     * デベロッパーIDからデベロッパー情報を取得。
     *
     * @param devId Developer ID (artist ID - numeric) / デベロッパーID（artistID - 数値）
     * @returns Developer information or null / デベロッパー情報またはnull
     */
    async getDeveloperInfo(devId: number): Promise<AppStoreDeveloperInfo | null> {
        try {
            // Get developer's apps
            const apps = await appStore.developer({
                devId: devId,
                country: this.config.country
            });

            if (!apps || apps.length === 0) {
                return null;
            }

            // Convert to our app format
            const developerApps: AppStoreDeveloperApp[] = apps.map(app => ({
                id: app.id,
                appId: app.appId,
                title: app.title,
                description: app.description,
                score: app.score,
                icon: app.icon,
                primaryGenre: app.primaryGenre,
                price: app.price,
                free: app.free
            }));

            // Create basic developer info
            const developerInfo: AppStoreDeveloperInfo = {
                developerId: devId,
                developerName: apps[0].developer,
                developerUrl: apps[0].developerUrl,
                apps: developerApps,
                collectedTime: new ModelTimestamp(new Date())
            };

            // Enrich with website and email details
            return await this.enrichDeveloperInfo(developerInfo);
        } catch (error) {
            console.warn(`Failed to get developer info for: ${devId}`, error);
            return null;
        }
    }

    /**
     * Get app details including developer website.
     *
     * デベロッパーのWebサイトを含むアプリ詳細を取得。
     *
     * @param appId App ID (track ID - numeric) / アプリID（トラックID - 数値）
     * @returns App details or null / アプリ詳細またはnull
     */
    async getAppDetails(appId: number): Promise<appStore.AppResult | null> {
        try {
            await this.throttle();
            return await appStore.app({
                id: appId,
                country: this.config.country,
                lang: this.config.lang
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
    async getListApps(options: AppStoreCategoryRankingConfig): Promise<appStore.AppResult[]> {
        try {
            await this.throttle();
            return await appStore.list({
                collection: options.collection,
                category: options.category,
                num: options.num ?? 50,
                country: this.config.country,
                lang: this.config.lang
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
    async searchApps(options: AppStoreSearchConfig): Promise<appStore.AppResult[]> {
        try {
            await this.throttle();
            return await appStore.search({
                term: options.term,
                num: options.num ?? 50,
                country: this.config.country,
                lang: this.config.lang
            });
        } catch (error) {
            console.warn(`Failed to search apps for term: ${options.term}`, error);
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
    extractDeveloperIds(apps: appStore.AppResult[]): number[] {
        const devIds = new Set<number>();
        for (const app of apps) {
            if (app.developerId) {
                devIds.add(app.developerId);
            }
        }
        return Array.from(devIds);
    }

    /**
     * Enrich developer info with website and email from website scraping.
     *
     * Webサイトからメールアドレス等の詳細情報を補完。
     *
     * @param devInfo Basic developer info / 基本デベロッパー情報
     * @returns Enriched developer info / 補完されたデベロッパー情報
     */
    private async enrichDeveloperInfo(
        devInfo: AppStoreDeveloperInfo
    ): Promise<AppStoreDeveloperInfo> {
        if (devInfo.apps.length === 0) {
            return devInfo;
        }

        // Try to get website from first few apps
        const appsToTry = devInfo.apps.slice(0, 3);
        let websiteUrl: string | undefined;

        for (const app of appsToTry) {
            const appDetails = await this.getAppDetails(app.id);
            if (appDetails && appDetails.developerWebsite) {
                websiteUrl = appDetails.developerWebsite;
                devInfo.website = websiteUrl;
                break;
            }
        }

        // Extract email from website using Puppeteer
        if (websiteUrl && this.websiteContactClient) {
            try {
                console.log(`Extracting contact info from: ${websiteUrl}`);
                const contactInfo = await this.websiteContactClient.extractContactInfo(websiteUrl);
                if (contactInfo.emails.length > 0) {
                    devInfo.email = contactInfo.emails[0];
                }
                if (contactInfo.contactPageUrls.length > 0) {
                    devInfo.contactPageUrls = contactInfo.contactPageUrls;
                }
            } catch (error) {
                console.warn(`Failed to extract contact info from website: ${websiteUrl}`, error);
            }
        }

        return devInfo;
    }

    /**
     * Close the website contact client.
     *
     * Webサイトコンタクトクライアントを閉じる。
     */
    async close(): Promise<void> {
        if (this.websiteContactClient) {
            await this.websiteContactClient.close();
        }
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
