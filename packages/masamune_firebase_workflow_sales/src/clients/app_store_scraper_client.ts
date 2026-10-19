import { ModelTimestamp } from "@mathrunet/masamune";
import {
    AppStoreDeveloperInfo,
    AppStoreDeveloperApp,
    AppStoreCategoryRankingConfig,
    AppStoreSearchConfig,
} from "../models/app_store_developer_data";
import { WebsiteContactClient } from "./website_contact_client";

/**
 * App information retrieved from the public iTunes Search API / RSS feeds.
 *
 * 公開iTunes Search API / RSSフィードから取得したアプリ情報。
 */
export interface AppStoreApp {
    /** App ID (track ID) / アプリID（トラックID） */
    id: number;
    /** Bundle ID / バンドルID */
    appId: string;
    /** App title / アプリ名 */
    title: string;
    /** App Store URL / App StoreのURL */
    url?: string;
    /** App description / アプリ説明 */
    description?: string;
    /** Icon URL / アイコンURL */
    icon?: string;
    /** Primary genre / メインジャンル */
    primaryGenre?: string;
    /** Price / 価格 */
    price?: number;
    /** Currency / 通貨 */
    currency?: string;
    /** Whether the app is free / 無料かどうか */
    free?: boolean;
    /** Developer ID (artist ID) / デベロッパーID（artistID） */
    developerId?: number;
    /** Developer name / デベロッパー名 */
    developer?: string;
    /** Developer page URL / デベロッパーページURL */
    developerUrl?: string;
    /** Developer website (seller URL) / デベロッパーWebサイト（sellerUrl） */
    developerWebsite?: string;
    /** Average rating score / 平均評価スコア */
    score?: number;
}

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

const ITUNES_BASE_URL = "https://itunes.apple.com";

/**
 * Mapping from collection names to legacy iTunes RSS feed names.
 *
 * コレクション名からiTunes RSSフィード名への対応表。
 */
const RSS_COLLECTIONS: { [key: string]: string } = {
    TOP_FREE_IOS: "topfreeapplications",
    TOP_PAID_IOS: "toppaidapplications",
    TOP_GROSSING: "topgrossingapplications",
    TOP_GROSSING_IOS: "topgrossingapplications",
    TOP_FREE_IPAD: "topfreeipadapplications",
    TOP_PAID_IPAD: "toppaidipadapplications",
    TOP_GROSSING_IPAD: "topgrossingipadapplications",
    NEW_IOS: "newapplications",
    NEW_FREE_IOS: "newfreeapplications",
    NEW_PAID_IOS: "newpaidapplications",
};

