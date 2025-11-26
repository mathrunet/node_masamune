/**
 * Chart Service
 *
 * Generates charts for marketing reports using QuickChart API.
 * QuickChart provides Chart.js rendering as a service.
 *
 * @see https://quickchart.io/documentation/
 */

import { RatingDistribution, CombinedMarketingData } from "../models/marketing_data";
import { withRetry } from "../utils/error_handler";

const QUICKCHART_API_URL = "https://quickchart.io/chart";

/**
 * Downloads chart data.
 */
export interface DownloadsChartData {
    labels: string[];
    downloads: number[];
    uninstalls?: number[];
}

/**
 * Demographics chart data.
 */
export interface DemographicsChartData {
    labels: string[];
    values: number[];
}

/**
 * Country distribution chart data.
 */
export interface CountryDistributionData {
    labels: string[];
    values: number[];
}

/**
 * Engagement chart data.
 */
export interface EngagementChartData {
    dau: number;
    wau: number;
    mau: number;
    sessionsPerUser?: number;
    avgSessionDuration?: number;
}

/**
 * Generated charts collection.
 */
export interface GeneratedCharts {
    downloads?: Buffer;
    ratingDistribution?: Buffer;
    demographics?: Buffer;
    countryDistribution?: Buffer;
    engagement?: Buffer;
}

/**
 * Chart generation options.
 */
export interface ChartOptions {
    width?: number;
    height?: number;
    backgroundColor?: string;
    format?: "png" | "webp" | "svg";
}

const DEFAULT_OPTIONS: ChartOptions = {
    width: 600,
    height: 400,
    backgroundColor: "#ffffff",
    format: "png",
};

/**
 * Chart Service using QuickChart API.
 */
export class ChartService {
    private options: ChartOptions;

