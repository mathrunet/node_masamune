/**
 * PDF Service
 *
 * Generates PDF marketing reports using pdfkit.
 * Supports multilingual text with appropriate fonts.
 *
 * @see https://pdfkit.org/
 */

import PDFDocument from "pdfkit";
import * as path from "path";
import * as fs from "fs";
import { PDFInputData, PDFGenerationOptions, GeneratedCharts } from "../models";
import {
    getTranslations,
    getFontFamily,
    MarketingTranslations,
    FontFamily,
} from "../locales";

// Re-export types for backward compatibility
export { PDFInputData, PDFGenerationOptions, GeneratedCharts };

/**
 * Font family configuration.
 */
interface FontConfig {
    name: string;
    regularFile: string;
    boldFile: string;
    isVariable?: boolean; // Variable fonts use same file for both
}

/**
 * Font family configurations for multilingual support.
 */
const FONT_CONFIGS: FontConfig[] = [
    { name: "NotoSansJP", regularFile: "NotoSansJP-Regular.ttf", boldFile: "NotoSansJP-Bold.ttf" },
    { name: "NotoSansSC", regularFile: "NotoSansSC.ttf", boldFile: "NotoSansSC.ttf", isVariable: true },
    { name: "NotoSansKR", regularFile: "NotoSansKR.ttf", boldFile: "NotoSansKR.ttf", isVariable: true },
    { name: "NotoSans", regularFile: "NotoSans.ttf", boldFile: "NotoSans.ttf", isVariable: true },
];

/**
 * PDF Service for generating marketing reports.
 */
export class PDFService {
    private readonly pageWidth = 595.28; // A4 width in points
    private readonly pageHeight = 841.89; // A4 height in points
    private readonly margin = 50;
    private readonly contentWidth: number;
    private fontDir: string;
    private registeredFonts: Set<string> = new Set();
    private currentFontFamily: FontFamily = "Helvetica";
    private translations: MarketingTranslations;

    constructor() {
        this.contentWidth = this.pageWidth - this.margin * 2;
        // Default font directory: assets/fonts relative to package root
        this.fontDir = path.join(__dirname, "..", "..", "assets", "fonts");
        // Default to English translations
        this.translations = getTranslations("en");
    }

    /**
     * Register fonts to PDFDocument based on locale.
     */
    private registerFonts(doc: PDFKit.PDFDocument, locale?: string): void {
        // Determine font family from locale
        this.currentFontFamily = getFontFamily(locale);
        this.translations = getTranslations(locale);

        // Register all available font families
        for (const config of FONT_CONFIGS) {
            const regularPath = path.join(this.fontDir, config.regularFile);
            const boldPath = path.join(this.fontDir, config.boldFile);

            if (fs.existsSync(regularPath)) {
                doc.registerFont(config.name, regularPath);
                this.registeredFonts.add(config.name);
            }
            if (!config.isVariable && fs.existsSync(boldPath)) {
                doc.registerFont(`${config.name}-Bold`, boldPath);
                this.registeredFonts.add(`${config.name}-Bold`);
            }
        }
    }

    /**
     * Get font name based on current locale.
     */
    private getFont(bold: boolean = false): string {
        if (this.currentFontFamily === "Helvetica") {
            return bold ? "Helvetica-Bold" : "Helvetica";
        }

        // Check if the font was registered
        if (this.registeredFonts.has(this.currentFontFamily)) {
            // For variable fonts, bold is simulated or same font is used
            if (bold && this.registeredFonts.has(`${this.currentFontFamily}-Bold`)) {
                return `${this.currentFontFamily}-Bold`;
            }
            return this.currentFontFamily;
        }

        // Fallback to Helvetica
        return bold ? "Helvetica-Bold" : "Helvetica";
    }

