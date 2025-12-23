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
import { PDFInputData, PDFGenerationOptions, GeneratedCharts, PDFStyleOptions } from "../models";
import {
    getTranslations,
    getFontFamily,
    MarketingTranslations,
    FontFamily,
} from "../locales";

// Re-export types for backward compatibility
export { PDFInputData, PDFGenerationOptions, GeneratedCharts, PDFStyleOptions };

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
 * Color scheme configuration for PDF styling.
 */
interface ColorScheme {
    background: string;
    text: string;
    textSecondary: string;
    primary: string;
    primaryLight: string;
    success: string;
    successLight: string;
    successDark: string;
    error: string;
    errorLight: string;
    errorDark: string;
    warning: string;
    neutral: string;
    googlePlay: string;
    appStore: string;
    boxBackground: string;
    summaryBackground: string;
    highlightBackground: string;
    concernBackground: string;
    competitorHeader: string;
}

/**
 * Light color scheme (default).
 */
const LIGHT_SCHEME: ColorScheme = {
    background: "#ffffff",
    text: "#000000",
    textSecondary: "#757575",
    primary: "#1565c0",
    primaryLight: "#e3f2fd",
    success: "#2e7d32",
    successLight: "#e8f5e9",
    successDark: "#1b5e20",
    error: "#c62828",
    errorLight: "#ffebee",
    errorDark: "#b71c1c",
    warning: "#f57c00",
    neutral: "#757575",
    googlePlay: "#4CAF50",
    appStore: "#007AFF",
    boxBackground: "#f5f5f5",
    summaryBackground: "#e3f2fd",
    highlightBackground: "#e8f5e9",
    concernBackground: "#ffebee",
    competitorHeader: "#37474f",
};

/**
 * Dark color scheme.
 */
const DARK_SCHEME: ColorScheme = {
    background: "#212121",
    text: "#ffffff",
    textSecondary: "#b0b0b0",
    primary: "#64b5f6",
    primaryLight: "#1e3a5f",
    success: "#81c784",
    successLight: "#1b3d1e",
    successDark: "#4caf50",
    error: "#ef5350",
    errorLight: "#3d1b1b",
    errorDark: "#f44336",
    warning: "#ffb74d",
    neutral: "#9e9e9e",
    googlePlay: "#66bb6a",
    appStore: "#42a5f5",
    boxBackground: "#1e1e1e",
    summaryBackground: "#1e3a5f",
    highlightBackground: "#1b3d1e",
    concernBackground: "#3d1b1b",
    competitorHeader: "#263238",
};

/**
 * PDF Service for generating marketing reports.
 */
export class PDFService {
    private readonly pageWidth = 595.28; // A4 width in points
    private readonly pageHeight = 841.89; // A4 height in points
    private readonly margin = 50;
    private readonly headerHeight = 45; // Header height in points
    private readonly footerHeight = 30; // Footer height in points
    private readonly contentWidth: number;
    private readonly maxContentY: number; // Maximum Y position for content (before footer)
    private fontDir: string;
    private registeredFonts: Set<string> = new Set();
    private currentFontFamily: FontFamily = "Helvetica";
    private translations: MarketingTranslations;
    private colors: ColorScheme = LIGHT_SCHEME;
    private styleOptions: PDFStyleOptions = {};
    private headerIconBuffer: Buffer | null = null;

    constructor() {
        this.contentWidth = this.pageWidth - this.margin * 2;
        // Maximum Y for content: page height - bottom margin - footer height
        this.maxContentY = this.pageHeight - this.margin - this.footerHeight;
        // Default font directory: assets/fonts relative to package root
        this.fontDir = path.join(__dirname, "..", "..", "assets", "fonts");
        // Default to English translations
        this.translations = getTranslations("en");
    }

