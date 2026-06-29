/**
 * Firebase Analytics data types.
 *
 * Firebase Analyticsデータ型。
 */

/**
 * Configuration for Firebase Analytics Client.
 *
 * Firebase Analyticsクライアントの設定。
 */
export interface FirebaseAnalyticsClientConfig {
    serviceAccountPath: string;
    propertyId: string;
}

/**
 * Age group distribution.
 *
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
    [key: string]: number | undefined;
}

/**
 * Gender distribution.
 *
 * 性別の分布。
 */
export interface GenderDistribution {
    male?: number;
    female?: number;
    unknown?: number;
}

/**
 * Country distribution.
 *
 * 国別の分布。
 */
export interface CountryDistribution {
    [countryCode: string]: number;
}

/**
 * Language distribution.
 *
 * 言語別の分布。
 */
export interface LanguageDistribution {
    [languageCode: string]: number;
}

/**
 * Device type distribution.
 *
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
 *
 * OSバージョンの分布。
 */
export interface OsVersionDistribution {
    [version: string]: number;
}

/**
 * Active users metrics.
 *
 * アクティブユーザーのメトリクス。
 */
export interface ActiveUsersMetrics {
    dau: number;
    wau: number;
    mau: number;
    newUsers: number;
    returningUsers?: number;
}

/**
 * User demographics data.
 *
 * ユーザーの人口統計データ。
 */
export interface UserDemographics {
    ageGroups?: AgeGroupDistribution;
    genderDistribution?: GenderDistribution;
    countryDistribution?: CountryDistribution;
    languageDistribution?: LanguageDistribution;
}

/**
 * Device information.
 *
 * デバイス情報。
 */
export interface DeviceInfo {
    deviceTypes?: DeviceTypeDistribution;
    osVersions?: OsVersionDistribution;
}

/**
 * Engagement metrics.
 *
 * エンゲージメントメトリクス。
 */
export interface EngagementMetrics {
    averageSessionDuration?: number;
    sessionsPerUser?: number;
    screenPageViews?: number;
}

/**
 * Aggregated Firebase Analytics data for marketing analysis.
 *
 * マーケティング分析用の集約されたFirebase Analyticsデータ。
 */
export interface FirebaseAnalyticsData {
    propertyId: string;
    dau?: number;
    wau?: number;
    mau?: number;
    newUsers?: number;
    totalUsers?: number;
    averageSessionDuration?: number;
    sessionsPerUser?: number;
    demographics?: UserDemographics;
    deviceInfo?: DeviceInfo;
    collectedAt: Date;
}
