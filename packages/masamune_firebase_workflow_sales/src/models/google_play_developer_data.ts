import { ModelTimestamp } from "@mathrunet/masamune";

/**
 * Google Play developer's app information.
 *
 * Google Playデベロッパーのアプリ情報。
 */
export interface GooglePlayDeveloperApp {
    /** App ID (package name) / アプリID（パッケージ名） */
    appId: string;
    /** App title / アプリ名 */
    title: string;
    /** App summary / アプリ概要 */
    summary?: string;
    /** Rating score / 評価スコア */
    score?: number;
    /** Icon URL / アイコンURL */
    icon?: string;
    /** Genre/Category / ジャンル/カテゴリ */
    genre?: string;
    /** Price (0 = free) / 価格（0=無料） */
    price?: number;
    /** Is free / 無料かどうか */
    free?: boolean;
}

/**
 * Google Play developer information.
 *
 * Google Playデベロッパー情報。
 */
export interface GooglePlayDeveloperInfo {
    /** Developer ID / デベロッパーID */
    developerId: string;
    /** Developer name / デベロッパー名 */
    developerName: string;
    /** Company name / 会社名 */
    companyName?: string;
    /** Email address (most important) / メールアドレス（最重要） */
    email?: string;
    /** Website URL / WebサイトURL */
    website?: string;
    /** Privacy policy URL / プライバシーポリシーURL */
    privacyPolicyUrl?: string;
    /** Address / 住所 */
    address?: string;
    /** Released apps / リリースアプリ一覧 */
    apps: GooglePlayDeveloperApp[];
    /** Collection time / 収集日時 */
    collectedTime: ModelTimestamp;
}

/**
 * Exploration mode for collecting developers.
 *
 * デベロッパー収集の探索モード。
 */
export type ExplorationMode =
    | "developer_ids"      // A) Developer ID list / デベロッパーIDリスト
    | "category_ranking"   // B) Category ranking / カテゴリランキング
    | "search_keyword";    // C) Search keyword / 検索キーワード

/**
 * Category ranking configuration.
 *
 * カテゴリランキング設定。
 */
export interface CategoryRankingConfig {
    /** Category (e.g., "GAME_ACTION", "PRODUCTIVITY") / カテゴリ */
    category: string;
    /** Collection (e.g., "TOP_FREE", "TOP_PAID") / コレクション */
    collection: string;
    /** Number of apps to fetch / 取得するアプリ数 */
    num?: number;
}

/**
 * Search configuration.
 *
 * 検索設定。
 */
export interface SearchConfig {
    /** Search term / 検索キーワード */
    term: string;
    /** Number of results / 取得数 */
    num?: number;
    /** Price filter / 価格フィルター */
    price?: "all" | "free" | "paid";
}

/**
 * Parameters for collect_google_play_developers action.
 *
 * collect_google_play_developersアクションのパラメータ。
 */
export interface CollectGooglePlayDevelopersParams {
    /** Exploration mode / 探索モード */
    mode: ExplorationMode;
    /** Language code (default: "ja") / 言語コード */
    lang?: string;
    /** Country code (default: "jp") / 国コード */
    country?: string;
    /** Maximum number of developers to collect / 最大収集件数 */
    maxCount?: number;

    /** Mode A: Developer ID list / モードA: デベロッパーIDリスト */
    developerIds?: string[];

    /** Mode B: Category ranking config / モードB: カテゴリランキング設定 */
    categoryConfig?: CategoryRankingConfig;

    /** Mode C: Search config / モードC: 検索設定 */
    searchConfig?: SearchConfig;
}

/**
 * Address document for Firestore.
 *
 * Firestore用アドレスドキュメント。
 */
export interface AddressDocument {
    /** Source identifier / ソース識別子 */
    source: "googlePlay";
    /** Developer ID / デベロッパーID */
    developerId: string;
    /** Developer name / デベロッパー名 */
    developerName: string;
    /** Company name / 会社名 */
    companyName?: string;
    /** Email address (most important) / メールアドレス（最重要） */
    email?: string;
    /** Website URL / WebサイトURL */
    website?: string;
    /** Privacy policy URL / プライバシーポリシーURL */
    privacyPolicyUrl?: string;
    /** Address / 住所 */
    address?: string;
    /** Representative app names / 代表アプリ名リスト */
    appNames: string[];
    /** Representative app summaries / 代表アプリ概要リスト */
    appSummaries: string[];
    /** Total app count / アプリ総数 */
    appCount: number;
    /** Collection time / 収集日時 */
    collectedTime: ModelTimestamp;
    /** Update time / 更新日時 */
    updatedTime: ModelTimestamp;
}

/**
 * Collection result statistics.
 *
 * 収集結果の統計情報。
 */
export interface CollectionStats {
    /** Exploration mode used / 使用した探索モード */
    mode: ExplorationMode;
    /** Number of target developers / 対象デベロッパー数 */
    targetCount: number;
    /** Number of collected developers / 収集したデベロッパー数 */
    collectedCount: number;
    /** Number of developers with email / メールありのデベロッパー数 */
    withEmailCount: number;
    /** Number of saved documents / 保存したドキュメント数 */
    savedCount: number;
}

/**
 * Result structure for collect_google_play_developers action.
 *
 * collect_google_play_developersアクションの結果構造。
 */
export interface CollectGooglePlayDevelopersResult {
    /** Collection statistics / 収集統計 */
    stats: CollectionStats;
    /** Collected developer information / 収集したデベロッパー情報 */
    developers: GooglePlayDeveloperInfo[];
    /** Error message if any / エラーメッセージ */
    error?: string;
}
