/**
 * PDF Service
 *
 * Generates PDF marketing reports using pdfkit.
 * Supports Japanese text with NotoSansJP fonts.
 *
 * @see https://pdfkit.org/
 */

import PDFDocument from "pdfkit";
import * as path from "path";
import * as fs from "fs";
import { PDFInputData, PDFGenerationOptions, GeneratedCharts } from "../models";

// Re-export types for backward compatibility
export { PDFInputData, PDFGenerationOptions, GeneratedCharts };

// Font names for registration
const FONT_REGULAR = "NotoSansJP";
const FONT_BOLD = "NotoSansJP-Bold";

/**
 * PDF Service for generating marketing reports.
 */
export class PDFService {
    private readonly pageWidth = 595.28; // A4 width in points
    private readonly pageHeight = 841.89; // A4 height in points
    private readonly margin = 50;
    private readonly contentWidth: number;
    private fontDir: string;
    private fontsRegistered = false;

    constructor() {
        this.contentWidth = this.pageWidth - this.margin * 2;
        // Default font directory: assets/fonts relative to package root
        this.fontDir = path.join(__dirname, "..", "..", "assets", "fonts");
    }

    /**
     * Register Japanese fonts to PDFDocument.
     */
    private registerFonts(doc: PDFKit.PDFDocument): void {
        const regularFontPath = path.join(this.fontDir, "NotoSansJP-Regular.ttf");
        const boldFontPath = path.join(this.fontDir, "NotoSansJP-Bold.ttf");

        // Check if fonts exist
        if (fs.existsSync(regularFontPath)) {
            doc.registerFont(FONT_REGULAR, regularFontPath);
        }
        if (fs.existsSync(boldFontPath)) {
            doc.registerFont(FONT_BOLD, boldFontPath);
        }

        this.fontsRegistered =
            fs.existsSync(regularFontPath) && fs.existsSync(boldFontPath);
    }

