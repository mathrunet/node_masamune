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
 * App Store Connect metrics data.
 * App Store Connectのメトリクスデータ。
 */
export interface AppStoreData {
    appId: string;
    dateRange: DateRange;

    // Downloads & Sales
    totalDownloads?: number;
    redownloads?: number;
    updates?: number;

    // Revenue
    proceeds?: number;
    proceedsCurrency?: string;

    // Ratings & Reviews
    averageRating?: number;
    totalRatings?: number;
    ratingDistribution?: RatingDistribution;
    recentReviews?: Review[];

    // App Units
    appUnits?: number;
    inAppPurchases?: number;

    collectedAt: Date;
}

/**
 * Age group distribution.
 * 年齢層の分布。
 */
export interface AgeGroupDistribution {
    "18-24"?: number;
    "25-34"?: number;
    "35-44"?: number;
    "45-54"?: number;
    "55-64"?: number;
    "65+"?: number;
    "unknown"?: number;
}

/**
 * Gender distribution.
 * 性別の分布。
 */
export interface GenderDistribution {
    male?: number;
    female?: number;
    unknown?: number;
}

/**
 * Country distribution (country code -> count/percentage).
 * 国の分布（国コード -> カウント/パーセンテージ）。
 */
export interface CountryDistribution {
    [countryCode: string]: number;
}

/**
 * Language distribution (language code -> count/percentage).
 * 言語の分布（言語コード -> カウント/パーセンテージ）。
 */
export interface LanguageDistribution {
    [languageCode: string]: number;
}

/**
 * Device type distribution.
 * デバイスタイプの分布。
 */
export interface DeviceTypeDistribution {
    phone?: number;
    tablet?: number;
    desktop?: number;
    other?: number;
}

/**
 * OS version distribution.
 * OSバージョンの分布。
 */
export interface OsVersionDistribution {
    [version: string]: number;
}

/**
 * Firebase Analytics data.
 * Firebase Analyticsのデータ。
 */
export interface FirebaseAnalyticsData {
    projectId: string;
    propertyId: string;
    dateRange: DateRange;

    // Active users
    dau?: number;  // Daily Active Users
    wau?: number;  // Weekly Active Users
    mau?: number;  // Monthly Active Users

    // User retention
    newUsers?: number;
    returningUsers?: number;

    // Demographics
    demographics?: {
        ageGroups?: AgeGroupDistribution;
        genderDistribution?: GenderDistribution;
        countryDistribution?: CountryDistribution;
        languageDistribution?: LanguageDistribution;
    };

    // Device info
    deviceTypes?: DeviceTypeDistribution;
    osVersions?: OsVersionDistribution;

    // Engagement
    averageSessionDuration?: number; // seconds
    sessionsPerUser?: number;
    screenPageViews?: number;

    collectedAt: Date;
}

/**
 * Issue detail for code analysis.
 * コード分析用のIssue詳細。
 */
export interface GitHubIssueDetail {
    number: number;
    title: string;
    body: string | null;
    state: "open" | "closed";
    labels: string[];
    createdAt: string;
}

/**
 * Code analysis data from repository.
 * リポジトリからのコード分析データ。
 */
export interface GitHubCodeAnalysis {
    /** README content (truncated if too long) */
    readme?: string;
    /** Project configuration (pubspec.yaml, package.json, etc.) */
    projectConfig?: string;
    /** Project type detected */
    projectType?: "flutter" | "nodejs" | "python" | "unknown";
    /** Recent issue details for understanding user needs */
    recentIssues?: GitHubIssueDetail[];
}

/**
 * GitHub repository data.
 * GitHubリポジトリのデータ。
 */
export interface GitHubData {
    repoFullName: string; // "owner/repo"
    dateRange: DateRange;

    // Repository stats
    stars?: number;
    forks?: number;
    watchers?: number;
    openIssuesCount?: number;

    // Issues activity
    openIssues?: number;
    closedIssuesInPeriod?: number;
    newIssuesInPeriod?: number;

    // Pull Requests
    openPRs?: number;
    mergedPRsInPeriod?: number;
    newPRsInPeriod?: number;

    // Commits
    recentCommits?: number;
    contributors?: number;

    // Latest release
    latestRelease?: {
        tagName: string;
        name?: string;
        publishedAt: string;
        downloadCount?: number;
    };

    // Languages
    languages?: { [language: string]: number };

    // Code analysis data
    codeAnalysis?: GitHubCodeAnalysis;

    collectedAt: Date;
}

/**
 * Combined marketing data from all sources.
 * すべてのソースからの統合マーケティングデータ。
 */
export interface CombinedMarketingData {
    appId: string;
    dateRange: DateRange;
    googlePlay?: GooglePlayData;
    appStore?: AppStoreData;
    firebaseAnalytics?: FirebaseAnalyticsData;
    github?: GitHubData;
    collectedAt: Date;
}