    /**
     * Download image from URL and return as Buffer.
     */
    private async downloadImage(url: string): Promise<Buffer | null> {
        try {
            // Convert GitHub blob URL to raw URL
            let rawUrl = url;
            if (url.includes("github.com") && url.includes("/blob/")) {
                rawUrl = url
                    .replace("github.com", "raw.githubusercontent.com")
                    .replace("/blob/", "/");
            }

            const response = await fetch(rawUrl);
            if (!response.ok) {
                console.warn(`Failed to download image from ${rawUrl}: ${response.status}`);
                return null;
            }
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (error) {
            console.warn(`Error downloading image from ${url}:`, error);
            return null;
        }
    }

    /**
     * Draw page background for dark mode.
     */
    private drawPageBackground(doc: PDFKit.PDFDocument): void {
        if (this.styleOptions.colorScheme === "dark") {
            doc.save();
            doc.rect(0, 0, this.pageWidth, this.pageHeight).fill(this.colors.background);
            doc.restore();
        }
    }

    /**
     * Draw page header with icon and organization title.
     */
    private drawPageHeader(doc: PDFKit.PDFDocument): number {
        let y = this.margin;

        // Only draw header if we have icon or organization title
        if (!this.headerIconBuffer && !this.styleOptions.organizationTitle) {
            return y;
        }

        // Draw icon on the left
        if (this.headerIconBuffer) {
            try {
                const iconSize = 28;
                doc.image(this.headerIconBuffer, this.margin, y, {
                    width: iconSize,
                    height: iconSize,
                    fit: [iconSize, iconSize],
                });
            } catch (error) {
                console.warn("Failed to draw header icon:", error);
            }
        }

        // Draw organization title on the right
        if (this.styleOptions.organizationTitle) {
            doc.fontSize(11).font(this.getFont(true));
            doc.fillColor(this.colors.text);
            doc.text(
                this.styleOptions.organizationTitle,
                this.margin,
                y + 8,
                { width: this.contentWidth, align: "right" }
            );
        }

        return y + this.headerHeight;
    }

    /**
     * Draw page footer with copyright.
     * Uses direct graphics commands to avoid auto-pagination.
     */
    private drawPageFooter(doc: PDFKit.PDFDocument): void {
        if (!this.styleOptions.copyright) {
            return;
        }

        const footerText = `© ${new Date().getFullYear()} ${this.styleOptions.copyright}`;
        const footerY = this.pageHeight - this.footerHeight;
        const fontSize = 8;

        // Save current position
        const savedY = doc.y;

        // Set font and color
        doc.fontSize(fontSize).font(this.getFont());
        doc.fillColor(this.colors.textSecondary);

        // Calculate text width for centering
        const textWidth = doc.widthOfString(footerText);
        const centerX = this.margin + (this.contentWidth - textWidth) / 2;

        // Use save/restore and direct positioning to avoid auto-pagination
        doc.save();

        // Draw text using _fragment or simpleText approach
        // Move to position and draw without triggering pagination
        (doc as any)._fragment(footerText, centerX, footerY, {
            lineBreak: false,
            textWidth: textWidth,
            wordSpacing: 0,
            characterSpacing: 0,
        });

        doc.restore();

        // Restore Y position to prevent state pollution
        doc.y = savedY;
    }

    /**
     * Initialize a new page with background, header, and return starting Y position.
     * When isNewPage is true, draws footer on current page before adding new page.
     */
    private initPage(doc: PDFKit.PDFDocument, isNewPage: boolean = false): number {
        if (isNewPage) {
            // Draw footer on current page before creating new page
            this.drawPageFooter(doc);
            doc.addPage();
        }
        this.drawPageBackground(doc);
        const y = this.drawPageHeader(doc);
        return y;
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
        // Initialize style options
        this.styleOptions = options.style || {};
        this.colors = this.styleOptions.colorScheme === "dark" ? DARK_SCHEME : LIGHT_SCHEME;

        // Download header icon if specified
        if (this.styleOptions.headerIconUrl) {
            this.headerIconBuffer = await this.downloadImage(this.styleOptions.headerIconUrl);
        } else {
            this.headerIconBuffer = null;
        }

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

                // Draw background for first page (cover page)
                this.drawPageBackground(doc);

                // Cover page
                this.addCoverPage(doc, options, appName);

                // Executive Summary page
                if (options.data.marketingAnalytics?.overallAnalysis) {
                    const summaryY = this.initPage(doc, true);
                    this.addSummaryPage(doc, options, summaryY);

                    // Highlights & Concerns page (separate page to avoid overflow)
                    const analysis = options.data.marketingAnalytics.overallAnalysis;
                    if ((analysis.highlights?.length || 0) > 0 || (analysis.concerns?.length || 0) > 0) {
                        const highlightsY = this.initPage(doc, true);
                        this.addHighlightsConcernsPage(doc, options, highlightsY);
                    }
                }

                // User Analytics page
                if (options.data.firebaseAnalytics) {
                    const analyticsY = this.initPage(doc, true);
                    this.addUserAnalyticsPage(doc, options, analyticsY);
                }

                // Ratings & Reviews page
                if (options.data.googlePlayConsole || options.data.appStore || options.data.marketingAnalytics?.reviewAnalysis) {
                    const ratingsY = this.initPage(doc, true);
                    this.addRatingsReviewsPage(doc, options, ratingsY);
                }

                // Competitive Positioning page (market research data)
                if (options.data.marketingAnalytics?.competitivePositioning) {
                    const competitiveY = this.initPage(doc, true);
                    this.addCompetitivePositioningPage(doc, options, competitiveY);
                }

                // Market Opportunity Priority page (market research data)
                if (options.data.marketingAnalytics?.marketOpportunityPriority) {
                    const opportunityY = this.initPage(doc, true);
                    this.addMarketOpportunityPriorityPage(doc, options, opportunityY);
                }

                // Trend Analysis page
                if (options.data.marketingAnalytics?.trendAnalysis) {
                    const trendY = this.initPage(doc, true);
                    this.addTrendAnalysisPage(doc, options, trendY);
                }

                // Improvement Suggestions page
                if (options.data.marketingAnalytics?.improvementSuggestions?.length) {
                    const improvementsY = this.initPage(doc, true);
                    this.addImprovementsPage(doc, options, improvementsY);
                }

                // GitHub-based Code Improvements page(s)
                if (options.data.githubImprovements?.improvements?.length) {
                    const githubY = this.initPage(doc, true);
                    this.addGitHubImprovementsPage(doc, options, githubY);
                }

                // Draw footer on the last page
                this.drawPageFooter(doc);

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
        doc.fillColor(this.colors.text);
        doc.text(appName, this.margin, y, {
            width: this.contentWidth,
            align: "center",
        });
        y += 60;

        // Report type
        doc.fontSize(20).font(this.getFont());
        doc.fillColor(this.colors.text);
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
            doc.fillColor(this.colors.text);
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
        doc.fillColor(this.colors.text);
        doc.text(
            `${t.generated}: ${new Date().toISOString().split("T")[0]}`,
            this.margin,
            y,
            { width: this.contentWidth, align: "center" }
        );

        // Data sources at the bottom
        y = this.pageHeight - 150;
        doc.fontSize(10).font(this.getFont());
        doc.fillColor(this.colors.textSecondary);

        const sources: string[] = [];
        if (options.data.googlePlayConsole) sources.push("Google Play");
        if (options.data.appStore) sources.push("App Store");
        if (options.data.firebaseAnalytics) sources.push("Firebase Analytics");
        if (options.data.marketingAnalytics) sources.push(t.aiAnalysis);

        doc.text(`${t.dataSources}: ${sources.join(" | ")}`, this.margin, y, {
            width: this.contentWidth,
            align: "center",
        });

        doc.fillColor(this.colors.text);
    }

    /**
     * Add summary page with AI analysis.
     */
    private addSummaryPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions,
        startY: number = this.margin
    ): void {
        let y = startY;
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
                doc.fillColor(this.colors.boxBackground);
                doc.rect(x + 2, y, metricBoxWidth - 4, 50).fill();

                // Metric title
                doc.fillColor(this.colors.primary);
                doc.fontSize(9).font(this.getFont(true));
                doc.text(metric.metric, x + 8, y + 8, {
                    width: metricBoxWidth - 16,
                });

                // Trend indicator and value
                const trendColor =
                    metric.trend === "up" ? this.colors.success : metric.trend === "down" ? this.colors.error : this.colors.textSecondary;
                const trendIcon = metric.trend === "up" ? "+" : metric.trend === "down" ? "-" : "~";
                doc.fillColor(trendColor);
                doc.fontSize(13).font(this.getFont(true));
                doc.text(`${metric.value} ${trendIcon}`, x + 8, y + 28, {
                    width: metricBoxWidth - 16,
                });
            }