/**
 * Client for collecting App Store developer information.
 *
 * Uses Apple's public iTunes Search API and RSS feeds directly.
 *
 * App Storeデベロッパー情報を収集するクライアント。
 *
 * Appleの公開iTunes Search APIとRSSフィードを直接利用する。
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
            const results = await this.requestItunes("/lookup", {
                id: String(devId),
                entity: "software",
                limit: "200",
            });
            const apps = results
                .filter((item) => item.wrapperType === "software")
                .map((item) => this.toApp(item));

            if (apps.length === 0) {
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
                developerName: apps[0].developer ?? "",
                developerUrl: apps[0].developerUrl ?? "",
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
    async getAppDetails(appId: number): Promise<AppStoreApp | null> {
        try {
            await this.throttle();
            const results = await this.requestItunes("/lookup", {
                id: String(appId),
            });
            const item = results.find((result) => result.wrapperType === "software");
            return item ? this.toApp(item) : null;
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
    async getListApps(options: AppStoreCategoryRankingConfig): Promise<AppStoreApp[]> {
        try {
            await this.throttle();
            const collection = RSS_COLLECTIONS[options.collection ?? "TOP_FREE_IOS"];
            if (!collection) {
                throw new Error(`Unsupported collection: ${options.collection}`);
            }
            const num = Math.min(Math.max(options.num ?? 50, 1), 200);
            const genre = options.category ? `/genre=${options.category}` : "";
            const url = `${ITUNES_BASE_URL}/${encodeURIComponent(this.config.country)}/rss/${collection}/limit=${num}${genre}/json`;
            const json = await this.fetchJson(url);
            const entry = json?.feed?.entry;
            const entries: any[] = Array.isArray(entry) ? entry : entry ? [entry] : [];
            return entries.map((item) => this.rssEntryToApp(item));
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
    async searchApps(options: AppStoreSearchConfig): Promise<AppStoreApp[]> {
        try {
            await this.throttle();
            const results = await this.requestItunes("/search", {
                term: options.term,
                entity: "software",
                limit: String(Math.min(Math.max(options.num ?? 50, 1), 200)),
            });
            return results
                .filter((item) => item.wrapperType === "software" || item.kind === "software")
                .map((item) => this.toApp(item));
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
    extractDeveloperIds(apps: AppStoreApp[]): number[] {
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
     * Call the iTunes Search / Lookup API and return the results array.
     *
     * iTunes Search / Lookup APIを呼び出し、results配列を返す。
     */
    private async requestItunes(
        path: "/lookup" | "/search",
        params: { [key: string]: string }
    ): Promise<any[]> {
        const query = new URLSearchParams({
            ...params,
            country: this.config.country,
            lang: `${this.config.lang}_${this.config.country}`.toLowerCase(),
        });
        const json = await this.fetchJson(`${ITUNES_BASE_URL}${path}?${query.toString()}`);
        return Array.isArray(json?.results) ? json.results : [];
    }

    /**
     * Fetch a URL and parse it as JSON.
     *
     * URLを取得しJSONとして解析する。
     */
    private async fetchJson(url: string): Promise<any> {
        const response = await fetch(url, {
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}: ${url}`);
        }
        return await response.json();
    }

    /**
     * Convert an iTunes Search / Lookup result to AppStoreApp.
     *
     * iTunes Search / Lookupの結果をAppStoreAppに変換する。
     */
    private toApp(item: any): AppStoreApp {
        const price = typeof item.price === "number" ? item.price : undefined;
        return {
            id: item.trackId,
            appId: item.bundleId,
            title: item.trackName,
            url: item.trackViewUrl,
            description: item.description,
            icon: item.artworkUrl512 ?? item.artworkUrl100 ?? item.artworkUrl60,
            primaryGenre: item.primaryGenreName,
            price: price,
            currency: item.currency,
            free: price === undefined ? undefined : price === 0,
            developerId: item.artistId,
            developer: item.artistName,
            developerUrl: item.artistViewUrl,
            developerWebsite: item.sellerUrl,
            score: item.averageUserRating,
        };
    }

    /**
     * Convert an iTunes RSS feed entry to AppStoreApp.
     *
     * iTunes RSSフィードのエントリをAppStoreAppに変換する。
     */
    private rssEntryToApp(entry: any): AppStoreApp {
        const artistUrl: string | undefined = entry?.["im:artist"]?.attributes?.href;
        const developerIdMatch = artistUrl?.match(/\/id(\d+)/);
        const amount = parseFloat(entry?.["im:price"]?.attributes?.amount ?? "");
        const images: any[] = entry?.["im:image"] ?? [];
        return {
            id: parseInt(entry?.id?.attributes?.["im:id"] ?? "0", 10),
            appId: entry?.id?.attributes?.["im:bundleId"],
            title: entry?.["im:name"]?.label,
            url: entry?.link?.attributes?.href ?? entry?.id?.label,
            description: entry?.summary?.label,
            icon: images.length > 0 ? images[images.length - 1]?.label : undefined,
            primaryGenre: entry?.category?.attributes?.term,
            price: isNaN(amount) ? undefined : amount,
            currency: entry?.["im:price"]?.attributes?.currency,
            free: isNaN(amount) ? undefined : amount === 0,
            developerId: developerIdMatch ? parseInt(developerIdMatch[1], 10) : undefined,
            developer: entry?.["im:artist"]?.label,
            developerUrl: artistUrl,
        };
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
