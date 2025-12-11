import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, WorkflowContext } from "@mathrunet/masamune_workflow";
import "@mathrunet/masamune";

/**
 * Input data for Markdown report generation.
 *
 * Markdownレポート生成用の入力データ。
 */
interface MarkdownInputData {
    googlePlayConsole?: {
        packageName?: string;
        averageRating?: number;
        totalRatings?: number;
        ratingDistribution?: { [key: string]: number };
        [key: string]: any;
    };
    appStore?: {
        appId?: string;
        appName?: string;
        averageRating?: number;
        totalRatings?: number;
        ratingDistribution?: { [key: string]: number };
        [key: string]: any;
    };
    firebaseAnalytics?: {
        dau?: number;
        wau?: number;
        mau?: number;
        newUsers?: number;
        totalUsers?: number;
        averageSessionDuration?: number;
        sessionsPerUser?: number;
        demographics?: {
            ageGroups?: { [key: string]: number };
            countryDistribution?: { [key: string]: number };
        };
        [key: string]: any;
    };
    marketingAnalytics?: {
        overallAnalysis?: {
            summary?: string;
            keyMetrics?: Array<{
                metric: string;
                value: string;
                trend: "up" | "down" | "stable";
            }>;
            highlights?: string[];
            concerns?: string[];
        };
        improvementSuggestions?: Array<{
            priority: "high" | "medium" | "low";
            category: string;
            title: string;
            description: string;
            expectedImpact?: string;
        }>;
        trendAnalysis?: {
            userGrowthTrend?: string;
            engagementTrend?: string;
            ratingTrend?: string;
            predictions?: string[];
        };
        reviewAnalysis?: {
            sentiment?: {
                positive: number;
                neutral: number;
                negative: number;
            };
            commonThemes?: string[];
            actionableInsights?: string[];
        };
        generatedAt?: string;
        [key: string]: any;
    };
    githubRepository?: { [key: string]: any };
    githubImprovements?: {
        repository?: string;
        framework?: string;
        improvementSummary?: string;
        improvements?: Array<{
            priority?: "high" | "medium" | "low";
            category?: string;
            title?: string;
            description?: string;
            relatedFeature?: string;
            expectedImpact?: string;
            codeReferences?: Array<{
                filePath?: string;
                modificationType?: "add" | "modify" | "refactor" | "optimize";
                currentFunctionality?: string;
                proposedChange?: string;
            }>;
        }>;
        [key: string]: any;
    };
}

/**
 * Options for Markdown report generation.
 *
 * Markdownレポート生成オプション。
 */
interface MarkdownGenerationOptions {
    data: MarkdownInputData;
    appName?: string;
    reportType?: "daily" | "weekly" | "monthly";
    dateRange?: {
        startDate: string;
        endDate: string;
    };
}

/**
 * A function for generating marketing analytics Markdown report.
 *
 * マーケティング分析Markdownレポートを生成するためのFunction。
 */