            y += 70;
        }

        doc.fillColor(this.colors.text);
    }

    /**
     * Add highlights and concerns page.
     * This page displays highlights and concerns in a 2-column layout.
     * Dynamically calculates item height and adds pages as needed.
     */
    private addHighlightsConcernsPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions,
        startY: number = this.margin
    ): void {
        let y = startY;
        const analysis = options.data.marketingAnalytics?.overallAnalysis;
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.highlightsAndConcerns, this.margin, y);
        y += 40;

        const halfWidth = this.contentWidth / 2 - 15;
        const boxPadding = 16; // Padding inside boxes
        const itemSpacing = 10; // Space between items

        // Get all items
        const highlights = analysis?.highlights || [];
        const concerns = analysis?.concerns || [];

        // Headers
        doc.fontSize(14).font(this.getFont(true));
        doc.fillColor(this.colors.successDark);
        doc.text(t.highlights, this.margin, y);
        doc.fillColor(this.colors.errorDark);
        doc.text(t.concerns, this.margin + halfWidth + 30, y);
        y += 25;

        // Calculate heights for each item pair
        doc.fontSize(10).font(this.getFont());
        const maxItems = Math.max(highlights.length, concerns.length);

        for (let i = 0; i < maxItems; i++) {
            const highlightText = i < highlights.length ? highlights[i] : "";
            const concernText = i < concerns.length ? concerns[i] : "";

            // Calculate actual text heights
            const highlightHeight = highlightText
                ? doc.heightOfString(highlightText, { width: halfWidth - boxPadding }) + boxPadding
                : 0;
            const concernHeight = concernText
                ? doc.heightOfString(concernText, { width: halfWidth - boxPadding }) + boxPadding
                : 0;

            // Use the larger height for this row
            const rowHeight = Math.max(highlightHeight, concernHeight, 40);

            // Check if we need a new page
            if (y + rowHeight > this.maxContentY) {
                this.drawPageFooter(doc);
                doc.addPage();
                this.drawPageBackground(doc);
                y = this.drawPageHeader(doc);

                // Re-add headers on new page
                doc.fontSize(16).font(this.getFont(true));
                doc.fillColor(this.colors.text);
                doc.text(`${t.highlightsAndConcerns} ${t.continued}`, this.margin, y);
                y += 30;

                doc.fontSize(14).font(this.getFont(true));
                doc.fillColor(this.colors.successDark);
                doc.text(t.highlights, this.margin, y);
                doc.fillColor(this.colors.errorDark);
                doc.text(t.concerns, this.margin + halfWidth + 30, y);
                y += 25;
            }

            // Draw highlight item
            if (highlightText) {
                doc.fillColor(this.colors.highlightBackground);
                doc.roundedRect(this.margin, y, halfWidth, rowHeight, 4).fill();
                doc.fillColor(this.colors.successDark);
                doc.fontSize(10).font(this.getFont());
                doc.text(highlightText, this.margin + 8, y + 8, {
                    width: halfWidth - boxPadding,
                });
            }

            // Draw concern item
            if (concernText) {
                doc.fillColor(this.colors.concernBackground);
                doc.roundedRect(this.margin + halfWidth + 30, y, halfWidth, rowHeight, 4).fill();
                doc.fillColor(this.colors.errorDark);
                doc.fontSize(10).font(this.getFont());
                doc.text(concernText, this.margin + halfWidth + 38, y + 8, {
                    width: halfWidth - boxPadding,
                });
            }

            y += rowHeight + itemSpacing;
        }

        doc.fillColor(this.colors.text);
    }

    /**
     * Add user analytics page.
     */
    private addUserAnalyticsPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions,
        startY: number = this.margin
    ): void {
        let y = startY;
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

            doc.fillColor(this.colors.primary);
            doc.fontSize(14).font(this.getFont(true));
            doc.text(`DAU: ${dau}  |  WAU: ${wau}  |  MAU: ${mau}  |  ${t.newUsers}: ${newUsersVal}`, this.margin, y);
            doc.fillColor(this.colors.text);
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
        options: PDFGenerationOptions,
        startY: number = this.margin
    ): void {
        let y = startY;
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
            doc.fillColor(this.colors.googlePlay);
            doc.fontSize(24).font(this.getFont(true));
            doc.text(`${googlePlay.averageRating.toFixed(1)}`, this.margin, y);
            doc.fillColor(this.colors.text);
            doc.fontSize(11).font(this.getFont());
            doc.text(`Google Play (${googlePlay.totalRatings?.toLocaleString() || 0} ratings)`, this.margin + 50, y + 8);
        }

        if (appStore?.averageRating) {
            doc.fillColor(this.colors.appStore);
            doc.fontSize(24).font(this.getFont(true));
            doc.text(`${appStore.averageRating.toFixed(1)}`, this.margin + chartWidth + 20, y);
            doc.fillColor(this.colors.text);
            doc.fontSize(11).font(this.getFont());
            doc.text(`App Store (${appStore.totalRatings?.toLocaleString() || 0} ratings)`, this.margin + chartWidth + 70, y + 8);
        }

        y += 50;

        // Charts
        if (options.charts?.ratingDistribution) {
            try {
                doc.fontSize(12).font(this.getFont(true));
                doc.fillColor(this.colors.text);
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
            doc.fillColor(this.colors.text);
            doc.text(t.sentimentAnalysis, this.margin, y);
            y += 20;

            // Sentiment breakdown
            if (reviewAnalysis.sentiment) {
                doc.fontSize(11).font(this.getFont());
                doc.fillColor(this.colors.googlePlay);
                doc.text(`${t.positive}: ${reviewAnalysis.sentiment.positive}%`, this.margin, y);
                doc.fillColor(this.colors.neutral);
                doc.text(`${t.neutral}: ${reviewAnalysis.sentiment.neutral}%`, this.margin + 120, y);
                doc.fillColor(this.colors.error);
                doc.text(`${t.negative}: ${reviewAnalysis.sentiment.negative}%`, this.margin + 230, y);
                y += 25;
            }

            // Common themes
            if (reviewAnalysis.commonThemes?.length) {
                doc.fillColor(this.colors.text);
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
                    doc.fillColor(this.colors.primary);
                    doc.text(`-> ${insight}`, this.margin + 10, y, { width: this.contentWidth - 20 });
                    y = doc.y + 4;
                }
            }
        }

        doc.fillColor(this.colors.text);
    }

    /**
     * Add improvements page.
     */
    private addImprovementsPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions,
        startY: number = this.margin
    ): void {
        let y = startY;
        const suggestions = options.data.marketingAnalytics?.improvementSuggestions || [];
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.improvementSuggestions, this.margin, y);
        y += 40;

        for (const suggestion of suggestions) {
            // Check if we need a new page
            if (y > this.maxContentY - 100) {
                this.drawPageFooter(doc);
                doc.addPage();
                this.drawPageBackground(doc);
                y = this.drawPageHeader(doc);
            }

            // Priority badge
            const priorityColor =
                suggestion.priority === "high"
                    ? this.colors.error
                    : suggestion.priority === "medium"
                        ? this.colors.warning
                        : this.colors.success;

            doc.fillColor(priorityColor);
            doc.rect(this.margin, y, 60, 20).fill();
            doc.fillColor("#ffffff");
            doc.fontSize(10).font(this.getFont(true));
            doc.text(suggestion.priority.toUpperCase(), this.margin + 5, y + 5);

            // Category
            doc.fillColor(this.colors.textSecondary);
            doc.fontSize(10).font(this.getFont());
            doc.text(`[${suggestion.category}]`, this.margin + 70, y + 5);

            y += 25;

            // Title
            doc.fillColor(this.colors.text);
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
                doc.fillColor(this.colors.primary);
                doc.text(`${t.expectedImpact}: ${suggestion.expectedImpact}`, this.margin + 10, y, {
                    width: this.contentWidth - 10,
                });
                y = doc.y + 10;
            }

            doc.fillColor(this.colors.text);
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
        options: PDFGenerationOptions,
        startY: number = this.margin
    ): void {
        let y = startY;
        const positioning = options.data.marketingAnalytics?.competitivePositioning;
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.competitivePositioning, this.margin, y);
        y += 35;

        // Market Position
        if (positioning?.marketPosition) {
            doc.fontSize(14).font(this.getFont(true));
            doc.fillColor(this.colors.primary);
            doc.text(t.marketPosition, this.margin, y);
            y += 20;

            doc.fontSize(11).font(this.getFont());
            doc.fillColor(this.colors.text);
            doc.text(positioning.marketPosition, this.margin, y, {
                width: this.contentWidth,
            });
            y = doc.y + 25;
        }

        // Competitor Comparison
        if (positioning?.competitorComparison?.length) {
            doc.fontSize(14).font(this.getFont(true));
            doc.fillColor(this.colors.primary);
            doc.text(t.competitorComparison, this.margin, y);
            y += 25;

            for (const comp of positioning.competitorComparison) {
                // Check if we need a new page
                if (y > this.maxContentY - 150) {
                    this.drawPageFooter(doc);
                    doc.addPage();
                    this.drawPageBackground(doc);
                    y = this.drawPageHeader(doc);
                    doc.fontSize(16).font(this.getFont(true));
                    doc.fillColor(this.colors.text);
                    doc.text(`${t.competitivePositioning} ${t.continued}`, this.margin, y);
                    y += 30;
                }

                // Competitor name header
                doc.fillColor("#ffffff");
                doc.rect(this.margin, y, this.contentWidth, 22).fill(this.colors.competitorHeader);
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
                    doc.fillColor(this.colors.highlightBackground);
                    doc.rect(this.margin, y, halfWidth, boxHeight).fill();

                    doc.fillColor(this.colors.successDark);
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
                    doc.fillColor(this.colors.concernBackground);
                    doc.rect(this.margin + halfWidth + 20, y, halfWidth, boxHeight).fill();

                    doc.fillColor(this.colors.errorDark);
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
                    doc.fillColor(this.colors.summaryBackground);
                    doc.rect(this.margin, y, this.contentWidth, 45).fill();
                    doc.fillColor(this.colors.primary);
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
        if (y > this.maxContentY - 100) {
            this.drawPageFooter(doc);
            doc.addPage();
            this.drawPageBackground(doc);
            y = this.drawPageHeader(doc);
        }

        // Differentiation Strategy
        if (positioning?.differentiationStrategy) {
            doc.fontSize(14).font(this.getFont(true));
            doc.fillColor(this.colors.primary);
            doc.text(t.differentiationStrategy, this.margin, y);
            y += 20;

            doc.fontSize(10).font(this.getFont());
            doc.fillColor(this.colors.text);
            doc.text(positioning.differentiationStrategy, this.margin, y, {
                width: this.contentWidth,
            });
            y = doc.y + 25;
        }

        // Quick Wins
        if (positioning?.quickWins?.length) {
            doc.fontSize(14).font(this.getFont(true));
            doc.fillColor(this.colors.primary);
            doc.text(t.quickWins, this.margin, y);
            y += 20;

            doc.fontSize(10).font(this.getFont());
            for (const quickWin of positioning.quickWins) {
                doc.fillColor(this.colors.success);
                doc.text(`→ ${quickWin}`, this.margin + 10, y, { width: this.contentWidth - 20 });
                y = doc.y + 5;
            }
        }

        doc.fillColor(this.colors.text);
    }

    /**
     * Add market opportunity priority page.
     *
     * 市場機会優先度分析ページを追加。
     */
    private addMarketOpportunityPriorityPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions,
        startY: number = this.margin
    ): void {
        let y = startY;
        const priority = options.data.marketingAnalytics?.marketOpportunityPriority;
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.marketOpportunityPriority, this.margin, y);
        y += 35;

        // Prioritized Opportunities
        if (priority?.prioritizedOpportunities?.length) {
            const fitScoreColors: Record<string, string> = {
                excellent: this.colors.success,
                good: this.colors.primary,
                moderate: this.colors.warning,
                poor: this.colors.error,
            };

            const effortLabels: Record<string, string> = {
                low: t.low,
                medium: t.medium,
                high: t.high,
            };

            for (const opp of priority.prioritizedOpportunities) {
                // Check if we need a new page
                if (y > this.maxContentY - 130) {
                    this.drawPageFooter(doc);
                    doc.addPage();
                    this.drawPageBackground(doc);
                    y = this.drawPageHeader(doc);
                    doc.fontSize(16).font(this.getFont(true));
                    doc.fillColor(this.colors.text);
                    doc.text(`${t.marketOpportunityPriority} ${t.continued}`, this.margin, y);
                    y += 30;
                }

                const fitColor = fitScoreColors[opp.fitScore] || this.colors.textSecondary;

                // Opportunity header with fit score badge
                doc.fillColor(fitColor);
                doc.rect(this.margin, y, 70, 20).fill();
                doc.fillColor("#ffffff");
                doc.fontSize(9).font(this.getFont(true));
                doc.text(opp.fitScore.toUpperCase(), this.margin + 5, y + 5);

                // Effort badge
                doc.fillColor(this.colors.textSecondary);
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
                doc.fillColor(this.colors.text);
                doc.fontSize(13).font(this.getFont(true));
                doc.text(opp.opportunity, this.margin, y);
                y += 20;

                // Fit reason
                if (opp.fitReason) {
                    doc.fontSize(10).font(this.getFont());
                    doc.fillColor(this.colors.textSecondary);
                    doc.text(`${t.reason}: ${opp.fitReason}`, this.margin + 10, y, {
                        width: this.contentWidth - 10,
                    });
                    y = doc.y + 10;
                }

                // Required changes
                if (opp.requiredChanges?.length) {
                    doc.fontSize(10).font(this.getFont(true));
                    doc.fillColor(this.colors.text);
                    doc.text(`${t.requiredChanges}:`, this.margin + 10, y);
                    y += 15;

                    doc.fontSize(9).font(this.getFont());
                    for (const change of opp.requiredChanges.slice(0, 3)) {
                        doc.fillColor(this.colors.primary);
                        doc.text(`• ${change}`, this.margin + 20, y, { width: this.contentWidth - 30 });
                        y = doc.y + 3;
                    }
                    if (opp.requiredChanges.length > 3) {
                        doc.fillColor(this.colors.textSecondary);
                        doc.text(`+ ${opp.requiredChanges.length - 3} more...`, this.margin + 20, y);
                        y = doc.y + 3;
                    }
                    y += 5;
                }

                // Recommended action
                if (opp.recommendedAction) {
                    doc.fillColor(this.colors.highlightBackground);
                    doc.rect(this.margin + 10, y, this.contentWidth - 20, 40).fill();
                    doc.fillColor(this.colors.successDark);
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
        if (y > this.maxContentY - 50) {
            this.drawPageFooter(doc);
            doc.addPage();
            this.drawPageBackground(doc);
            y = this.drawPageHeader(doc);
        }

        // Strategic Recommendation
        if (priority?.strategicRecommendation) {
            doc.fontSize(14).font(this.getFont(true));
            doc.fillColor(this.colors.primary);
            doc.text(t.strategicRecommendations, this.margin, y);
            y += 20;

            doc.fillColor(this.colors.summaryBackground);
            doc.rect(this.margin, y, this.contentWidth, 80).fill();

            doc.fontSize(10).font(this.getFont());
            doc.fillColor(this.colors.primary);
            doc.text(priority.strategicRecommendation, this.margin + 10, y + 10, {
                width: this.contentWidth - 20,
                height: 65,
                ellipsis: true,
            });
        }

        doc.fillColor(this.colors.text);
    }

    /**
     * Add trend analysis page.
     */
    private addTrendAnalysisPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions,
        startY: number = this.margin
    ): void {
        let y = startY;
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
                doc.fillColor(this.colors.primary);
                doc.text(`-> ${prediction}`, this.margin + 10, y, { width: this.contentWidth - 20 });
                y = doc.y + 6;
            }

            doc.fillColor(this.colors.text);
        }
    }

    /**
     * Add GitHub-based code improvements page.
     *
     * GitHubベースのコード改善提案ページを追加。
     */
    private addGitHubImprovementsPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions,
        startY: number = this.margin
    ): void {
        let y = startY;
        const githubImprovements = options.data.githubImprovements;
        const improvements = githubImprovements?.improvements || [];
        const t = this.translations;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text(t.codebaseImprovements, this.margin, y);
        y += 25;

        // Repository info
        doc.fontSize(10).font(this.getFont());
        doc.fillColor(this.colors.textSecondary);
        const repo = githubImprovements?.repository || "";
        const framework = githubImprovements?.framework || "";
        doc.text(`${t.repository}: ${repo} | ${t.framework}: ${framework}`, this.margin, y);
        y += 20;

        // Summary
        if (githubImprovements?.improvementSummary) {
            doc.fillColor(this.colors.text);
            doc.fontSize(11).font(this.getFont());
            doc.text(githubImprovements.improvementSummary, this.margin, y, {
                width: this.contentWidth,
            });
            y = doc.y + 25;
        }

        // Each improvement
        for (const improvement of improvements) {
            // Check if we need a new page
            if (y > this.maxContentY - 150) {
                this.drawPageFooter(doc);
                doc.addPage();
                this.drawPageBackground(doc);
                y = this.drawPageHeader(doc);
                doc.fontSize(16).font(this.getFont(true));
                doc.fillColor(this.colors.text);
                doc.text(`${t.codebaseImprovements} ${t.continued}`, this.margin, y);
                y += 30;
            }

            // Priority badge
            const priorityColor =
                improvement.priority === "high"
                    ? this.colors.error
                    : improvement.priority === "medium"
                        ? this.colors.warning
                        : this.colors.success;

            doc.fillColor(priorityColor);
            doc.rect(this.margin, y, 60, 18).fill();
            doc.fillColor("#ffffff");
            doc.fontSize(9).font(this.getFont(true));
            doc.text(improvement.priority?.toUpperCase() || "MEDIUM", this.margin + 5, y + 4);

            // Category badge
            doc.fillColor(this.colors.primary);
            doc.rect(this.margin + 65, y, 80, 18).fill();
            doc.fillColor("#ffffff");
            doc.fontSize(9).font(this.getFont());
            doc.text(improvement.category || "", this.margin + 70, y + 4);

            y += 25;

            // Title
            doc.fillColor(this.colors.text);
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
                doc.fillColor(this.colors.text);
                doc.fontSize(10).font(this.getFont(true));
                doc.text(`${t.fileModifications}:`, this.margin + 10, y);
                y += 15;

                for (const ref of codeRefs) {
                    // Check page break
                    if (y > this.maxContentY - 50) {
                        this.drawPageFooter(doc);
                        doc.addPage();
                        this.drawPageBackground(doc);
                        y = this.drawPageHeader(doc);
                        doc.fontSize(16).font(this.getFont(true));
                        doc.fillColor(this.colors.text);
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
                        add: this.colors.success,
                        modify: this.colors.warning,
                        refactor: this.colors.primary,
                        optimize: "#6a1b9a",
                    };

                    const icon = modIcon[ref.modificationType] || "?";
                    const color = modColor[ref.modificationType] || this.colors.textSecondary;

                    // Modification type badge
                    doc.fillColor(color);
                    doc.roundedRect(this.margin + 15, y, 20, 16, 2).fill();
                    doc.fillColor("#ffffff");
                    doc.fontSize(9).font(this.getFont(true));
                    doc.text(icon, this.margin + 21, y + 3);

                    // File path
                    doc.fillColor(this.colors.primary);
                    doc.fontSize(9).font(this.getFont());
                    doc.text(ref.filePath || "", this.margin + 40, y + 3, {
                        width: this.contentWidth - 50,
                    });
                    y += 18;

                    // Current functionality
                    doc.fillColor(this.colors.textSecondary);
                    doc.fontSize(8).font(this.getFont());
                    doc.text(`${t.current}: ${ref.currentFunctionality || ""}`, this.margin + 40, y, {
                        width: this.contentWidth - 50,
                    });
                    y = doc.y + 3;

                    // Proposed change
                    doc.fillColor(this.colors.success);
                    doc.text(`${t.proposed}: ${ref.proposedChange || ""}`, this.margin + 40, y, {
                        width: this.contentWidth - 50,
                    });
                    y = doc.y + 8;
                }
            }

            // Expected Impact
            if (improvement.expectedImpact) {
                doc.fillColor(this.colors.primary);
                doc.fontSize(9).font(this.getFont());
                doc.text(`${t.expectedImpact}: ${improvement.expectedImpact}`, this.margin + 10, y);
                y = doc.y + 5;
            }

            doc.fillColor(this.colors.text);
            y += 20;
        }
    }
}