    constructor(options: ChartOptions = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    /**
     * Generate chart image from QuickChart API.
     */
    private async generateChart(chartConfig: object): Promise<Buffer> {
        return withRetry(async () => {
            const url = new URL(QUICKCHART_API_URL);
            url.searchParams.set("c", JSON.stringify(chartConfig));
            url.searchParams.set("w", String(this.options.width));
            url.searchParams.set("h", String(this.options.height));
            url.searchParams.set("bkg", this.options.backgroundColor || "#ffffff");
            url.searchParams.set("f", this.options.format || "png");

            const response = await fetch(url.toString());

            if (!response.ok) {
                throw new Error(`QuickChart API error: ${response.status} ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        });
    }

    /**
     * Generate downloads trend chart.
     */
    async generateDownloadsChart(data: DownloadsChartData): Promise<Buffer> {
        const datasets: any[] = [
            {
                label: "Downloads",
                data: data.downloads,
                borderColor: "#4CAF50",
                backgroundColor: "rgba(76, 175, 80, 0.1)",
                fill: true,
                tension: 0.3,
            },
        ];

        if (data.uninstalls && data.uninstalls.length > 0) {
            datasets.push({
                label: "Uninstalls",
                data: data.uninstalls,
                borderColor: "#f44336",
                backgroundColor: "rgba(244, 67, 54, 0.1)",
                fill: true,
                tension: 0.3,
            });
        }

        const chartConfig = {
            type: "line",
            data: {
                labels: data.labels,
                datasets: datasets,
            },
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: "Downloads Trend",
                        font: { size: 16 },
                    },
                    legend: {
                        position: "bottom",
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                    },
                },
            },
        };

        return this.generateChart(chartConfig);
    }

    /**
     * Generate rating distribution chart.
     */
    async generateRatingDistributionChart(distribution: RatingDistribution): Promise<Buffer> {
        const chartConfig = {
            type: "bar",
            data: {
                labels: ["1 Star", "2 Stars", "3 Stars", "4 Stars", "5 Stars"],
                datasets: [
                    {
                        label: "Ratings",
                        data: [
                            distribution.star1,
                            distribution.star2,
                            distribution.star3,
                            distribution.star4,
                            distribution.star5,
                        ],
                        backgroundColor: [
                            "#f44336",
                            "#ff9800",
                            "#ffeb3b",
                            "#8bc34a",
                            "#4CAF50",
                        ],
                    },
                ],
            },
            options: {
                indexAxis: "y",
                plugins: {
                    title: {
                        display: true,
                        text: "Rating Distribution",
                        font: { size: 16 },
                    },
                    legend: {
                        display: false,
                    },
                },
                scales: {
                    x: {
                        beginAtZero: true,
                    },
                },
            },
        };

        return this.generateChart(chartConfig);
    }

    /**
     * Generate user demographics pie chart.
     */
    async generateUserDemographicsChart(data: DemographicsChartData): Promise<Buffer> {
        const chartConfig = {
            type: "pie",
            data: {
                labels: data.labels,
                datasets: [
                    {
                        data: data.values,
                        backgroundColor: [
                            "#2196F3",
                            "#4CAF50",
                            "#ff9800",
                            "#9c27b0",
                            "#607d8b",
                            "#e91e63",
                        ],
                    },
                ],
            },
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: "Age Demographics",
                        font: { size: 16 },
                    },
                    legend: {
                        position: "right",
                    },
                },
            },
        };

        return this.generateChart(chartConfig);
    }

    /**
     * Generate country distribution doughnut chart.
     */
    async generateCountryDistributionChart(data: CountryDistributionData): Promise<Buffer> {
        const chartConfig = {
            type: "doughnut",
            data: {
                labels: data.labels,
                datasets: [
                    {
                        data: data.values,
                        backgroundColor: [
                            "#2196F3",
                            "#f44336",
                            "#4CAF50",
                            "#ff9800",
                            "#9c27b0",
                            "#607d8b",
                        ],
                    },
                ],
            },
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: "Country Distribution",
                        font: { size: 16 },
                    },
                    legend: {
                        position: "right",
                    },
                },
            },
        };

        return this.generateChart(chartConfig);
    }

    /**
     * Generate engagement metrics chart.
     */
    async generateEngagementChart(data: EngagementChartData): Promise<Buffer> {
        const chartConfig = {
            type: "bar",
            data: {
                labels: ["DAU", "WAU", "MAU"],
                datasets: [
                    {
                        label: "Active Users",
                        data: [data.dau, data.wau, data.mau],
                        backgroundColor: ["#2196F3", "#4CAF50", "#ff9800"],
                    },
                ],
            },
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: "User Engagement",
                        font: { size: 16 },
                    },
                    legend: {
                        display: false,
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                    },
                },
            },
        };

        return this.generateChart(chartConfig);
    }

    /**
     * Generate all charts from combined marketing data.
     */
    async generateAllCharts(data: CombinedMarketingData): Promise<GeneratedCharts> {
        const charts: GeneratedCharts = {};
        const promises: Promise<void>[] = [];

        // Rating distribution chart
        if (data.googlePlay?.ratingDistribution || data.appStore?.ratingDistribution) {
            const distribution =
                data.googlePlay?.ratingDistribution || data.appStore?.ratingDistribution;
            if (distribution) {
                promises.push(
                    this.generateRatingDistributionChart(distribution).then((buffer) => {
                        charts.ratingDistribution = buffer;
                    })
                );
            }
        }

        // Engagement chart
        if (data.firebaseAnalytics) {
            const engagementData: EngagementChartData = {
                dau: data.firebaseAnalytics.dau || 0,
                wau: data.firebaseAnalytics.wau || 0,
                mau: data.firebaseAnalytics.mau || 0,
                sessionsPerUser: data.firebaseAnalytics.sessionsPerUser,
                avgSessionDuration: data.firebaseAnalytics.averageSessionDuration,
            };
            promises.push(
                this.generateEngagementChart(engagementData).then((buffer) => {
                    charts.engagement = buffer;
                })
            );
        }

        // Demographics chart
        if (data.firebaseAnalytics?.demographics?.ageGroups) {
            const ageGroups = data.firebaseAnalytics.demographics.ageGroups;
            const demographicsData: DemographicsChartData = {
                labels: Object.keys(ageGroups),
                values: Object.values(ageGroups),
            };
            promises.push(
                this.generateUserDemographicsChart(demographicsData).then((buffer) => {
                    charts.demographics = buffer;
                })
            );
        }

        // Country distribution chart
        if (data.firebaseAnalytics?.demographics?.countryDistribution) {
            const countryDist = data.firebaseAnalytics.demographics.countryDistribution;
            const countryData: CountryDistributionData = {
                labels: Object.keys(countryDist),
                values: Object.values(countryDist),
            };
            promises.push(
                this.generateCountryDistributionChart(countryData).then((buffer) => {
                    charts.countryDistribution = buffer;
                })
            );
        }

        await Promise.all(promises);
        return charts;
    }
}
