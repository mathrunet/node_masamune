/**
 * Firebase Analytics Data API Client
 *
 * Collects analytics data from Google Analytics 4 (Firebase Analytics):
 * - Active users (DAU, WAU, MAU)
 * - User demographics (age, gender, country, language)
 * - Device information
 * - Engagement metrics
 *
 * @see https://developers.google.com/analytics/devguides/reporting/data/v1
 */

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import * as fs from "fs";
import {
    DateRange,
    FirebaseAnalyticsClientConfig,
    AgeGroupDistribution,
    GenderDistribution,
    CountryDistribution,
    LanguageDistribution,
    DeviceTypeDistribution,
    OsVersionDistribution,
    ActiveUsersMetrics,
    UserDemographics,
    DeviceInfo,
    EngagementMetrics,
} from "../models";

// Re-export types for backward compatibility
export {
    DateRange,
    FirebaseAnalyticsClientConfig,
    AgeGroupDistribution,
    GenderDistribution,
    CountryDistribution,
    LanguageDistribution,
    DeviceTypeDistribution,
    OsVersionDistribution,
    ActiveUsersMetrics,
    UserDemographics,
    DeviceInfo,
    EngagementMetrics,
};

/**
 * Firebase Analytics Data API Client.
 */
export class FirebaseAnalyticsClient {
    private analyticsClient: BetaAnalyticsDataClient;
    private propertyId: string;

    constructor(config: FirebaseAnalyticsClientConfig) {
        // Validate service account file exists
        if (!fs.existsSync(config.serviceAccountPath)) {
            throw new Error(`Service account file not found: ${config.serviceAccountPath}`);
        }

        // Initialize Analytics Data client with service account
        this.analyticsClient = new BetaAnalyticsDataClient({
            keyFilename: config.serviceAccountPath,
        });

        this.propertyId = config.propertyId;
    }

    /**
     * Get active users metrics (DAU, WAU, MAU).
     */
    async getActiveUsers(dateRange: DateRange): Promise<ActiveUsersMetrics> {
        try {
            const [response] = await this.analyticsClient.runReport({
                property: this.propertyId,
                dateRanges: [
                    {
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                    },
                ],
                metrics: [
                    { name: "activeUsers" },
                    { name: "active7DayUsers" },
                    { name: "active28DayUsers" },
                    { name: "newUsers" },
                ],
            });

            const row = response.rows?.[0];
            const metrics = row?.metricValues || [];

            return {
                dau: parseInt(metrics[0]?.value || "0", 10),
                wau: parseInt(metrics[1]?.value || "0", 10),
                mau: parseInt(metrics[2]?.value || "0", 10),
                newUsers: parseInt(metrics[3]?.value || "0", 10),
                returningUsers: parseInt(metrics[0]?.value || "0", 10) - parseInt(metrics[3]?.value || "0", 10),
            };
        } catch (err: any) {
            console.error("Failed to get active users:", err.message);
            return { dau: 0, wau: 0, mau: 0, newUsers: 0, returningUsers: 0 };
        }
    }

    /**
     * Get user demographics (age, gender, country, language).
     */
    async getUserDemographics(dateRange: DateRange): Promise<UserDemographics> {
        const [ageGender, country, language] = await Promise.all([
            this.getAgeGenderDistribution(dateRange),
            this.getCountryDistribution(dateRange),
            this.getLanguageDistribution(dateRange),
        ]);

        return {
            ageGroups: ageGender.ageGroups,
            genderDistribution: ageGender.genderDistribution,
            countryDistribution: country,
            languageDistribution: language,
        };
    }