    /**
     * Get font name (uses Japanese fonts if available).
     */
    private getFont(bold: boolean = false): string {
        if (this.fontsRegistered) {
            return bold ? FONT_BOLD : FONT_REGULAR;
        }
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

                // Register Japanese fonts
                this.registerFonts(doc);

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

                // Trend Analysis page
                if (options.data.marketingAnalytics?.trendAnalysis) {
                    doc.addPage();
                    this.addTrendAnalysisPage(doc, options);
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
        const reportTypeLabel =
            options.reportType === "daily"
                ? "Daily Report"
                : options.reportType === "weekly"
                    ? "Weekly Report"
                    : "Monthly Report";
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
            `Generated: ${new Date().toISOString().split("T")[0]}`,
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
        if (options.data.marketingAnalytics) sources.push("AI Analysis");

        doc.text(`Data Sources: ${sources.join(" | ")}`, this.margin, y, {
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

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text("Executive Summary", this.margin, y);
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
            doc.text("Key Metrics", this.margin, y);
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

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text("Highlights & Concerns", this.margin, y);
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
        doc.text("Highlights", this.margin, y);
        doc.fillColor("#b71c1c");
        doc.text("Concerns", this.margin + halfWidth + 30, y);
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

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text("User Analytics", this.margin, y);
        y += 35;

        if (firebase) {
            // DAU/WAU/MAU stats
            const dau = firebase.dau?.toLocaleString() || "N/A";
            const wau = firebase.wau?.toLocaleString() || "N/A";
            const mau = firebase.mau?.toLocaleString() || "N/A";
            const newUsers = firebase.newUsers?.toLocaleString() || "N/A";

            doc.fillColor("#1565c0");
            doc.fontSize(14).font(this.getFont(true));
            doc.text(`DAU: ${dau}  |  WAU: ${wau}  |  MAU: ${mau}  |  New Users: ${newUsers}`, this.margin, y);
            doc.fillColor("#000000");
            y += 25;

            // Retention ratio
            if (firebase.dau && firebase.mau && firebase.mau > 0) {
                const retentionRatio = ((firebase.dau / firebase.mau) * 100).toFixed(1);
                doc.fontSize(11).font(this.getFont());
                doc.text(`Retention Ratio (DAU/MAU): ${retentionRatio}%`, this.margin, y);
                y += 20;
            }

            // Session stats
            if (firebase.averageSessionDuration || firebase.sessionsPerUser) {
                doc.fontSize(11).font(this.getFont());
                const stats: string[] = [];
                if (firebase.averageSessionDuration) {
                    const minutes = Math.floor(firebase.averageSessionDuration / 60);
                    const seconds = Math.floor(firebase.averageSessionDuration % 60);
                    stats.push(`Avg Session: ${minutes}m ${seconds}s`);
                }
                if (firebase.sessionsPerUser) {
                    stats.push(`Sessions/User: ${firebase.sessionsPerUser.toFixed(1)}`);
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
                doc.text("Active Users", this.margin, y);
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
                doc.text("Retention", this.margin + chartWidth + 20, y);
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
                doc.text("Age Demographics", this.margin, y);
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
                doc.text("Country Distribution", this.margin + chartWidth + 20, y);
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

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text("Ratings & Reviews", this.margin, y);
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
                doc.text("Rating Distribution", this.margin, y);
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
                doc.text("Review Sentiment", this.margin + chartWidth + 20, y);
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
            doc.text("Review Analysis", this.margin, y);
            y += 20;

            // Sentiment breakdown
            if (reviewAnalysis.sentiment) {
                doc.fontSize(11).font(this.getFont());
                doc.fillColor("#4CAF50");
                doc.text(`Positive: ${reviewAnalysis.sentiment.positive}%`, this.margin, y);
                doc.fillColor("#9e9e9e");
                doc.text(`Neutral: ${reviewAnalysis.sentiment.neutral}%`, this.margin + 120, y);
                doc.fillColor("#f44336");
                doc.text(`Negative: ${reviewAnalysis.sentiment.negative}%`, this.margin + 230, y);
                y += 25;
            }

            // Common themes
            if (reviewAnalysis.commonThemes?.length) {
                doc.fillColor("#000000");
                doc.fontSize(12).font(this.getFont(true));
                doc.text("Common Themes:", this.margin, y);
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
                doc.text("Actionable Insights:", this.margin, y);
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

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text("Improvement Suggestions", this.margin, y);
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
                doc.text(`Expected Impact: ${suggestion.expectedImpact}`, this.margin + 10, y, {
                    width: this.contentWidth - 10,
                });
                y = doc.y + 10;
            }

            doc.fillColor("#000000");
            y += 15;
        }
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

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text("Trend Analysis & Predictions", this.margin, y);
        y += 35;

        // Trends
        const halfWidth = this.contentWidth / 2 - 10;

        // User Growth Trend
        if (trendAnalysis?.userGrowthTrend) {
            doc.fontSize(12).font(this.getFont(true));
            doc.text("User Growth", this.margin, y);
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
            doc.text("Engagement", this.margin, y);
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
            doc.text("Ratings", this.margin, y);
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
            doc.text("Predictions", this.margin, y);
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
            `Report generated by Masamune Workflow Marketing - ${new Date().toISOString().split("T")[0]}`,
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

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text("コードベース改善提案", this.margin, y);
        y += 25;

        // Repository info
        doc.fontSize(10).font(this.getFont());
        doc.fillColor("#757575");
        const repo = githubImprovements?.repository || "";
        const framework = githubImprovements?.framework || "";
        doc.text(`Repository: ${repo} | Framework: ${framework}`, this.margin, y);
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
                doc.text("コードベース改善提案 (続き)", this.margin, y);
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
                doc.text(`関連機能: ${improvement.relatedFeature}`, this.margin + 10, y);
                y = doc.y + 8;
            }

            // Code References
            const codeRefs = improvement.codeReferences || [];
            if (codeRefs.length > 0) {
                doc.fillColor("#000000");
                doc.fontSize(10).font(this.getFont(true));
                doc.text("ファイル修正:", this.margin + 10, y);
                y += 15;

                for (const ref of codeRefs) {
                    // Check page break
                    if (y > this.pageHeight - 100) {
                        doc.addPage();
                        y = this.margin;
                        doc.fontSize(16).font(this.getFont(true));
                        doc.fillColor("#000000");
                        doc.text("コードベース改善提案 (続き)", this.margin, y);
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
                    doc.text(`現状: ${ref.currentFunctionality || ""}`, this.margin + 40, y, {
                        width: this.contentWidth - 50,
                    });
                    y = doc.y + 3;

                    // Proposed change
                    doc.fillColor("#2e7d32");
                    doc.text(`変更: ${ref.proposedChange || ""}`, this.margin + 40, y, {
                        width: this.contentWidth - 50,
                    });
                    y = doc.y + 8;
                }
            }

            // Expected Impact
            if (improvement.expectedImpact) {
                doc.fillColor("#1565c0");
                doc.fontSize(9).font(this.getFont());
                doc.text(`期待効果: ${improvement.expectedImpact}`, this.margin + 10, y);
                y = doc.y + 5;
            }

            doc.fillColor("#000000");
            y += 20;
        }
    }
}
