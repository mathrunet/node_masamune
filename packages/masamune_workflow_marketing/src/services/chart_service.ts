/**
 * Chart Service
 *
 * Generates charts for marketing reports using QuickChart API.
 * QuickChart provides Chart.js rendering as a service.
 *
 * @see https://quickchart.io/documentation/
 */

const QUICKCHART_API_URL = "https://quickchart.io/chart";

/**
 * Rating distribution data.
 */
export interface RatingDistribution {
    star1: number;
    star2: number;
    star3: number;
    star4: number;
    star5: number;
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
}

/**
 * Sentiment chart data.
 */
export interface SentimentChartData {
    positive: number;
    neutral: number;
    negative: number;
}

/**
 * Generated charts collection.
 */
export interface GeneratedCharts {
    ratingDistribution?: Buffer;
    demographics?: Buffer;
    countryDistribution?: Buffer;
    engagement?: Buffer;
    sentiment?: Buffer;
    retentionRatio?: Buffer;
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
    width: 400,
    height: 300,
    backgroundColor: "#ffffff",
    format: "png",
};

/**
 * Input data for chart generation from task.results.
 */
export interface ChartInputData {
    googlePlayConsole?: {
        ratingDistribution?: RatingDistribution;
        [key: string]: any;
    };
    appStore?: {
        ratingDistribution?: RatingDistribution;
        [key: string]: any;
    };
    firebaseAnalytics?: {
        dau?: number;
        wau?: number;
        mau?: number;
        demographics?: {
            ageGroups?: { [key: string]: number };
            countryDistribution?: { [key: string]: number };
        };
        [key: string]: any;
    };
    marketingAnalytics?: {
        reviewAnalysis?: {
            sentiment?: SentimentChartData;
        };
        [key: string]: any;
    };
}

/**
 * Chart Service using QuickChart API.
 */
export class ChartService {
    private options: ChartOptions;