    /**
     * Get age and gender distribution.
     */
    private async getAgeGenderDistribution(
        dateRange: DateRange
    ): Promise<{ ageGroups: AgeGroupDistribution; genderDistribution: GenderDistribution }> {
        try {
            const [response] = await this.analyticsClient.runReport({
                property: this.propertyId,
                dateRanges: [
                    {
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                    },
                ],
                dimensions: [{ name: "userAgeBracket" }, { name: "userGender" }],
                metrics: [{ name: "activeUsers" }],
            });

            const ageGroups: AgeGroupDistribution = {};
            const genderDistribution: GenderDistribution = {
                male: 0,
                female: 0,
                unknown: 0,
            };

            for (const row of response.rows || []) {
                const age = row.dimensionValues?.[0]?.value || "unknown";
                const gender = row.dimensionValues?.[1]?.value || "unknown";
                const count = parseInt(row.metricValues?.[0]?.value || "0", 10);

                // Map age brackets
                const ageKey = this.mapAgeBracket(age);
                ageGroups[ageKey] = (ageGroups[ageKey] || 0) + count;

                // Map gender
                if (gender === "male") {
                    genderDistribution.male = (genderDistribution.male || 0) + count;
                } else if (gender === "female") {
                    genderDistribution.female = (genderDistribution.female || 0) + count;
                } else {
                    genderDistribution.unknown = (genderDistribution.unknown || 0) + count;
                }
            }

            return { ageGroups, genderDistribution };
        } catch (err: any) {
            console.error("Failed to get age/gender distribution:", err.message);
            return {
                ageGroups: {},
                genderDistribution: { male: 0, female: 0, unknown: 0 },
            };
        }
    }

    /**
     * Map GA4 age bracket to our format.
     */
    private mapAgeBracket(ageBracket: string): keyof AgeGroupDistribution {
        const mapping: Record<string, keyof AgeGroupDistribution> = {
            "18-24": "18-24",
            "25-34": "25-34",
            "35-44": "35-44",
            "45-54": "45-54",
            "55-64": "55-64",
            "65+": "65+",
        };
        return mapping[ageBracket] || "unknown";
    }

    /**
     * Get country distribution.
     */
    private async getCountryDistribution(dateRange: DateRange): Promise<CountryDistribution> {
        try {
            const [response] = await this.analyticsClient.runReport({
                property: this.propertyId,
                dateRanges: [
                    {
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                    },
                ],
                dimensions: [{ name: "country" }],
                metrics: [{ name: "activeUsers" }],
                limit: 50,
            });

            const distribution: CountryDistribution = {};

            for (const row of response.rows || []) {
                const country = row.dimensionValues?.[0]?.value || "unknown";
                const count = parseInt(row.metricValues?.[0]?.value || "0", 10);
                distribution[country] = count;
            }

            return distribution;
        } catch (err: any) {
            console.error("Failed to get country distribution:", err.message);
            return {};
        }
    }

    /**
     * Get language distribution.
     */
    private async getLanguageDistribution(dateRange: DateRange): Promise<LanguageDistribution> {
        try {
            const [response] = await this.analyticsClient.runReport({
                property: this.propertyId,
                dateRanges: [
                    {
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                    },
                ],
                dimensions: [{ name: "language" }],
                metrics: [{ name: "activeUsers" }],
                limit: 50,
            });

            const distribution: LanguageDistribution = {};

            for (const row of response.rows || []) {
                const language = row.dimensionValues?.[0]?.value || "unknown";
                const count = parseInt(row.metricValues?.[0]?.value || "0", 10);
                distribution[language] = count;
            }

            return distribution;
        } catch (err: any) {
            console.error("Failed to get language distribution:", err.message);
            return {};
        }
    }

    /**
     * Get device information (device types and OS versions).
     */
    async getDeviceInfo(dateRange: DateRange): Promise<DeviceInfo> {
        const [deviceTypes, osVersions] = await Promise.all([
            this.getDeviceTypeDistribution(dateRange),
            this.getOsVersionDistribution(dateRange),
        ]);

        return {
            deviceTypes,
            osVersions,
        };
    }

    /**
     * Get device type distribution.
     */
    private async getDeviceTypeDistribution(dateRange: DateRange): Promise<DeviceTypeDistribution> {
        try {
            const [response] = await this.analyticsClient.runReport({
                property: this.propertyId,
                dateRanges: [
                    {
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                    },
                ],
                dimensions: [{ name: "deviceCategory" }],
                metrics: [{ name: "activeUsers" }],
            });

            const distribution: DeviceTypeDistribution = {
                phone: 0,
                tablet: 0,
                desktop: 0,
                other: 0,
            };

            for (const row of response.rows || []) {
                const category = row.dimensionValues?.[0]?.value?.toLowerCase() || "other";
                const count = parseInt(row.metricValues?.[0]?.value || "0", 10);

                if (category === "mobile") {
                    distribution.phone = (distribution.phone || 0) + count;
                } else if (category === "tablet") {
                    distribution.tablet = (distribution.tablet || 0) + count;
                } else if (category === "desktop") {
                    distribution.desktop = (distribution.desktop || 0) + count;
                } else {
                    distribution.other = (distribution.other || 0) + count;
                }
            }

            return distribution;
        } catch (err: any) {
            console.error("Failed to get device type distribution:", err.message);
            return { phone: 0, tablet: 0, desktop: 0, other: 0 };
        }
    }