    /**
     * Generate a complete marketing report PDF.
     */
    async generateReport(options: PDFGenerationOptions): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            try {
                const appName = options.appName ||
                    options.data.appStore?.appName ||
                    options.data.googlePlayConsole?.packageName ||
                    "Marketing Report";

                const doc = new PDFDocument({
                    size: "A4",
                    margins: {
                        top: this.margin,
                        bottom: this.margin,
                        left: this.margin,
                        right: this.margin,
                    },
                    info: {
                        Title: `${appName} Marketing Report`,
                        Author: "Masamune Workflow Marketing",
                        Subject: options.dateRange
                            ? `${options.dateRange.startDate} - ${options.dateRange.endDate}`
                            : new Date().toISOString().split("T")[0],
                    },
                });

                // Register fonts based on locale
                const locale = typeof options.locale === "object"
                    ? options.locale["@language"]
                    : options.locale;
                this.registerFonts(doc, locale);

                const chunks: Buffer[] = [];
                doc.on("data", (chunk) => chunks.push(chunk));
                doc.on("end", () => resolve(Buffer.concat(chunks)));
                doc.on("error", reject);

                // Cover page
                this.addCoverPage(doc, options, appName);

                // Executive Summary page
                if (options.data.marketingAnalytics?.overallAnalysis) {
                    doc.addPage();
                    this.addSummaryPage(doc, options);

                    // Highlights & Concerns page (separate page to avoid overflow)
                    const analysis = options.data.marketingAnalytics.overallAnalysis;
                    if ((analysis.highlights?.length || 0) > 0 || (analysis.concerns?.length || 0) > 0) {
                        doc.addPage();
                        this.addHighlightsConcernsPage(doc, options);
                    }
                }

                // User Analytics page
                if (options.data.firebaseAnalytics) {
                    doc.addPage();
                    this.addUserAnalyticsPage(doc, options);
                }

                // Ratings & Reviews page
                if (options.data.googlePlayConsole || options.data.appStore || options.data.marketingAnalytics?.reviewAnalysis) {
                    doc.addPage();
                    this.addRatingsReviewsPage(doc, options);
                }

                // Competitive Positioning page (market research data)
                if (options.data.marketingAnalytics?.competitivePositioning) {
                    doc.addPage();
                    this.addCompetitivePositioningPage(doc, options);
                }

                // Market Opportunity Priority page (market research data)
                if (options.data.marketingAnalytics?.marketOpportunityPriority) {
                    doc.addPage();
                    this.addMarketOpportunityPriorityPage(doc, options);
                }

                // Trend Analysis page
                if (options.data.marketingAnalytics?.trendAnalysis) {
                    doc.addPage();
                    this.addTrendAnalysisPage(doc, options);
                }

                // Improvement Suggestions page
                if (options.data.marketingAnalytics?.improvementSuggestions?.length) {
                    doc.addPage();
                    this.addImprovementsPage(doc, options);
                }

                // GitHub-based Code Improvements page(s)
                if (options.data.githubImprovements?.improvements?.length) {
                    doc.addPage();
                    this.addGitHubImprovementsPage(doc, options);
                }

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Add cover page to the PDF.
     */
    private addCoverPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions,
        appName: string
    ): void {
        let y = 200;

        // App name
        doc.fontSize(32).font(this.getFont(true));
        doc.text(appName, this.margin, y, {
            width: this.contentWidth,
            align: "center",
        });
        y += 60;

        // Report type
        doc.fontSize(20).font(this.getFont());
        const t = this.translations;
        const reportTypeLabel =
            options.reportType === "daily"
                ? t.dailyReport
                : options.reportType === "weekly"
                    ? t.weeklyReport
                    : t.monthlyReport;
        doc.text(reportTypeLabel, this.margin, y, {
            width: this.contentWidth,
            align: "center",
        });
        y += 40;

        // Date range
        if (options.dateRange) {
            doc.fontSize(16);
            doc.text(
                `${options.dateRange.startDate} - ${options.dateRange.endDate}`,
                this.margin,
                y,
                { width: this.contentWidth, align: "center" }
            );
            y += 80;
        } else {
            y += 40;
        }

        // Generated date
        doc.fontSize(12).font(this.getFont());
        doc.text(
            `${t.generated}: ${new Date().toISOString().split("T")[0]}`,
            this.margin,
            y,
            { width: this.contentWidth, align: "center" }
        );

        // Data sources at the bottom
        y = this.pageHeight - 150;
        doc.fontSize(10).font(this.getFont());
        doc.fillColor("#757575");

        const sources: string[] = [];
        if (options.data.googlePlayConsole) sources.push("Google Play");
        if (options.data.appStore) sources.push("App Store");
        if (options.data.firebaseAnalytics) sources.push("Firebase Analytics");
        if (options.data.marketingAnalytics) sources.push(t.aiAnalysis);

        doc.text(`${t.dataSources}: ${sources.join(" | ")}`, this.margin, y, {
            width: this.contentWidth,
            align: "center",
        });

        doc.fillColor("#000000");
    }