export class GenerateMarketingMarkdown extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     *
     * 関数のID。
     */
    id: string = "generate_marketing_markdown";

    /**
     * The process of the function.
     *
     * @param context
     * The context of the function.
     *
     * @returns
     * The action of the function.
     */
    async process(context: WorkflowContext): Promise<Action> {
        const action = context.action;
        const task = context.task;

        // 1. task.results から各データを取得
        const googlePlayConsole = task.results?.googlePlayConsole as { [key: string]: any } | undefined;
        const appStore = task.results?.appStore as { [key: string]: any } | undefined;
        const firebaseAnalytics = task.results?.firebaseAnalytics as { [key: string]: any } | undefined;
        const marketingAnalytics = task.results?.marketingAnalytics as { [key: string]: any } | undefined;
        const githubRepository = task.results?.githubRepository as { [key: string]: any } | undefined;
        const githubImprovements = task.results?.githubImprovements as { [key: string]: any } | undefined;

        // 2. いずれのデータも無ければ空データを返却
        if (!googlePlayConsole && !appStore && !firebaseAnalytics && !marketingAnalytics) {
            console.log("GenerateMarketingMarkdown: No marketing data found in task.results");
            return {
                ...action,
                results: {
                    marketingAnalyticsMarkdown: "",
                }
            };
        }

        try {
            // 3. Markdownレポートを生成
            console.log("GenerateMarketingMarkdown: Generating Markdown report...");
            const inputData: MarkdownInputData = {
                googlePlayConsole,
                appStore,
                firebaseAnalytics,
                marketingAnalytics,
                githubRepository,
                githubImprovements,
            };

            // Determine app name from available data
            const appName = appStore?.appName ||
                googlePlayConsole?.packageName?.split(".")?.pop() ||
                "Marketing Report";

            // Determine date range from action command or use defaults
            const command = action.command as { [key: string]: any };
            const dateRange = command?.startDate && command?.endDate
                ? { startDate: command.startDate, endDate: command.endDate }
                : undefined;

            const markdownContent = this.generateMarkdownReport({
                data: inputData,
                appName,
                reportType: (command?.reportType as "daily" | "weekly" | "monthly") || "weekly",
                dateRange,
            });

            console.log("GenerateMarketingMarkdown: Markdown report generated, length:", markdownContent.length, "characters");

            // 4. results.marketingAnalyticsMarkdown に文字列として格納
            return {
                ...action,
                results: {
                    marketingAnalyticsMarkdown: markdownContent,
                }
            };
        } catch (error: any) {
            console.error("GenerateMarketingMarkdown: Failed to generate Markdown report", error);
            return {
                ...action,
                results: {
                    marketingAnalyticsMarkdown: "",
                    markdownError: error.message,
                }
            };
        }
    }

    /**
     * Generate the complete Markdown report.
     */
    private generateMarkdownReport(options: MarkdownGenerationOptions): string {
        const sections: string[] = [];

        // Header section
        sections.push(this.generateHeader(options));

        // Executive Summary
        if (options.data.marketingAnalytics?.overallAnalysis) {
            sections.push(this.generateExecutiveSummary(options));
        }

        // Highlights & Concerns
        const analysis = options.data.marketingAnalytics?.overallAnalysis;
        if ((analysis?.highlights?.length || 0) > 0 || (analysis?.concerns?.length || 0) > 0) {
            sections.push(this.generateHighlightsConcerns(options));
        }

        // User Analytics
        if (options.data.firebaseAnalytics) {
            sections.push(this.generateUserAnalytics(options));
        }

        // Ratings & Reviews
        if (options.data.googlePlayConsole || options.data.appStore || options.data.marketingAnalytics?.reviewAnalysis) {
            sections.push(this.generateRatingsReviews(options));
        }

        // Improvement Suggestions
        if (options.data.marketingAnalytics?.improvementSuggestions?.length) {
            sections.push(this.generateImprovements(options));
        }

        // GitHub Code Improvements
        if (options.data.githubImprovements?.improvements?.length) {
            sections.push(this.generateGitHubImprovements(options));
        }

        // Trend Analysis
        if (options.data.marketingAnalytics?.trendAnalysis) {
            sections.push(this.generateTrendAnalysis(options));
        }

        // Footer
        sections.push(this.generateFooter());

        return sections.join("\n\n---\n\n");
    }

    /**
     * Generate header section.
     */
    private generateHeader(options: MarkdownGenerationOptions): string {
        const appName = options.appName || "Marketing Report";
        const reportTypeLabel =
            options.reportType === "daily"
                ? "Daily Report"
                : options.reportType === "weekly"
                    ? "Weekly Report"
                    : "Monthly Report";

        const lines: string[] = [
            `# ${appName}`,
            "",
            `**Report Type:** ${reportTypeLabel}`,
        ];

        if (options.dateRange) {
            lines.push(`**Period:** ${options.dateRange.startDate} - ${options.dateRange.endDate}`);
        }

        lines.push(`**Generated:** ${new Date().toISOString().split("T")[0]}`);

        // Data sources
        const sources: string[] = [];
        if (options.data.googlePlayConsole) sources.push("Google Play");
        if (options.data.appStore) sources.push("App Store");
        if (options.data.firebaseAnalytics) sources.push("Firebase Analytics");
        if (options.data.marketingAnalytics) sources.push("AI Analysis");

        if (sources.length > 0) {
            lines.push(`**Data Sources:** ${sources.join(" | ")}`);
        }

        return lines.join("\n");
    }

    /**
     * Generate executive summary section.
     */
    private generateExecutiveSummary(options: MarkdownGenerationOptions): string {
        const analysis = options.data.marketingAnalytics?.overallAnalysis;
        const lines: string[] = ["## Executive Summary"];

        // Summary text
        if (analysis?.summary) {
            lines.push("", analysis.summary);
        }

        // Key Metrics table
        if (analysis?.keyMetrics?.length) {
            lines.push("", "### Key Metrics", "");
            lines.push("| Metric | Value | Trend |");
            lines.push("|--------|-------|-------|");

            for (const metric of analysis.keyMetrics) {
                const trendIcon = metric.trend === "up" ? "↑" : metric.trend === "down" ? "↓" : "→";
                lines.push(`| ${metric.metric} | ${metric.value} | ${trendIcon} |`);
            }
        }

        return lines.join("\n");
    }

    /**
     * Generate highlights and concerns section.
     */
    private generateHighlightsConcerns(options: MarkdownGenerationOptions): string {
        const analysis = options.data.marketingAnalytics?.overallAnalysis;
        const lines: string[] = ["## Highlights & Concerns"];

        // Highlights
        if (analysis?.highlights?.length) {
            lines.push("", "### Highlights");
            for (const highlight of analysis.highlights) {
                lines.push(`- ${highlight}`);
            }
        }

        // Concerns
        if (analysis?.concerns?.length) {
            lines.push("", "### Concerns");
            for (const concern of analysis.concerns) {
                lines.push(`- ${concern}`);
            }
        }

        return lines.join("\n");
    }

    /**
     * Generate user analytics section.
     */
    private generateUserAnalytics(options: MarkdownGenerationOptions): string {
        const firebase = options.data.firebaseAnalytics;
        const lines: string[] = ["## User Analytics"];

        if (!firebase) {
            return lines.join("\n");
        }

        // Main metrics table
        lines.push("", "### Active Users", "");
        lines.push("| Metric | Value |");
        lines.push("|--------|-------|");

        if (firebase.dau !== undefined) {
            lines.push(`| DAU | ${firebase.dau.toLocaleString()} |`);
        }
        if (firebase.wau !== undefined) {
            lines.push(`| WAU | ${firebase.wau.toLocaleString()} |`);
        }
        if (firebase.mau !== undefined) {
            lines.push(`| MAU | ${firebase.mau.toLocaleString()} |`);
        }
        if (firebase.newUsers !== undefined) {
            lines.push(`| New Users | ${firebase.newUsers.toLocaleString()} |`);
        }

        // Retention ratio
        if (firebase.dau && firebase.mau && firebase.mau > 0) {
            const retentionRatio = ((firebase.dau / firebase.mau) * 100).toFixed(1);
            lines.push(`| Retention (DAU/MAU) | ${retentionRatio}% |`);
        }

        // Session stats
        if (firebase.averageSessionDuration !== undefined || firebase.sessionsPerUser !== undefined) {
            lines.push("", "### Session Statistics", "");
            lines.push("| Metric | Value |");
            lines.push("|--------|-------|");

            if (firebase.averageSessionDuration !== undefined) {
                const minutes = Math.floor(firebase.averageSessionDuration / 60);
                const seconds = Math.floor(firebase.averageSessionDuration % 60);
                lines.push(`| Avg Session Duration | ${minutes}m ${seconds}s |`);
            }
            if (firebase.sessionsPerUser !== undefined) {
                lines.push(`| Sessions/User | ${firebase.sessionsPerUser.toFixed(1)} |`);
            }
        }

        // Demographics
        if (firebase.demographics?.ageGroups && Object.keys(firebase.demographics.ageGroups).length > 0) {
            lines.push("", "### Age Demographics", "");
            lines.push("| Age Group | Percentage |");
            lines.push("|-----------|------------|");

            const sortedAgeGroups = Object.entries(firebase.demographics.ageGroups)
                .sort((a, b) => b[1] - a[1]);

            for (const [ageGroup, percentage] of sortedAgeGroups) {
                const bar = this.generateProgressBar(percentage);
                lines.push(`| ${ageGroup} | ${bar} ${percentage}% |`);
            }
        }

        if (firebase.demographics?.countryDistribution && Object.keys(firebase.demographics.countryDistribution).length > 0) {
            lines.push("", "### Country Distribution", "");
            lines.push("| Country | Percentage |");
            lines.push("|---------|------------|");

            const sortedCountries = Object.entries(firebase.demographics.countryDistribution)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10); // Top 10 countries

            for (const [country, percentage] of sortedCountries) {
                const bar = this.generateProgressBar(percentage);
                lines.push(`| ${country} | ${bar} ${percentage}% |`);
            }
        }

        return lines.join("\n");
    }

    /**
     * Generate ratings and reviews section.
     */
    private generateRatingsReviews(options: MarkdownGenerationOptions): string {
        const googlePlay = options.data.googlePlayConsole;
        const appStore = options.data.appStore;
        const reviewAnalysis = options.data.marketingAnalytics?.reviewAnalysis;
        const lines: string[] = ["## Ratings & Reviews"];

        // Rating summary
        if (googlePlay?.averageRating || appStore?.averageRating) {
            lines.push("", "### Overall Ratings", "");
            lines.push("| Platform | Rating | Total Ratings |");
            lines.push("|----------|--------|---------------|");

            if (googlePlay?.averageRating) {
                const stars = this.generateStars(googlePlay.averageRating);
                lines.push(`| Google Play | ${stars} ${googlePlay.averageRating.toFixed(1)} | ${(googlePlay.totalRatings || 0).toLocaleString()} |`);
            }
            if (appStore?.averageRating) {
                const stars = this.generateStars(appStore.averageRating);
                lines.push(`| App Store | ${stars} ${appStore.averageRating.toFixed(1)} | ${(appStore.totalRatings || 0).toLocaleString()} |`);
            }
        }

        // Rating distribution
        if (googlePlay?.ratingDistribution || appStore?.ratingDistribution) {
            lines.push("", "### Rating Distribution", "");

            const hasGooglePlay = googlePlay?.ratingDistribution;
            const hasAppStore = appStore?.ratingDistribution;

            if (hasGooglePlay && hasAppStore) {
                lines.push("| Rating | Google Play | App Store |");
                lines.push("|--------|-------------|-----------|");
            } else if (hasGooglePlay) {
                lines.push("| Rating | Google Play |");
                lines.push("|--------|-------------|");
            } else {
                lines.push("| Rating | App Store |");
                lines.push("|--------|-----------|");
            }

            for (let i = 5; i >= 1; i--) {
                const starLabel = "★".repeat(i) + "☆".repeat(5 - i);
                const gpValue = googlePlay?.ratingDistribution?.[i.toString()] || googlePlay?.ratingDistribution?.[`star${i}`] || 0;
                const asValue = appStore?.ratingDistribution?.[i.toString()] || appStore?.ratingDistribution?.[`star${i}`] || 0;

                if (hasGooglePlay && hasAppStore) {
                    const gpBar = this.generateProgressBar(gpValue);
                    const asBar = this.generateProgressBar(asValue);
                    lines.push(`| ${starLabel} | ${gpBar} ${gpValue}% | ${asBar} ${asValue}% |`);
                } else if (hasGooglePlay) {
                    const gpBar = this.generateProgressBar(gpValue);
                    lines.push(`| ${starLabel} | ${gpBar} ${gpValue}% |`);
                } else {
                    const asBar = this.generateProgressBar(asValue);
                    lines.push(`| ${starLabel} | ${asBar} ${asValue}% |`);
                }
            }
        }

        // Review Analysis
        if (reviewAnalysis) {
            // Sentiment
            if (reviewAnalysis.sentiment) {
                lines.push("", "### Sentiment Analysis", "");
                lines.push("| Sentiment | Percentage |");
                lines.push("|-----------|------------|");

                const posBar = this.generateProgressBar(reviewAnalysis.sentiment.positive);
                const neuBar = this.generateProgressBar(reviewAnalysis.sentiment.neutral);
                const negBar = this.generateProgressBar(reviewAnalysis.sentiment.negative);

                lines.push(`| Positive | ${posBar} ${reviewAnalysis.sentiment.positive}% |`);
                lines.push(`| Neutral | ${neuBar} ${reviewAnalysis.sentiment.neutral}% |`);
                lines.push(`| Negative | ${negBar} ${reviewAnalysis.sentiment.negative}% |`);
            }

            // Common themes
            if (reviewAnalysis.commonThemes?.length) {
                lines.push("", "### Common Themes");
                for (const theme of reviewAnalysis.commonThemes) {
                    lines.push(`- ${theme}`);
                }
            }

            // Actionable insights
            if (reviewAnalysis.actionableInsights?.length) {
                lines.push("", "### Actionable Insights");
                for (const insight of reviewAnalysis.actionableInsights) {
                    lines.push(`- ${insight}`);
                }
            }
        }

        return lines.join("\n");
    }

    /**
     * Generate improvement suggestions section.
     */
    private generateImprovements(options: MarkdownGenerationOptions): string {
        const suggestions = options.data.marketingAnalytics?.improvementSuggestions || [];
        const lines: string[] = ["## Improvement Suggestions"];

        for (const suggestion of suggestions) {
            const priorityEmoji = suggestion.priority === "high" ? "🔴" : suggestion.priority === "medium" ? "🟡" : "🟢";
            lines.push("");
            lines.push(`### ${priorityEmoji} ${suggestion.priority.toUpperCase()}: [${suggestion.category}] ${suggestion.title}`);
            lines.push("");
            lines.push(suggestion.description);

            if (suggestion.expectedImpact) {
                lines.push("");
                lines.push(`**Expected Impact:** ${suggestion.expectedImpact}`);
            }
        }

        return lines.join("\n");
    }

    /**
     * Generate GitHub code improvements section.
     */
    private generateGitHubImprovements(options: MarkdownGenerationOptions): string {
        const githubImprovements = options.data.githubImprovements;
        const improvements = githubImprovements?.improvements || [];
        const lines: string[] = ["## コードベース改善提案"];

        // Repository info
        const repo = githubImprovements?.repository || "";
        const framework = githubImprovements?.framework || "";
        if (repo || framework) {
            lines.push("");
            lines.push(`**Repository:** ${repo} | **Framework:** ${framework}`);
        }

        // Summary
        if (githubImprovements?.improvementSummary) {
            lines.push("");
            lines.push(githubImprovements.improvementSummary);
        }

        // Each improvement
        for (const improvement of improvements) {
            const priorityEmoji = improvement.priority === "high" ? "🔴" : improvement.priority === "medium" ? "🟡" : "🟢";
            lines.push("");
            lines.push(`### ${priorityEmoji} ${(improvement.priority || "medium").toUpperCase()} [${improvement.category || ""}]: ${improvement.title || ""}`);
            lines.push("");

            if (improvement.description) {
                lines.push(improvement.description);
            }

            if (improvement.relatedFeature) {
                lines.push("");
                lines.push(`**関連機能:** ${improvement.relatedFeature}`);
            }

            // Code References
            const codeRefs = improvement.codeReferences || [];
            if (codeRefs.length > 0) {
                lines.push("");
                lines.push("**ファイル修正:**");
                lines.push("");
                lines.push("| Type | File | Current | Proposed |");
                lines.push("|------|------|---------|----------|");

                const modIcon: Record<string, string> = {
                    add: "+",
                    modify: "~",
                    refactor: "R",
                    optimize: "O",
                };

                for (const ref of codeRefs) {
                    const icon = modIcon[ref.modificationType || ""] || "?";
                    const filePath = ref.filePath || "";
                    const current = (ref.currentFunctionality || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
                    const proposed = (ref.proposedChange || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
                    lines.push(`| ${icon} | \`${filePath}\` | ${current} | ${proposed} |`);
                }
            }

            if (improvement.expectedImpact) {
                lines.push("");
                lines.push(`**期待効果:** ${improvement.expectedImpact}`);
            }
        }

        return lines.join("\n");
    }

    /**
     * Generate trend analysis section.
     */
    private generateTrendAnalysis(options: MarkdownGenerationOptions): string {
        const trendAnalysis = options.data.marketingAnalytics?.trendAnalysis;
        const lines: string[] = ["## Trend Analysis & Predictions"];

        if (trendAnalysis?.userGrowthTrend) {
            lines.push("", "### User Growth");
            lines.push(trendAnalysis.userGrowthTrend);
        }

        if (trendAnalysis?.engagementTrend) {
            lines.push("", "### Engagement");
            lines.push(trendAnalysis.engagementTrend);
        }

        if (trendAnalysis?.ratingTrend) {
            lines.push("", "### Ratings");
            lines.push(trendAnalysis.ratingTrend);
        }

        if (trendAnalysis?.predictions?.length) {
            lines.push("", "### Predictions");
            for (const prediction of trendAnalysis.predictions) {
                lines.push(`- ${prediction}`);
            }
        }

        return lines.join("\n");
    }

    /**
     * Generate footer section.
     */
    private generateFooter(): string {
        return `*Report generated by Masamune Workflow Marketing - ${new Date().toISOString().split("T")[0]}*`;
    }

    /**
     * Generate a progress bar using block characters.
     */
    private generateProgressBar(percentage: number, maxBlocks: number = 10): string {
        // Clamp percentage to 0-100 range
        const clampedPercentage = Math.max(0, Math.min(100, percentage));
        const filledBlocks = Math.round((clampedPercentage / 100) * maxBlocks);
        const emptyBlocks = maxBlocks - filledBlocks;
        return "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);
    }

    /**
     * Generate star rating display.
     */
    private generateStars(rating: number): string {
        // Clamp rating to 0-5 range
        const clampedRating = Math.max(0, Math.min(5, rating));
        const fullStars = Math.floor(clampedRating);
        const hasHalfStar = clampedRating - fullStars >= 0.5;
        const emptyStars = Math.max(0, 5 - fullStars - (hasHalfStar ? 1 : 0));
        return "★".repeat(fullStars) + (hasHalfStar ? "☆" : "") + "☆".repeat(emptyStars);
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new GenerateMarketingMarkdown(options).build(regions);

// Export class for testing
module.exports.GenerateMarketingMarkdown = GenerateMarketingMarkdown;
