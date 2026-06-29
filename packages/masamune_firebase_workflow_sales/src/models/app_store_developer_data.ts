import { ModelTimestamp } from "@mathrunet/masamune";

/**
 * App Store developer's app information.
 *
 * App Storeデベロッパーのアプリ情報。
 */
export interface AppStoreDeveloperApp {
    /** App ID (track ID) / アプリID（トラックID） */
    id: number;
    /** Bundle ID / バンドルID */
    appId: string;
    /** App title / アプリ名 */
    title: string;
    /** App description / アプリ説明 */
    description?: string;
    /** Rating score / 評価スコア */
    score?: number;
    /** Icon URL / アイコンURL */
    icon?: string;
    /** Primary genre / メインジャンル */
    primaryGenre?: string;
    /** Price (0 = free) / 価格（0=無料） */
    price?: number;
    /** Is free / 無料かどうか */
    free?: boolean;
}

/**
 * App Store developer information.
 *
 * App Storeデベロッパー情報。
 */
export interface AppStoreDeveloperInfo {
    /** Developer ID (artist ID - numeric) / デベロッパーID（artistID - 数値） */
    developerId: number;
    /** Developer name / デベロッパー名 */
    developerName: string;
    /** Company name / 会社名 */
    companyName?: string;
    /** Email address (extracted from website) / メールアドレス（Webサイトから抽出） */
    email?: string;
    /** Website URL / WebサイトURL */
    website?: string;
    /** Developer URL (iTunes URL) / デベロッパーURL（iTunes URL） */
    developerUrl?: string;
    /** Contact page URLs / 問い合わせページURL一覧 */
    contactPageUrls?: string[];
    /** Released apps / リリースアプリ一覧 */
    apps: AppStoreDeveloperApp[];
    /** Collection time / 収集日時 */
    collectedTime: ModelTimestamp;
}

/**
 * Exploration mode for collecting developers.
 *
 * デベロッパー収集の探索モード。
 */
export type AppStoreExplorationMode =
    | "developer_ids"      // A) Developer ID list / デベロッパーIDリスト
    | "category_ranking"   // B) Category ranking / カテゴリランキング
    | "search_keyword";    // C) Search keyword / 検索キーワード

/**
 * Category ranking configuration for App Store.
 *
 * App Store用カテゴリランキング設定。
 */
export interface AppStoreCategoryRankingConfig {
    /** Category ID (numeric) / カテゴリID（数値） */
    category?: number;
    /** Collection (e.g., "TOP_FREE_IOS", "TOP_PAID_IOS") / コレクション */
    collection?: string;
    /** Number of apps to fetch / 取得するアプリ数 */
    num?: number;
}

/**
 * Search configuration for App Store.
 *
 * App Store用検索設定。
 */
export interface AppStoreSearchConfig {
    /** Search term / 検索キーワード */
    term: string;
    /** Number of results / 取得数 */
    num?: number;
}

/**
 * Parameters for collect_app_store_developers action.
 *
 * collect_app_store_developersアクションのパラメータ。
 */
export interface CollectAppStoreDevelopersParams {
    /** Exploration mode / 探索モード */
    mode: AppStoreExplorationMode;
    /** Language code (default: "ja") / 言語コード */
    lang?: string;
    /** Country code (default: "jp") / 国コード */
    country?: string;
    /** Maximum number of developers to collect / 最大収集件数 */
    maxCount?: number;

    /** Mode A: Developer ID list (numeric) / モードA: デベロッパーIDリスト（数値） */
    developerIds?: number[];

    /** Mode B: Category ranking config / モードB: カテゴリランキング設定 */
    categoryConfig?: AppStoreCategoryRankingConfig;

    /** Mode C: Search config / モードC: 検索設定 */
    searchConfig?: AppStoreSearchConfig;
}

/**
 * Address document for Firestore (App Store version).
 *
 * Firestore用アドレスドキュメント（App Store版）。
 */
export interface AppStoreAddressDocument {
    /** Source identifier / ソース識別子 */
    source: "appStore";
    /** Developer ID (numeric) / デベロッパーID（数値） */
    developerId: number;
    /** Developer name / デベロッパー名 */
    developerName: string;
    /** Company name / 会社名 */
    companyName?: string;
    /** Email address (extracted from website) / メールアドレス（Webサイトから抽出） */
    email?: string;
    /** Website URL / WebサイトURL */
    website?: string;
    /** Developer URL (iTunes URL) / デベロッパーURL（iTunes URL） */
    developerUrl?: string;
    /** Contact page URLs / 問い合わせページURL一覧 */
    contactPageUrls?: string[];
    /** Representative app names / 代表アプリ名リスト */
    appNames: string[];
    /** Representative app descriptions / 代表アプリ説明リスト */
    appDescriptions: string[];
    /** Total app count / アプリ総数 */
    appCount: number;
    /** Collection time / 収集日時 */
    collectedTime: FirebaseFirestore.Timestamp;
    /** Update time / 更新日時 */
    updatedTime: FirebaseFirestore.Timestamp;
}

/**
 * Collection result statistics for App Store.
 *
 * App Store用収集結果の統計情報。
 */
export interface AppStoreCollectionStats {
    /** Exploration mode used / 使用した探索モード */
    mode: AppStoreExplorationMode;
    /** Number of target developers / 対象デベロッパー数 */
    targetCount: number;
    /** Number of collected developers / 収集したデベロッパー数 */
    collectedCount: number;
    /** Number of developers with email (extracted from website) / メールありのデベロッパー数（Webサイトから抽出） */
    withEmailCount: number;
    /** Number of saved documents / 保存したドキュメント数 */
    savedCount: number;
}

/**
 * Result structure for collect_app_store_developers action.
 *
 * collect_app_store_developersアクションの結果構造。
 */
export interface CollectAppStoreDevelopersResult {
    /** Collection statistics / 収集統計 */
    stats: AppStoreCollectionStats;
    /** Collected developer information / 収集したデベロッパー情報 */
    developers: AppStoreDeveloperInfo[];
    /** Error message if any / エラーメッセージ */
    error?: string;
}

/**
 * Contact information extracted from website.
 *
 * Webサイトから抽出したコンタクト情報。
 */
export interface WebsiteContactInfo {
    /** Extracted email addresses / 抽出されたメールアドレス */
    emails: string[];
    /** Contact page URLs / 問い合わせページURL */
    contactPageUrls: string[];
}
