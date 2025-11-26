/**
 * PDF Service
 *
 * Generates PDF marketing reports using pdfkit.
 * Supports Japanese text with Noto Sans JP fonts.
 *
 * @see https://pdfkit.org/
 */

import PDFDocument from "pdfkit";
import * as path from "path";
import * as fs from "fs";
import { MarketingReport } from "../models/report_data";
import { AIAnalysisReport, OverallAnalysis } from "./ai_analysis_service";
import { GeneratedCharts } from "./chart_service";

/**
 * PDF generation options.
 */
export interface PDFGenerationOptions {
    report: MarketingReport;
    aiAnalysis: AIAnalysisReport;
    charts?: GeneratedCharts;
    coverImage?: Buffer;
}

/**
 * Simple report options.
 */
export interface SimpleReportOptions {
    appName: string;
    period: string;
    summary: string;
    highlights: string[];
    concerns: string[];
    keyMetrics: OverallAnalysis["keyMetrics"];
}

/**
 * PDF Service Configuration.
 */
export interface PDFServiceConfig {
    /** Custom font directory path */
    fontDir?: string;
}

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

    constructor(config: PDFServiceConfig = {}) {
        this.contentWidth = this.pageWidth - this.margin * 2;
        // Default font directory: assets/fonts relative to package root
        this.fontDir =
            config.fontDir || path.join(__dirname, "..", "..", "assets", "fonts");
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
     * Get appropriate font name (fallback to Helvetica if Japanese fonts not available).
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
                const doc = new PDFDocument({
                    size: "A4",
                    margins: {
                        top: this.margin,
                        bottom: this.margin,
                        left: this.margin,
                        right: this.margin,
                    },
                    info: {
                        Title: `${options.report.appName} Marketing Report`,
                        Author: "Masamune Marketing Pipeline",
                        Subject: `${options.report.dateRange.startDate} - ${options.report.dateRange.endDate}`,
                    },
                });

                // Register Japanese fonts
                this.registerFonts(doc);

                const chunks: Buffer[] = [];
                doc.on("data", (chunk) => chunks.push(chunk));
                doc.on("end", () => resolve(Buffer.concat(chunks)));
                doc.on("error", reject);

                // Cover page
                this.addCoverPage(doc, options);

                // Summary page
                doc.addPage();
                this.addSummaryPage(doc, options);

                // Key metrics page
                doc.addPage();
                this.addKeyMetricsPage(doc, options);

                // Improvement suggestions page
                doc.addPage();
                this.addImprovementsPage(doc, options);

                // Charts page (if available)
                if (options.charts) {
                    doc.addPage();
                    this.addChartsPage(doc, options.charts);
                }

                // Trend analysis page
                doc.addPage();
                this.addTrendAnalysisPage(doc, options);

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Generate a simple summary PDF.
     */
    async generateSimpleReport(options: SimpleReportOptions): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: "A4",
                    margins: {
                        top: this.margin,
                        bottom: this.margin,
                        left: this.margin,
                        right: this.margin,
                    },
                });

                // Register Japanese fonts
                this.registerFonts(doc);

                const chunks: Buffer[] = [];
                doc.on("data", (chunk) => chunks.push(chunk));
                doc.on("end", () => resolve(Buffer.concat(chunks)));
                doc.on("error", reject);

                let y = this.margin;

                // Title
                doc.fontSize(24).font(this.getFont(true));
                doc.text(options.appName, this.margin, y, { align: "center" });
                y += 40;

                doc.fontSize(14).font(this.getFont());
                doc.text(`Marketing Report`, this.margin, y, { align: "center" });
                y += 25;

                doc.fontSize(12);
                doc.text(options.period, this.margin, y, { align: "center" });
                y += 50;

                // Summary
                doc.fontSize(16).font(this.getFont(true));
                doc.text("Summary / 総評", this.margin, y);
                y += 25;

                doc.fontSize(11).font(this.getFont());
                doc.text(options.summary, this.margin, y, {
                    width: this.contentWidth,
                    align: "justify",
                });
                y = doc.y + 30;

                // Highlights
                doc.fontSize(14).font(this.getFont(true));
                doc.text("Highlights / ハイライト", this.margin, y);
                y += 20;

                doc.fontSize(11).font(this.getFont());
                for (const highlight of options.highlights) {
                    doc.text(`• ${highlight}`, this.margin + 10, y, {
                        width: this.contentWidth - 10,
                    });
                    y = doc.y + 5;
                }
                y += 20;

                // Concerns
                doc.fontSize(14).font(this.getFont(true));
                doc.text("Concerns / 懸念点", this.margin, y);
                y += 20;

                doc.fontSize(11).font(this.getFont());
                for (const concern of options.concerns) {
                    doc.text(`• ${concern}`, this.margin + 10, y, {
                        width: this.contentWidth - 10,
                    });
                    y = doc.y + 5;
                }
                y += 20;

                // Key Metrics
                doc.fontSize(14).font(this.getFont(true));
                doc.text("Key Metrics / 主要指標", this.margin, y);
                y += 20;

                doc.fontSize(11).font(this.getFont());
                for (const metric of options.keyMetrics) {
                    const trendIcon =
                        metric.trend === "up" ? "↑" : metric.trend === "down" ? "↓" : "→";
                    doc.text(
                        `${metric.metric}: ${metric.value} ${trendIcon}`,
                        this.margin + 10,
                        y
                    );
                    y = doc.y + 5;
                }

                // Footer
                doc.fontSize(9).font(this.getFont());
                doc.text(
                    `Generated by Masamune Marketing Pipeline - ${new Date().toISOString().split("T")[0]}`,
                    this.margin,
                    this.pageHeight - 40,
                    { align: "center" }
                );

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
        options: PDFGenerationOptions
    ): void {
        let y = 150;

        // Cover image (if available)
        if (options.coverImage) {
            try {
                doc.image(options.coverImage, this.margin, 50, {
                    width: this.contentWidth,
                    height: 250,
                    fit: [this.contentWidth, 250],
                    align: "center",
                });
                y = 320;
            } catch {
                // Skip if image fails
            }
        }

        // App name
        doc.fontSize(32).font(this.getFont(true));
        doc.text(options.report.appName, this.margin, y, {
            width: this.contentWidth,
            align: "center",
        });
        y += 60;

        // Report type
        doc.fontSize(20).font(this.getFont());
        const reportTypeLabel =
            options.report.reportType === "daily"
                ? "Daily Report / 日次レポート"
                : options.report.reportType === "weekly"
                  ? "Weekly Report / 週次レポート"
                  : "Monthly Report / 月次レポート";
        doc.text(reportTypeLabel, this.margin, y, {
            width: this.contentWidth,
            align: "center",
        });
        y += 40;

        // Date range
        doc.fontSize(16);
        doc.text(
            `${options.report.dateRange.startDate} - ${options.report.dateRange.endDate}`,
            this.margin,
            y,
            { width: this.contentWidth, align: "center" }
        );
        y += 80;

        // Generated date
        doc.fontSize(12).font(this.getFont());
        doc.text(
            `Generated: ${new Date().toISOString().split("T")[0]}`,
            this.margin,
            y,
            {
                width: this.contentWidth,
                align: "center",
            }
        );

        // Footer
        doc.fontSize(10);
        doc.text(
            "Powered by Masamune Marketing Pipeline",
            this.margin,
            this.pageHeight - 60,
            {
                width: this.contentWidth,
                align: "center",
            }
        );
    }

    /**
     * Add summary page to the PDF.
     */
    private addSummaryPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text("Executive Summary / 総評", this.margin, y);
        y += 40;

        // Summary text
        doc.fontSize(11).font(this.getFont());
        doc.text(options.aiAnalysis.overallAnalysis.summary, this.margin, y, {
            width: this.contentWidth,
            align: "justify",
        });
        y = doc.y + 30;

        // Highlights section
        doc.fontSize(16).font(this.getFont(true));
        doc.text("Highlights / ハイライト", this.margin, y);
        y += 25;

        doc.fontSize(11).font(this.getFont());
        for (const highlight of options.aiAnalysis.overallAnalysis.highlights) {
            doc.fillColor("#2e7d32");
            doc.text(`✓ ${highlight}`, this.margin + 10, y, {
                width: this.contentWidth - 10,
            });
            y = doc.y + 8;
        }
        doc.fillColor("#000000");
        y += 20;

        // Concerns section
        doc.fontSize(16).font(this.getFont(true));
        doc.text("Areas of Concern / 懸念点", this.margin, y);
        y += 25;

        doc.fontSize(11).font(this.getFont());
        for (const concern of options.aiAnalysis.overallAnalysis.concerns) {
            doc.fillColor("#c62828");
            doc.text(`! ${concern}`, this.margin + 10, y, {
                width: this.contentWidth - 10,
            });
            y = doc.y + 8;
        }
        doc.fillColor("#000000");

        this.addPageNumber(doc);
    }

    /**
     * Add key metrics page to the PDF.
     */
    private addKeyMetricsPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text("Key Metrics / 主要指標", this.margin, y);
        y += 40;

        // Metrics table
        const metrics = options.aiAnalysis.overallAnalysis.keyMetrics;
        const colWidth = this.contentWidth / 3;

        // Table header
        doc.fontSize(12).font(this.getFont(true));
        doc.fillColor("#1565c0");
        doc.rect(this.margin, y, this.contentWidth, 25).fill();
        doc.fillColor("#ffffff");
        doc.text("Metric / 指標", this.margin + 10, y + 7);
        doc.text("Value / 値", this.margin + colWidth + 10, y + 7);
        doc.text("Trend", this.margin + colWidth * 2 + 10, y + 7);
        y += 25;

        // Table rows
        doc.fillColor("#000000");
        doc.font(this.getFont());
        for (let i = 0; i < metrics.length; i++) {
            const metric = metrics[i];
            const bgColor = i % 2 === 0 ? "#f5f5f5" : "#ffffff";
            doc.fillColor(bgColor);
            doc.rect(this.margin, y, this.contentWidth, 30).fill();

            doc.fillColor("#000000");
            doc.text(metric.metric, this.margin + 10, y + 10);
            doc.text(metric.value, this.margin + colWidth + 10, y + 10);

            // Trend indicator
            const trendColor =
                metric.trend === "up"
                    ? "#2e7d32"
                    : metric.trend === "down"
                      ? "#c62828"
                      : "#757575";
            const trendText =
                metric.trend === "up"
                    ? "↑ Up"
                    : metric.trend === "down"
                      ? "↓ Down"
                      : "→ Stable";
            doc.fillColor(trendColor);
            doc.text(trendText, this.margin + colWidth * 2 + 10, y + 10);

            y += 30;
        }

        doc.fillColor("#000000");

        // Raw data summary
        y += 30;
        doc.fontSize(16).font(this.getFont(true));
        doc.text("Data Sources / データソース", this.margin, y);
        y += 25;

        doc.fontSize(11).font(this.getFont());
        if (options.report.rawData.googlePlay) {
            doc.text(
                `Google Play: ${options.report.rawData.googlePlay.totalInstalls?.toLocaleString() || "N/A"} installs, Rating ${options.report.rawData.googlePlay.averageRating || "N/A"}`,
                this.margin + 10,
                y
            );
            y += 20;
        }
        if (options.report.rawData.firebaseAnalytics) {
            doc.text(
                `Firebase: DAU ${options.report.rawData.firebaseAnalytics.dau?.toLocaleString() || "N/A"}, MAU ${options.report.rawData.firebaseAnalytics.mau?.toLocaleString() || "N/A"}`,
                this.margin + 10,
                y
            );
            y += 20;
        }
        if (options.report.rawData.appStore) {
            doc.text(
                `App Store: Rating ${options.report.rawData.appStore.averageRating || "N/A"}`,
                this.margin + 10,
                y
            );
            y += 20;
        }
        if (options.report.rawData.github) {
            doc.text(
                `GitHub: ${options.report.rawData.github.stars || 0} stars, ${options.report.rawData.github.openIssuesCount || 0} open issues`,
                this.margin + 10,
                y
            );
        }

        this.addPageNumber(doc);
    }

    /**
     * Add improvements page to the PDF.
     */
    private addImprovementsPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text("Improvement Suggestions / 改善提案", this.margin, y);
        y += 40;

        doc.fontSize(11).font(this.getFont());

        for (const suggestion of options.aiAnalysis.improvementSuggestions) {
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
                doc.text(
                    `Expected Impact: ${suggestion.expectedImpact}`,
                    this.margin + 10,
                    y,
                    {
                        width: this.contentWidth - 10,
                    }
                );
                y = doc.y + 10;
            }

            doc.fillColor("#000000");
            y += 15;
        }

        this.addPageNumber(doc);
    }

    /**
     * Add charts page to the PDF.
     */
    private addChartsPage(
        doc: PDFKit.PDFDocument,
        charts: GeneratedCharts
    ): void {
        let y = this.margin;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text("Analytics Charts / 分析チャート", this.margin, y);
        y += 40;

        const chartWidth = this.contentWidth / 2 - 10;
        const chartHeight = 200;

        // Rating distribution chart
        if (charts.ratingDistribution) {
            try {
                doc.image(charts.ratingDistribution, this.margin, y, {
                    width: chartWidth,
                    height: chartHeight,
                    fit: [chartWidth, chartHeight],
                });
            } catch {
                // Skip if image fails
            }
        }

        // Engagement chart
        if (charts.engagement) {
            try {
                doc.image(charts.engagement, this.margin + chartWidth + 20, y, {
                    width: chartWidth,
                    height: chartHeight,
                    fit: [chartWidth, chartHeight],
                });
            } catch {
                // Skip if image fails
            }
        }

        y += chartHeight + 30;

        // Demographics chart
        if (charts.demographics) {
            try {
                doc.image(charts.demographics, this.margin, y, {
                    width: chartWidth,
                    height: chartHeight,
                    fit: [chartWidth, chartHeight],
                });
            } catch {
                // Skip if image fails
            }
        }

        // Country distribution chart
        if (charts.countryDistribution) {
            try {
                doc.image(
                    charts.countryDistribution,
                    this.margin + chartWidth + 20,
                    y,
                    {
                        width: chartWidth,
                        height: chartHeight,
                        fit: [chartWidth, chartHeight],
                    }
                );
            } catch {
                // Skip if image fails
            }
        }

        this.addPageNumber(doc);
    }

    /**
     * Add trend analysis page to the PDF.
     */
    private addTrendAnalysisPage(
        doc: PDFKit.PDFDocument,
        options: PDFGenerationOptions
    ): void {
        let y = this.margin;

        // Page title
        doc.fontSize(20).font(this.getFont(true));
        doc.text("Trend Analysis & Predictions / トレンド分析", this.margin, y);
        y += 40;

        // User Growth Trend
        doc.fontSize(14).font(this.getFont(true));
        doc.text("User Growth / ユーザー成長", this.margin, y);
        y += 20;

        doc.fontSize(11).font(this.getFont());
        doc.text(
            options.aiAnalysis.trendAnalysis.userGrowthTrend,
            this.margin + 10,
            y,
            {
                width: this.contentWidth - 10,
            }
        );
        y = doc.y + 25;

        // Engagement Trend
        doc.fontSize(14).font(this.getFont(true));
        doc.text("Engagement / エンゲージメント", this.margin, y);
        y += 20;

        doc.fontSize(11).font(this.getFont());
        doc.text(
            options.aiAnalysis.trendAnalysis.engagementTrend,
            this.margin + 10,
            y,
            {
                width: this.contentWidth - 10,
            }
        );
        y = doc.y + 25;

        // Rating Trend
        doc.fontSize(14).font(this.getFont(true));
        doc.text("Ratings / 評価", this.margin, y);
        y += 20;

        doc.fontSize(11).font(this.getFont());
        doc.text(
            options.aiAnalysis.trendAnalysis.ratingTrend,
            this.margin + 10,
            y,
            {
                width: this.contentWidth - 10,
            }
        );
        y = doc.y + 35;

        // Predictions
        doc.fontSize(16).font(this.getFont(true));
        doc.text("Predictions / 予測", this.margin, y);
        y += 25;

        doc.fontSize(11).font(this.getFont());
        for (const prediction of options.aiAnalysis.trendAnalysis.predictions) {
            doc.fillColor("#1565c0");
            doc.text(`→ ${prediction}`, this.margin + 10, y, {
                width: this.contentWidth - 10,
            });
            y = doc.y + 10;
        }

        doc.fillColor("#000000");

        // Review Analysis
        y += 20;
        doc.fontSize(16).font(this.getFont(true));
        doc.text("Review Sentiment / レビュー感情分析", this.margin, y);
        y += 25;

        const sentiment = options.aiAnalysis.reviewAnalysis.sentiment;
        doc.fontSize(11).font(this.getFont());
        doc.fillColor("#2e7d32");
        doc.text(`Positive: ${sentiment.positive}%`, this.margin + 10, y);
        doc.fillColor("#757575");
        doc.text(`Neutral: ${sentiment.neutral}%`, this.margin + 150, y);
        doc.fillColor("#c62828");
        doc.text(`Negative: ${sentiment.negative}%`, this.margin + 280, y);
        doc.fillColor("#000000");

        this.addPageNumber(doc);
    }

    /**
     * Add page number to the current page.
     */
    private addPageNumber(doc: PDFKit.PDFDocument): void {
        const pageNumber = doc.bufferedPageRange().count;
        doc.fontSize(9).font(this.getFont());
        doc.text(`Page ${pageNumber}`, this.margin, this.pageHeight - 30, {
            width: this.contentWidth,
            align: "center",
        });
    }
}