    /**
     * Get OS version distribution.
     */
    private async getOsVersionDistribution(dateRange: DateRange): Promise<OsVersionDistribution> {
        try {
            const [response] = await this.analyticsClient.runReport({
                property: this.propertyId,
                dateRanges: [
                    {
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                    },
                ],
                dimensions: [{ name: "operatingSystemWithVersion" }],
                metrics: [{ name: "activeUsers" }],
                limit: 20,
            });

            const distribution: OsVersionDistribution = {};

            for (const row of response.rows || []) {
                const osVersion = row.dimensionValues?.[0]?.value || "unknown";
                const count = parseInt(row.metricValues?.[0]?.value || "0", 10);
                distribution[osVersion] = count;
            }

            return distribution;
        } catch (err: any) {
            console.error("Failed to get OS version distribution:", err.message);
            return {};
        }
    }

    /**
     * Get engagement metrics.
     */
    async getEngagementMetrics(dateRange: DateRange): Promise<EngagementMetrics> {
        try {
            const [response] = await this.analyticsClient.runReport({
                property: this.propertyId,
                dateRanges: [
                    {
                        startDate: dateRange.startDate,
                        endDate: dateRange.endDate,
                    },
                ],
                metrics: [
                    { name: "averageSessionDuration" },
                    { name: "sessionsPerUser" },
                    { name: "screenPageViews" },
                ],
            });

            const row = response.rows?.[0];
            const metrics = row?.metricValues || [];

            return {
                averageSessionDuration: parseFloat(metrics[0]?.value || "0"),
                sessionsPerUser: parseFloat(metrics[1]?.value || "0"),
                screenPageViews: parseInt(metrics[2]?.value || "0", 10),
            };
        } catch (err: any) {
            console.error("Failed to get engagement metrics:", err.message);
            return { averageSessionDuration: 0, sessionsPerUser: 0, screenPageViews: 0 };
        }
    }

    /**
     * Collect all Firebase Analytics data for a date range.
     */
    async collectAllData(dateRange: DateRange): Promise<{ [key: string]: any }> {
        const [activeUsers, demographics, deviceInfo, engagement] = await Promise.all([
            this.getActiveUsers(dateRange).catch((err) => {
                console.error("Failed to get active users:", err.message);
                return { dau: 0, wau: 0, mau: 0, newUsers: 0, returningUsers: 0 };
            }),
            this.getUserDemographics(dateRange).catch((err) => {
                console.error("Failed to get demographics:", err.message);
                return {
                    ageGroups: {},
                    genderDistribution: { male: 0, female: 0, unknown: 0 },
                    countryDistribution: {},
                    languageDistribution: {},
                };
            }),
            this.getDeviceInfo(dateRange).catch((err) => {
                console.error("Failed to get device info:", err.message);
                return {
                    deviceTypes: { phone: 0, tablet: 0, desktop: 0, other: 0 },
                    osVersions: {},
                };
            }),
            this.getEngagementMetrics(dateRange).catch((err) => {
                console.error("Failed to get engagement metrics:", err.message);
                return { averageSessionDuration: 0, sessionsPerUser: 0, screenPageViews: 0 };
            }),
        ]);

        return {
            propertyId: this.propertyId,
            dateRange: dateRange,
            dau: activeUsers.dau,
            wau: activeUsers.wau,
            mau: activeUsers.mau,
            newUsers: activeUsers.newUsers,
            returningUsers: activeUsers.returningUsers,
            demographics: demographics,
            deviceTypes: deviceInfo.deviceTypes,
            osVersions: deviceInfo.osVersions,
            averageSessionDuration: engagement.averageSessionDuration,
            sessionsPerUser: engagement.sessionsPerUser,
            screenPageViews: engagement.screenPageViews,
            collectedAt: new Date().toISOString(),
        };
    }
}