    /**
     * Add summary page with AI analysis.
     */
    private addSummaryPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;
        const analysis = options.data.marketingAnalytics?.overallAnalysis;
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.executiveSummary, this.margin, y);
        y += 35;

        // Summary text
        if (analysis?.summary) {
            doc.fontSize(11).font(this.getFont());
            doc.text(analysis.summary, this.margin, y, {
                width: this.contentWidth,
                align: "justify",
            });
            y = doc.y + 25;
        }

        // Engagement chart
        if (options.charts?.engagement) {
            try {
                const chartWidth = 300;
                const chartHeight = 200;
                const chartX = this.margin + (this.contentWidth - chartWidth) / 2;
                doc.image(options.charts.engagement, chartX, y, {
                    width: chartWidth,
                    height: chartHeight,
                    fit: [chartWidth, chartHeight],
                });
                y += chartHeight + 25;
            } catch {
                // Skip if image fails
            }
        }

        // Key Metrics
        if (analysis?.keyMetrics?.length) {
            doc.fontSize(14).font(this.getFont(true));
            doc.text(t.metric, this.margin, y);
            y += 20;

            const metricsPerRow = 3;
            const metricBoxWidth = this.contentWidth / metricsPerRow;

            for (let i = 0; i < analysis.keyMetrics.length; i++) {
                const metric = analysis.keyMetrics[i];
                const col = i % metricsPerRow;
                const x = this.margin + col * metricBoxWidth;

                if (col === 0 && i > 0) {
                    y += 55;
                }

                // Metric box
                doc.fillColor("#f5f5f5");
                doc.rect(x + 2, y, metricBoxWidth - 4, 50).fill();

                // Metric title
                doc.fillColor("#1565c0");
                doc.fontSize(9).font(this.getFont(true));
                doc.text(metric.metric, x + 8, y + 8, {
                    width: metricBoxWidth - 16,
                });

                // Trend indicator and value
                const trendColor =
                    metric.trend === "up" ? "#2e7d32" : metric.trend === "down" ? "#c62828" : "#757575";
                const trendIcon = metric.trend === "up" ? "+" : metric.trend === "down" ? "-" : "~";
                doc.fillColor(trendColor);
                doc.fontSize(13).font(this.getFont(true));
                doc.text(`${metric.value} ${trendIcon}`, x + 8, y + 28, {
                    width: metricBoxWidth - 16,
                });
            }

            y += 70;
        }

        doc.fillColor("#000000");
    }

    /**
     * Add highlights and concerns page.
     * This page displays highlights and concerns in a 2-column layout.
     * Limited to 5 items each to fit on a single page.
     */
    private addHighlightsConcernsPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;
        const analysis = options.data.marketingAnalytics?.overallAnalysis;
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.highlightsAndConcerns, this.margin, y);
        y += 40;

        const halfWidth = this.contentWidth / 2 - 15;
        const maxItemsPerList = 5;
        const itemHeight = 60; // Fixed height per item to prevent overflow

        // Get limited items
        const highlights = (analysis?.highlights || []).slice(0, maxItemsPerList);
        const concerns = (analysis?.concerns || []).slice(0, maxItemsPerList);
        const remainingHighlights = Math.max(0, (analysis?.highlights?.length || 0) - maxItemsPerList);
        const remainingConcerns = Math.max(0, (analysis?.concerns?.length || 0) - maxItemsPerList);

        // Headers
        doc.fontSize(14).font(this.getFont(true));
        doc.fillColor("#1b5e20");
        doc.text(t.highlights, this.margin, y);
        doc.fillColor("#b71c1c");
        doc.text(t.concerns, this.margin + halfWidth + 30, y);
        y += 25;

        // Draw highlights and concerns side by side
        const maxItems = Math.max(highlights.length, concerns.length);

        for (let i = 0; i < maxItems; i++) {
            // Highlight item
            if (i < highlights.length) {
                doc.fillColor("#e8f5e9");
                doc.roundedRect(this.margin, y, halfWidth, itemHeight - 5, 4).fill();
                doc.fillColor("#1b5e20");
                doc.fontSize(10).font(this.getFont());
                doc.text(highlights[i], this.margin + 8, y + 8, {
                    width: halfWidth - 16,
                    height: itemHeight - 20,
                    ellipsis: true,
                });
            }

            // Concern item
            if (i < concerns.length) {
                doc.fillColor("#ffebee");
                doc.roundedRect(this.margin + halfWidth + 30, y, halfWidth, itemHeight - 5, 4).fill();
                doc.fillColor("#b71c1c");
                doc.fontSize(10).font(this.getFont());
                doc.text(concerns[i], this.margin + halfWidth + 38, y + 8, {
                    width: halfWidth - 16,
                    height: itemHeight - 20,
                    ellipsis: true,
                });
            }

            y += itemHeight;
        }

        // Show remaining count if there are more items
        if (remainingHighlights > 0 || remainingConcerns > 0) {
            y += 10;
            doc.fontSize(9).font(this.getFont());
            doc.fillColor("#757575");

            if (remainingHighlights > 0) {
                doc.text(`+ ${remainingHighlights} more highlights`, this.margin, y);
            }
            if (remainingConcerns > 0) {
                doc.text(`+ ${remainingConcerns} more concerns`, this.margin + halfWidth + 30, y);
            }
        }

        doc.fillColor("#000000");
    }

    /**
     * Add user analytics page.
     */
    private addUserAnalyticsPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;
        const firebase = options.data.firebaseAnalytics;
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.userAnalytics, this.margin, y);
        y += 35;

        if (firebase) {
            // DAU/WAU/MAU stats
            const dau = firebase.dau?.toLocaleString() || "N/A";
            const wau = firebase.wau?.toLocaleString() || "N/A";
            const mau = firebase.mau?.toLocaleString() || "N/A";
            const newUsersVal = firebase.newUsers?.toLocaleString() || "N/A";

            doc.fillColor("#1565c0");
            doc.fontSize(14).font(this.getFont(true));
            doc.text(`DAU: ${dau}  |  WAU: ${wau}  |  MAU: ${mau}  |  ${t.newUsers}: ${newUsersVal}`, this.margin, y);
            doc.fillColor("#000000");
            y += 25;

            // Retention ratio
            if (firebase.dau && firebase.mau && firebase.mau > 0) {
                const retentionRatio = ((firebase.dau / firebase.mau) * 100).toFixed(1);
                doc.fontSize(11).font(this.getFont());
                doc.text(`${t.retention} (DAU/MAU): ${retentionRatio}%`, this.margin, y);
                y += 20;
            }

            // Session stats
            if (firebase.averageSessionDuration || firebase.sessionsPerUser) {
                doc.fontSize(11).font(this.getFont());
                const stats: string[] = [];
                if (firebase.averageSessionDuration) {
                    const minutes = Math.floor(firebase.averageSessionDuration / 60);
                    const seconds = Math.floor(firebase.averageSessionDuration % 60);
                    stats.push(`${t.avgSessionDuration}: ${minutes}m ${seconds}s`);
                }
                if (firebase.sessionsPerUser) {
                    stats.push(`${t.sessionsPerUser}: ${firebase.sessionsPerUser.toFixed(1)}`);
                }
                doc.text(stats.join("  |  "), this.margin, y);
                y += 20;
            }
        }

        y += 20;

        // Charts
        const chartWidth = this.contentWidth / 2 - 10;
        const chartHeight = 200;

        // Engagement and Retention charts
        if (options.charts?.engagement) {
            try {
                doc.fontSize(12).font(this.getFont(true));
                doc.text(t.activeUsers, this.margin, y);
                doc.image(options.charts.engagement, this.margin, y + 18, {
                    width: chartWidth,
                    height: chartHeight,
                    fit: [chartWidth, chartHeight],
                });
            } catch {
                // Skip if image fails
            }
        }

        if (options.charts?.retentionRatio) {
            try {
                doc.fontSize(12).font(this.getFont(true));
                doc.text(t.retention, this.margin + chartWidth + 20, y);
                doc.image(options.charts.retentionRatio, this.margin + chartWidth + 20, y + 18, {
                    width: chartWidth,
                    height: chartHeight,
                    fit: [chartWidth, chartHeight],
                });
            } catch {
                // Skip if image fails
            }
        }

        y += chartHeight + 50;

        // Demographics charts
        if (options.charts?.demographics) {
            try {
                doc.fontSize(12).font(this.getFont(true));
                doc.text(t.ageDemographics, this.margin, y);
                doc.image(options.charts.demographics, this.margin, y + 18, {
                    width: chartWidth,
                    height: chartHeight,
                    fit: [chartWidth, chartHeight],
                });
            } catch {
                // Skip if image fails
            }
        }

        if (options.charts?.countryDistribution) {
            try {
                doc.fontSize(12).font(this.getFont(true));
                doc.text(t.countryDistribution, this.margin + chartWidth + 20, y);
                doc.image(options.charts.countryDistribution, this.margin + chartWidth + 20, y + 18, {
                    width: chartWidth,
                    height: chartHeight,
                    fit: [chartWidth, chartHeight],
                });
            } catch {
                // Skip if image fails
            }
        }
    }

    /**
     * Add ratings and reviews page.
     */
    private addRatingsReviewsPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.ratingsAndReviews, this.margin, y);
        y += 35;

        // Rating summary
        const googlePlay = options.data.googlePlayConsole;
        const appStore = options.data.appStore;
        const chartWidth = this.contentWidth / 2 - 10;
        const chartHeight = 180;

        if (googlePlay?.averageRating) {
            doc.fillColor("#4CAF50");
            doc.fontSize(24).font(this.getFont(true));
            doc.text(`${googlePlay.averageRating.toFixed(1)}`, this.margin, y);
            doc.fillColor("#000000");
            doc.fontSize(11).font(this.getFont());
            doc.text(`Google Play (${googlePlay.totalRatings?.toLocaleString() || 0} ratings)`, this.margin + 50, y + 8);
        }

        if (appStore?.averageRating) {
            doc.fillColor("#007AFF");
            doc.fontSize(24).font(this.getFont(true));
            doc.text(`${appStore.averageRating.toFixed(1)}`, this.margin + chartWidth + 20, y);
            doc.fillColor("#000000");
            doc.fontSize(11).font(this.getFont());
            doc.text(`App Store (${appStore.totalRatings?.toLocaleString() || 0} ratings)`, this.margin + chartWidth + 70, y + 8);
        }

        y += 50;

        // Charts
        if (options.charts?.ratingDistribution) {
            try {
                doc.fontSize(12).font(this.getFont(true));
                doc.fillColor("#000000");
                doc.text(t.ratingDistribution, this.margin, y);
                doc.image(options.charts.ratingDistribution, this.margin, y + 18, {
                    width: chartWidth,
                    height: chartHeight,
                    fit: [chartWidth, chartHeight],
                });
            } catch {
                // Skip if image fails
            }
        }

        if (options.charts?.sentiment) {
            try {
                doc.fontSize(12).font(this.getFont(true));
                doc.text(t.sentimentAnalysis, this.margin + chartWidth + 20, y);
                doc.image(options.charts.sentiment, this.margin + chartWidth + 20, y + 18, {
                    width: chartWidth,
                    height: chartHeight,
                    fit: [chartWidth, chartHeight],
                });
            } catch {
                // Skip if image fails
            }
        }

        y += chartHeight + 50;

        // Review Analysis
        const reviewAnalysis = options.data.marketingAnalytics?.reviewAnalysis;
        if (reviewAnalysis) {
            doc.fontSize(14).font(this.getFont(true));
            doc.fillColor("#000000");
            doc.text(t.sentimentAnalysis, this.margin, y);
            y += 20;

            // Sentiment breakdown
            if (reviewAnalysis.sentiment) {
                doc.fontSize(11).font(this.getFont());
                doc.fillColor("#4CAF50");
                doc.text(`${t.positive}: ${reviewAnalysis.sentiment.positive}%`, this.margin, y);
                doc.fillColor("#9e9e9e");
                doc.text(`${t.neutral}: ${reviewAnalysis.sentiment.neutral}%`, this.margin + 120, y);
                doc.fillColor("#f44336");
                doc.text(`${t.negative}: ${reviewAnalysis.sentiment.negative}%`, this.margin + 230, y);
                y += 25;
            }

            // Common themes
            if (reviewAnalysis.commonThemes?.length) {
                doc.fillColor("#000000");
                doc.fontSize(12).font(this.getFont(true));
                doc.text(`${t.commonThemes}:`, this.margin, y);
                y += 18;

                doc.fontSize(10).font(this.getFont());
                for (const theme of reviewAnalysis.commonThemes) {
                    doc.text(`- ${theme}`, this.margin + 10, y, { width: this.contentWidth - 20 });
                    y = doc.y + 4;
                }
                y += 10;
            }

            // Actionable insights
            if (reviewAnalysis.actionableInsights?.length) {
                doc.fontSize(12).font(this.getFont(true));
                doc.text(`${t.actionableInsights}:`, this.margin, y);
                y += 18;

                doc.fontSize(10).font(this.getFont());
                for (const insight of reviewAnalysis.actionableInsights) {
                    doc.fillColor("#1565c0");
                    doc.text(`-> ${insight}`, this.margin + 10, y, { width: this.contentWidth - 20 });
                    y = doc.y + 4;
                }
            }
        }

        doc.fillColor("#000000");
    }

    /**
     * Add improvements page.
     */
    private addImprovementsPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;
        const suggestions = options.data.marketingAnalytics?.improvementSuggestions || [];
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.improvementSuggestions, this.margin, y);
        y += 40;

        for (const suggestion of suggestions) {
            // Check if we need a new page
            if (y > this.pageHeight - 150) {
                doc.addPage();
                y = this.margin;
            }

            // Priority badge
            const priorityColor =
                suggestion.priority === "high"
                    ? "#c62828"
                    : suggestion.priority === "medium"
                        ? "#f57c00"
                        : "#2e7d32";

            doc.fillColor(priorityColor);
            doc.rect(this.margin, y, 60, 20).fill();
            doc.fillColor("#ffffff");
            doc.fontSize(10).font(this.getFont(true));
            doc.text(suggestion.priority.toUpperCase(), this.margin + 5, y + 5);

            // Category
            doc.fillColor("#757575");
            doc.fontSize(10).font(this.getFont());
            doc.text(`[${suggestion.category}]`, this.margin + 70, y + 5);

            y += 25;

            // Title
            doc.fillColor("#000000");
            doc.fontSize(13).font(this.getFont(true));
            doc.text(suggestion.title, this.margin, y);
            y += 20;

            // Description
            doc.fontSize(11).font(this.getFont());
            doc.text(suggestion.description, this.margin + 10, y, {
                width: this.contentWidth - 10,
            });
            y = doc.y + 10;

            // Expected impact
            if (suggestion.expectedImpact) {
                doc.fillColor("#1565c0");
                doc.text(`${t.expectedImpact}: ${suggestion.expectedImpact}`, this.margin + 10, y, {
                    width: this.contentWidth - 10,
                });
                y = doc.y + 10;
            }

            doc.fillColor("#000000");
            y += 15;
        }
    }

    /**
     * Add competitive positioning page.
     *
     * 競合ポジショニング分析ページを追加。
     */
    private addCompetitivePositioningPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;
        const positioning = options.data.marketingAnalytics?.competitivePositioning;
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.competitivePositioning, this.margin, y);
        y += 35;

        // Market Position
        if (positioning?.marketPosition) {
            doc.fontSize(14).font(this.getFont(true));
            doc.fillColor("#1565c0");
            doc.text(t.marketPosition, this.margin, y);
            y += 20;

            doc.fontSize(11).font(this.getFont());
            doc.fillColor("#000000");
            doc.text(positioning.marketPosition, this.margin, y, {
                width: this.contentWidth,
            });
            y = doc.y + 25;
        }

        // Competitor Comparison
        if (positioning?.competitorComparison?.length) {
            doc.fontSize(14).font(this.getFont(true));
            doc.fillColor("#1565c0");
            doc.text(t.competitorComparison, this.margin, y);
            y += 25;

            for (const comp of positioning.competitorComparison) {
                // Check if we need a new page
                if (y > this.pageHeight - 200) {
                    doc.addPage();
                    y = this.margin;
                    doc.fontSize(16).font(this.getFont(true));
                    doc.fillColor("#000000");
                    doc.text(`${t.competitivePositioning} ${t.continued}`, this.margin, y);
                    y += 30;
                }

                // Competitor name header
                doc.fillColor("#ffffff");
                doc.rect(this.margin, y, this.contentWidth, 22).fill("#37474f");
                doc.fontSize(12).font(this.getFont(true));
                doc.fillColor("#ffffff");
                doc.text(`vs ${comp.competitor}`, this.margin + 10, y + 5);
                y += 28;

                const halfWidth = this.contentWidth / 2 - 10;
                const itemSpacing = 4;
                const headerHeight = 22;
                const boxPadding = 10;

                // Calculate heights for both sections first
                doc.fontSize(9).font(this.getFont());

                // Calculate Strengths heights
                const strengthHeights: number[] = [];
                let totalStrengthsHeight = headerHeight;
                for (const strength of (comp.ourStrengths || []).slice(0, 4)) {
                    const h = doc.heightOfString(`✓ ${strength}`, { width: halfWidth - 16 });
                    strengthHeights.push(h);
                    totalStrengthsHeight += h + itemSpacing;
                }
                totalStrengthsHeight += boxPadding;

                // Calculate Weaknesses heights (with extra right padding)
                const weaknessHeights: number[] = [];
                let totalWeaknessesHeight = headerHeight;
                for (const weakness of (comp.ourWeaknesses || []).slice(0, 4)) {
                    const h = doc.heightOfString(`△ ${weakness}`, { width: halfWidth - 24 });
                    weaknessHeights.push(h);
                    totalWeaknessesHeight += h + itemSpacing;
                }
                totalWeaknessesHeight += boxPadding;

                // Sync box heights (use the larger one)
                const boxHeight = Math.max(totalStrengthsHeight, totalWeaknessesHeight, 80);

                // Strengths (left side)
                if (comp.ourStrengths?.length) {
                    doc.fillColor("#e8f5e9");
                    doc.rect(this.margin, y, halfWidth, boxHeight).fill();

                    doc.fillColor("#1b5e20");
                    doc.fontSize(10).font(this.getFont(true));
                    doc.text(t.ourStrengths, this.margin + 8, y + 5);

                    doc.fontSize(9).font(this.getFont());
                    let sy = y + headerHeight;
                    let i = 0;
                    for (const strength of comp.ourStrengths.slice(0, 4)) {
                        doc.text(`✓ ${strength}`, this.margin + 8, sy, {
                            width: halfWidth - 16,
                        });
                        sy += strengthHeights[i] + itemSpacing;
                        i++;
                    }
                }

                // Weaknesses (right side)
                if (comp.ourWeaknesses?.length) {
                    doc.fillColor("#ffebee");
                    doc.rect(this.margin + halfWidth + 20, y, halfWidth, boxHeight).fill();

                    doc.fillColor("#b71c1c");
                    doc.fontSize(10).font(this.getFont(true));
                    doc.text(t.ourWeaknesses, this.margin + halfWidth + 28, y + 5);

                    doc.fontSize(9).font(this.getFont());
                    let wy = y + headerHeight;
                    let i = 0;
                    for (const weakness of comp.ourWeaknesses.slice(0, 4)) {
                        doc.text(`△ ${weakness}`, this.margin + halfWidth + 28, wy, {
                            width: halfWidth - 24,
                        });
                        wy += weaknessHeights[i] + itemSpacing;
                        i++;
                    }
                }

                y += boxHeight + 10;

                // Battle Strategy
                if (comp.battleStrategy) {
                    doc.fillColor("#e3f2fd");
                    doc.rect(this.margin, y, this.contentWidth, 45).fill();
                    doc.fillColor("#1565c0");
                    doc.fontSize(9).font(this.getFont(true));
                    doc.text(`${t.battleStrategy}:`, this.margin + 8, y + 5);
                    doc.fontSize(9).font(this.getFont());
                    doc.text(comp.battleStrategy, this.margin + 8, y + 18, {
                        width: this.contentWidth - 16,
                        height: 24,
                        ellipsis: true,
                    });
                    y += 55;
                }

                y += 15;
            }
        }

        // Check if we need a new page for remaining sections
        if (y > this.pageHeight - 150) {
            doc.addPage();
            y = this.margin;
        }

        // Differentiation Strategy
        if (positioning?.differentiationStrategy) {
            doc.fontSize(14).font(this.getFont(true));
            doc.fillColor("#1565c0");
            doc.text(t.differentiationStrategy, this.margin, y);
            y += 20;

            doc.fontSize(10).font(this.getFont());
            doc.fillColor("#000000");
            doc.text(positioning.differentiationStrategy, this.margin, y, {
                width: this.contentWidth,
            });
            y = doc.y + 25;
        }

        // Quick Wins
        if (positioning?.quickWins?.length) {
            doc.fontSize(14).font(this.getFont(true));
            doc.fillColor("#1565c0");
            doc.text(t.quickWins, this.margin, y);
            y += 20;

            doc.fontSize(10).font(this.getFont());
            for (const quickWin of positioning.quickWins) {
                doc.fillColor("#2e7d32");
                doc.text(`→ ${quickWin}`, this.margin + 10, y, { width: this.contentWidth - 20 });
                y = doc.y + 5;
            }
        }

        doc.fillColor("#000000");
    }

    /**
     * Add market opportunity priority page.
     *
     * 市場機会優先度分析ページを追加。
     */
    private addMarketOpportunityPriorityPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;
        const priority = options.data.marketingAnalytics?.marketOpportunityPriority;
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.marketOpportunityPriority, this.margin, y);
        y += 35;

        // Prioritized Opportunities
        if (priority?.prioritizedOpportunities?.length) {
            const fitScoreColors: Record<string, string> = {
                excellent: "#2e7d32",
                good: "#1565c0",
                moderate: "#f57c00",
                poor: "#c62828",
            };

            const effortLabels: Record<string, string> = {
                low: t.low,
                medium: t.medium,
                high: t.high,
            };

            for (const opp of priority.prioritizedOpportunities) {
                // Check if we need a new page
                if (y > this.pageHeight - 180) {
                    doc.addPage();
                    y = this.margin;
                    doc.fontSize(16).font(this.getFont(true));
                    doc.fillColor("#000000");
                    doc.text(`${t.marketOpportunityPriority} ${t.continued}`, this.margin, y);
                    y += 30;
                }

                const fitColor = fitScoreColors[opp.fitScore] || "#757575";

                // Opportunity header with fit score badge
                doc.fillColor(fitColor);
                doc.rect(this.margin, y, 70, 20).fill();
                doc.fillColor("#ffffff");
                doc.fontSize(9).font(this.getFont(true));
                doc.text(opp.fitScore.toUpperCase(), this.margin + 5, y + 5);

                // Effort badge
                doc.fillColor("#757575");
                doc.rect(this.margin + 75, y, 70, 20).fill();
                doc.fillColor("#ffffff");
                doc.fontSize(9).font(this.getFont());
                doc.text(`${t.effort}:${effortLabels[opp.estimatedEffort] || opp.estimatedEffort}`, this.margin + 80, y + 5, {
                    width: 60,
                    height: 12,
                    ellipsis: true,
                });

                y += 25;

                // Opportunity title
                doc.fillColor("#000000");
                doc.fontSize(13).font(this.getFont(true));
                doc.text(opp.opportunity, this.margin, y);
                y += 20;

                // Fit reason
                if (opp.fitReason) {
                    doc.fontSize(10).font(this.getFont());
                    doc.fillColor("#757575");
                    doc.text(`${t.reason}: ${opp.fitReason}`, this.margin + 10, y, {
                        width: this.contentWidth - 10,
                    });
                    y = doc.y + 10;
                }

                // Required changes
                if (opp.requiredChanges?.length) {
                    doc.fontSize(10).font(this.getFont(true));
                    doc.fillColor("#000000");
                    doc.text(`${t.requiredChanges}:`, this.margin + 10, y);
                    y += 15;

                    doc.fontSize(9).font(this.getFont());
                    for (const change of opp.requiredChanges.slice(0, 3)) {
                        doc.fillColor("#1565c0");
                        doc.text(`• ${change}`, this.margin + 20, y, { width: this.contentWidth - 30 });
                        y = doc.y + 3;
                    }
                    if (opp.requiredChanges.length > 3) {
                        doc.fillColor("#757575");
                        doc.text(`+ ${opp.requiredChanges.length - 3} more...`, this.margin + 20, y);
                        y = doc.y + 3;
                    }
                    y += 5;
                }

                // Recommended action
                if (opp.recommendedAction) {
                    doc.fillColor("#e8f5e9");
                    doc.rect(this.margin + 10, y, this.contentWidth - 20, 40).fill();
                    doc.fillColor("#1b5e20");
                    doc.fontSize(9).font(this.getFont(true));
                    doc.text(`${t.recommendedAction}:`, this.margin + 15, y + 5);
                    doc.fontSize(9).font(this.getFont());
                    doc.text(opp.recommendedAction, this.margin + 15, y + 17, {
                        width: this.contentWidth - 30,
                        height: 20,
                        ellipsis: true,
                    });
                    y += 50;
                }

                y += 15;
            }
        }

        // Check if we need a new page for strategic recommendation
        if (y > this.pageHeight - 100) {
            doc.addPage();
            y = this.margin;
        }

        // Strategic Recommendation
        if (priority?.strategicRecommendation) {
            doc.fontSize(14).font(this.getFont(true));
            doc.fillColor("#1565c0");
            doc.text(t.strategicRecommendations, this.margin, y);
            y += 20;

            doc.fillColor("#e3f2fd");
            doc.rect(this.margin, y, this.contentWidth, 80).fill();

            doc.fontSize(10).font(this.getFont());
            doc.fillColor("#0d47a1");
            doc.text(priority.strategicRecommendation, this.margin + 10, y + 10, {
                width: this.contentWidth - 20,
                height: 65,
                ellipsis: true,
            });
        }

        doc.fillColor("#000000");
    }

    /**
     * Add trend analysis page.
     */
    private addTrendAnalysisPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;
        const trendAnalysis = options.data.marketingAnalytics?.trendAnalysis;
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.trendAnalysisAndPredictions, this.margin, y);
        y += 35;

        // User Growth Trend
        if (trendAnalysis?.userGrowthTrend) {
            doc.fontSize(12).font(this.getFont(true));
            doc.text(t.userGrowth, this.margin, y);
            y += 18;

            doc.fontSize(10).font(this.getFont());
            doc.text(trendAnalysis.userGrowthTrend, this.margin, y, {
                width: this.contentWidth,
            });
            y = doc.y + 20;
        }

        // Engagement Trend
        if (trendAnalysis?.engagementTrend) {
            doc.fontSize(12).font(this.getFont(true));
            doc.text(t.engagement, this.margin, y);
            y += 18;

            doc.fontSize(10).font(this.getFont());
            doc.text(trendAnalysis.engagementTrend, this.margin, y, {
                width: this.contentWidth,
            });
            y = doc.y + 20;
        }

        // Rating Trend
        if (trendAnalysis?.ratingTrend) {
            doc.fontSize(12).font(this.getFont(true));
            doc.text(t.ratings, this.margin, y);
            y += 18;

            doc.fontSize(10).font(this.getFont());
            doc.text(trendAnalysis.ratingTrend, this.margin, y, {
                width: this.contentWidth,
            });
            y = doc.y + 30;
        }

        // Predictions
        if (trendAnalysis?.predictions?.length) {
            doc.fontSize(14).font(this.getFont(true));
            doc.text(t.predictions, this.margin, y);
            y += 22;

            doc.fontSize(10).font(this.getFont());
            for (const prediction of trendAnalysis.predictions) {
                doc.fillColor("#1565c0");
                doc.text(`-> ${prediction}`, this.margin + 10, y, { width: this.contentWidth - 20 });
                y = doc.y + 6;
            }

            doc.fillColor("#000000");
        }

        // Footer
        y = this.pageHeight - 80;
        doc.fontSize(9).font(this.getFont());
        doc.fillColor("#757575");
        doc.text(
            t.generatedBy,
            this.margin,
            y,
            { width: this.contentWidth, align: "center" }
        );
        doc.fillColor("#000000");
    }

    /**
     * Add GitHub-based code improvements page.
     *
     * GitHubベースのコード改善提案ページを追加。
     */
    private addGitHubImprovementsPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;
        const githubImprovements = options.data.githubImprovements;
        const improvements = githubImprovements?.improvements || [];
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.codebaseImprovements, this.margin, y);
        y += 25;

        // Repository info
        doc.fontSize(10).font(this.getFont());
        doc.fillColor("#757575");
        const repo = githubImprovements?.repository || "";
        const framework = githubImprovements?.framework || "";
        doc.text(`${t.repository}: ${repo} | ${t.framework}: ${framework}`, this.margin, y);
        y += 20;

        // Summary
        if (githubImprovements?.improvementSummary) {
            doc.fillColor("#000000");
            doc.fontSize(11).font(this.getFont());
            doc.text(githubImprovements.improvementSummary, this.margin, y, {
                width: this.contentWidth,
            });
            y = doc.y + 25;
        }

        // Each improvement
        for (const improvement of improvements) {
            // Check if we need a new page
            if (y > this.pageHeight - 200) {
                doc.addPage();
                y = this.margin;
                doc.fontSize(16).font(this.getFont(true));
                doc.fillColor("#000000");
                doc.text(`${t.codebaseImprovements} ${t.continued}`, this.margin, y);
                y += 30;
            }

            // Priority badge
            const priorityColor =
                improvement.priority === "high"
                    ? "#c62828"
                    : improvement.priority === "medium"
                        ? "#f57c00"
                        : "#2e7d32";

            doc.fillColor(priorityColor);
            doc.rect(this.margin, y, 60, 18).fill();
            doc.fillColor("#ffffff");
            doc.fontSize(9).font(this.getFont(true));
            doc.text(improvement.priority?.toUpperCase() || "MEDIUM", this.margin + 5, y + 4);

            // Category badge
            doc.fillColor("#1565c0");
            doc.rect(this.margin + 65, y, 80, 18).fill();
            doc.fillColor("#ffffff");
            doc.fontSize(9).font(this.getFont());
            doc.text(improvement.category || "", this.margin + 70, y + 4);

            y += 25;

            // Title
            doc.fillColor("#000000");
            doc.fontSize(13).font(this.getFont(true));
            doc.text(improvement.title || "", this.margin, y);
            y += 20;

            // Description
            doc.fontSize(10).font(this.getFont());
            doc.text(improvement.description || "", this.margin + 10, y, {
                width: this.contentWidth - 10,
            });
            y = doc.y + 10;

            // Related Feature
            if (improvement.relatedFeature) {
                doc.fillColor("#6a1b9a");
                doc.fontSize(9).font(this.getFont());
                doc.text(`${t.relatedFeature}: ${improvement.relatedFeature}`, this.margin + 10, y);
                y = doc.y + 8;
            }

            // Code References
            const codeRefs = improvement.codeReferences || [];
            if (codeRefs.length > 0) {
                doc.fillColor("#000000");
                doc.fontSize(10).font(this.getFont(true));
                doc.text(`${t.fileModifications}:`, this.margin + 10, y);
                y += 15;

                for (const ref of codeRefs) {
                    // Check page break
                    if (y > this.pageHeight - 100) {
                        doc.addPage();
                        y = this.margin;
                        doc.fontSize(16).font(this.getFont(true));
                        doc.fillColor("#000000");
                        doc.text(`${t.codebaseImprovements} ${t.continued}`, this.margin, y);
                        y += 30;
                    }

                    // Modification type icon
                    const modIcon: Record<string, string> = {
                        add: "+",
                        modify: "~",
                        refactor: "R",
                        optimize: "O",
                    };
                    const modColor: Record<string, string> = {
                        add: "#2e7d32",
                        modify: "#f57c00",
                        refactor: "#1565c0",
                        optimize: "#6a1b9a",
                    };

                    const icon = modIcon[ref.modificationType] || "?";
                    const color = modColor[ref.modificationType] || "#757575";

                    // Modification type badge
                    doc.fillColor(color);
                    doc.roundedRect(this.margin + 15, y, 20, 16, 2).fill();
                    doc.fillColor("#ffffff");
                    doc.fontSize(9).font(this.getFont(true));
                    doc.text(icon, this.margin + 21, y + 3);

                    // File path
                    doc.fillColor("#1565c0");
                    doc.fontSize(9).font(this.getFont());
                    doc.text(ref.filePath || "", this.margin + 40, y + 3, {
                        width: this.contentWidth - 50,
                    });
                    y += 18;

                    // Current functionality
                    doc.fillColor("#757575");
                    doc.fontSize(8).font(this.getFont());
                    doc.text(`${t.current}: ${ref.currentFunctionality || ""}`, this.margin + 40, y, {
                        width: this.contentWidth - 50,
                    });
                    y = doc.y + 3;

                    // Proposed change
                    doc.fillColor("#2e7d32");
                    doc.text(`${t.proposed}: ${ref.proposedChange || ""}`, this.margin + 40, y, {
                        width: this.contentWidth - 50,
                    });
                    y = doc.y + 8;
                }
            }

            // Expected Impact
            if (improvement.expectedImpact) {
                doc.fillColor("#1565c0");
                doc.fontSize(9).font(this.getFont());
                doc.text(`${t.expectedImpact}: ${improvement.expectedImpact}`, this.margin + 10, y);
                y = doc.y + 5;
            }

            doc.fillColor("#000000");
            y += 20;
        }
    }
}