    constructor(options: ChartOptions = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    /**
     * Generate chart image from QuickChart API with retry.
     */
    private async generateChart(chartConfig: object, retries: number = 3): Promise<Buffer> {
        let lastError: Error | null = null;

        for (let i = 0; i < retries; i++) {
            try {
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
            } catch (error) {
                lastError = error as Error;
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                }
            }
        }

        throw lastError || new Error("Failed to generate chart");
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
                        font: { size: 28, weight: "bold" },
                    },
                    legend: {
                        display: false,
                    },
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { font: { size: 20 } },
                    },
                    y: {
                        ticks: { font: { size: 22 } },
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
                        font: { size: 28, weight: "bold" },
                    },
                    legend: {
                        position: "right",
                        labels: { font: { size: 36 } },
                    },
                    datalabels: {
                        display: true,
                        formatter: (value: number, ctx: any) => {
                            const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return percentage > 5 ? `${percentage}%` : "";
                        },
                        color: "#fff",
                        font: { size: 20, weight: "bold" },
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
                        font: { size: 28, weight: "bold" },
                    },
                    legend: {
                        position: "right",
                        labels: { font: { size: 36 } },
                    },
                    datalabels: {
                        display: true,
                        formatter: (value: number, ctx: any) => {
                            const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return percentage > 5 ? `${percentage}%` : "";
                        },
                        color: "#fff",
                        font: { size: 20, weight: "bold" },
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
                        font: { size: 28, weight: "bold" },
                    },
                    legend: {
                        position: "top",
                        labels: { font: { size: 36 } },
                    },
                    datalabels: {
                        display: true,
                        anchor: "end",
                        align: "top",
                        font: { size: 20, weight: "bold" },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { font: { size: 20 } },
                    },
                    x: {
                        ticks: { font: { size: 22 } },
                    },
                },
            },
        };

        return this.generateChart(chartConfig);
    }

    /**
     * Generate sentiment pie chart for review analysis.
     */
    async generateSentimentChart(data: SentimentChartData): Promise<Buffer> {
        const chartConfig = {
            type: "doughnut",
            data: {
                labels: ["Positive", "Neutral", "Negative"],
                datasets: [
                    {
                        data: [data.positive, data.neutral, data.negative],
                        backgroundColor: ["#4CAF50", "#9e9e9e", "#f44336"],
                    },
                ],
            },
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: "Review Sentiment",
                        font: { size: 28, weight: "bold" },
                    },
                    legend: {
                        position: "bottom",
                        labels: { font: { size: 36 } },
                    },
                    datalabels: {
                        display: true,
                        formatter: (value: number) => `${value}%`,
                        color: "#fff",
                        font: { size: 22, weight: "bold" },
                    },
                },
            },
        };

        return this.generateChart(chartConfig);
    }

    /**
     * Generate retention ratio gauge chart (DAU/MAU ratio).
     */
    async generateRetentionRatioChart(dau: number, mau: number): Promise<Buffer> {
        const ratio = mau > 0 ? Math.round((dau / mau) * 100) : 0;

        const chartConfig = {
            type: "doughnut",
            data: {
                datasets: [
                    {
                        data: [ratio, 100 - ratio],
                        backgroundColor: [this.getRetentionColor(ratio), "#e0e0e0"],
                        borderWidth: 0,
                    },
                ],
            },
            options: {
                circumference: 180,
                rotation: 270,
                cutout: "70%",
                plugins: {
                    title: {
                        display: true,
                        text: `Retention Ratio: ${ratio}%`,
                        font: { size: 28, weight: "bold" },
                        position: "bottom",
                    },
                    legend: {
                        display: false,
                    },
                    datalabels: {
                        display: false,
                    },
                },
            },
        };

        return this.generateChart(chartConfig);
    }

    /**
     * Get color for retention ratio based on value.
     */
    private getRetentionColor(ratio: number): string {
        if (ratio >= 20) return "#4CAF50"; // Good
        if (ratio >= 10) return "#ff9800"; // Average
        return "#f44336"; // Needs improvement
    }

    /**
     * Generate all charts from task.results data.
     */
    async generateAllCharts(data: ChartInputData): Promise<GeneratedCharts> {
        const charts: GeneratedCharts = {};
        const promises: Promise<void>[] = [];

        // Rating distribution chart
        const ratingDistribution = data.googlePlayConsole?.ratingDistribution || data.appStore?.ratingDistribution;
        if (ratingDistribution) {
            promises.push(
                this.generateRatingDistributionChart(ratingDistribution).then((buffer) => {
                    charts.ratingDistribution = buffer;
                }).catch(err => {
                    console.error("Failed to generate rating distribution chart:", err);
                })
            );
        }

        // Engagement chart
        if (data.firebaseAnalytics) {
            const engagementData: EngagementChartData = {
                dau: data.firebaseAnalytics.dau || 0,
                wau: data.firebaseAnalytics.wau || 0,
                mau: data.firebaseAnalytics.mau || 0,
            };
            if (engagementData.dau > 0 || engagementData.wau > 0 || engagementData.mau > 0) {
                promises.push(
                    this.generateEngagementChart(engagementData).then((buffer) => {
                        charts.engagement = buffer;
                    }).catch(err => {
                        console.error("Failed to generate engagement chart:", err);
                    })
                );

                // Retention ratio chart
                if (engagementData.mau > 0) {
                    promises.push(
                        this.generateRetentionRatioChart(engagementData.dau, engagementData.mau).then((buffer) => {
                            charts.retentionRatio = buffer;
                        }).catch(err => {
                            console.error("Failed to generate retention ratio chart:", err);
                        })
                    );
                }
            }
        }

        // Demographics chart
        if (data.firebaseAnalytics?.demographics?.ageGroups) {
            const ageGroups = data.firebaseAnalytics.demographics.ageGroups;
            const demographicsData: DemographicsChartData = {
                labels: Object.keys(ageGroups),
                values: Object.values(ageGroups),
            };
            if (demographicsData.labels.length > 0) {
                promises.push(
                    this.generateUserDemographicsChart(demographicsData).then((buffer) => {
                        charts.demographics = buffer;
                    }).catch(err => {
                        console.error("Failed to generate demographics chart:", err);
                    })
                );
            }
        }

        // Country distribution chart
        if (data.firebaseAnalytics?.demographics?.countryDistribution) {
            const countryDist = data.firebaseAnalytics.demographics.countryDistribution;
            const countryData: CountryDistributionData = {
                labels: Object.keys(countryDist),
                values: Object.values(countryDist),
            };
            if (countryData.labels.length > 0) {
                promises.push(
                    this.generateCountryDistributionChart(countryData).then((buffer) => {
                        charts.countryDistribution = buffer;
                    }).catch(err => {
                        console.error("Failed to generate country distribution chart:", err);
                    })
                );
            }
        }

        // Sentiment chart
        if (data.marketingAnalytics?.reviewAnalysis?.sentiment) {
            const sentiment = data.marketingAnalytics.reviewAnalysis.sentiment;
            promises.push(
                this.generateSentimentChart(sentiment).then((buffer) => {
                    charts.sentiment = buffer;
                }).catch(err => {
                    console.error("Failed to generate sentiment chart:", err);
                })
            );
        }

        await Promise.all(promises);
        return charts;
    }
}
