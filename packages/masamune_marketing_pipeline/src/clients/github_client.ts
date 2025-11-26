/**
 * GitHub API Client
 *
 * Collects repository data from GitHub:
 * - Repository info (stars, forks, watchers)
 * - Issues and Pull Requests
 * - Commits and contributors
 * - Releases
 * - Languages
 *
 * @see https://docs.github.com/en/rest
 */

import { Octokit } from "@octokit/rest";
import { DateRange, GitHubData } from "../models/marketing_data";
import { withRetry } from "../utils/error_handler";

/**
 * Configuration for GitHub Client.
 */
export interface GitHubClientConfig {
    /** Personal Access Token */
    token: string;
    /** Repository in format "owner/repo" */
    repo: string;
}

/**
 * Repository basic information.
 */
export interface RepositoryInfo {
    fullName: string;
    description: string | null;
    stars: number;
    forks: number;
    watchers: number;
    openIssuesCount: number;
    defaultBranch: string;
    createdAt: string;
    updatedAt: string;
    pushedAt: string;
}

/**
 * Issue statistics.
 */
export interface IssueStats {
    openIssues: number;
    closedIssuesInPeriod: number;
    newIssuesInPeriod: number;
}

/**
 * Pull request statistics.
 */
export interface PullRequestStats {
    openPRs: number;
    mergedPRsInPeriod: number;
    newPRsInPeriod: number;
}

/**
 * Commit statistics.
 */
export interface CommitStats {
    recentCommits: number;
    contributors: number;
}

/**
 * Release information.
 */
export interface ReleaseInfo {
    tagName: string;
    name: string | null;
    publishedAt: string;
    downloadCount: number;
}

/**
 * Code analysis data from repository.
 */
export interface CodeAnalysisData {
    /** README content (truncated if too long) */
    readme?: string;
    /** Project configuration (pubspec.yaml, package.json, etc.) */
    projectConfig?: string;
    /** Project type detected */
    projectType?: "flutter" | "nodejs" | "python" | "unknown";
    /** Recent issue details for understanding user needs */
    recentIssues?: IssueDetail[];
}

/**
 * Issue detail with title and body.
 */
export interface IssueDetail {
    number: number;
    title: string;
    body: string | null;
    state: "open" | "closed";
    labels: string[];
    createdAt: string;
}

/**
 * GitHub API Client.
 */
export class GitHubClient {
    private octokit: Octokit;
    private owner: string;
    private repo: string;

    constructor(config: GitHubClientConfig) {
        this.octokit = new Octokit({
            auth: config.token,
        });

        // Parse owner and repo from "owner/repo" format
        const [owner, repo] = config.repo.split("/");
        this.owner = owner;
        this.repo = repo;
    }

    /**
     * Get repository basic information.
     */
    async getRepositoryInfo(): Promise<RepositoryInfo> {
        return withRetry(async () => {
            const { data } = await this.octokit.repos.get({
                owner: this.owner,
                repo: this.repo,
            });

            return {
                fullName: data.full_name,
                description: data.description,
                stars: data.stargazers_count,
                forks: data.forks_count,
                watchers: data.subscribers_count,
                openIssuesCount: data.open_issues_count,
                defaultBranch: data.default_branch,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
                pushedAt: data.pushed_at,
            };
        });
    }

    /**
     * Get issue statistics for a date range.
     */
    async getIssueStats(dateRange: DateRange): Promise<IssueStats> {
        return withRetry(async () => {
            // Get open issues
            const { data: openIssues } = await this.octokit.issues.listForRepo({
                owner: this.owner,
                repo: this.repo,
                state: "open",
                per_page: 1,
            });

            // Get issues created in period
            const { data: newIssues } = await this.octokit.issues.listForRepo({
                owner: this.owner,
                repo: this.repo,
                state: "all",
                since: `${dateRange.startDate}T00:00:00Z`,
                per_page: 100,
            });

            // Filter to only issues (not PRs) and count
            const issuesOnly = newIssues.filter((i) => !i.pull_request);
            const newIssuesInPeriod = issuesOnly.filter((i) => {
                const createdAt = new Date(i.created_at);
                const start = new Date(dateRange.startDate);
                const end = new Date(dateRange.endDate);
                end.setHours(23, 59, 59, 999);
                return createdAt >= start && createdAt <= end;
            }).length;

            // Count closed issues in period
            const closedIssuesInPeriod = issuesOnly.filter((i) => {
                if (!i.closed_at) return false;
                const closedAt = new Date(i.closed_at);
                const start = new Date(dateRange.startDate);
                const end = new Date(dateRange.endDate);
                end.setHours(23, 59, 59, 999);
                return closedAt >= start && closedAt <= end;
            }).length;

            // Get total open issues count from search
            const { data: searchResult } = await this.octokit.search.issuesAndPullRequests({
                q: `repo:${this.owner}/${this.repo} is:issue is:open`,
            });

            return {
                openIssues: searchResult.total_count,
                closedIssuesInPeriod,
                newIssuesInPeriod,
            };
        });
    }

    /**
     * Get pull request statistics for a date range.
     */
    async getPullRequestStats(dateRange: DateRange): Promise<PullRequestStats> {
        return withRetry(async () => {
            // Get open PRs count
            const { data: openPRsSearch } = await this.octokit.search.issuesAndPullRequests({
                q: `repo:${this.owner}/${this.repo} is:pr is:open`,
            });

            // Get PRs created in period
            const { data: prs } = await this.octokit.pulls.list({
                owner: this.owner,
                repo: this.repo,
                state: "all",
                sort: "created",
                direction: "desc",
                per_page: 100,
            });

            const startDate = new Date(dateRange.startDate);
            const endDate = new Date(dateRange.endDate);
            endDate.setHours(23, 59, 59, 999);

            // Filter PRs in date range
            const prsInPeriod = prs.filter((pr) => {
                const createdAt = new Date(pr.created_at);
                return createdAt >= startDate && createdAt <= endDate;
            });

            const newPRsInPeriod = prsInPeriod.length;

            // Count merged PRs in period
            const mergedPRsInPeriod = prs.filter((pr) => {
                if (!pr.merged_at) return false;
                const mergedAt = new Date(pr.merged_at);
                return mergedAt >= startDate && mergedAt <= endDate;
            }).length;

            return {
                openPRs: openPRsSearch.total_count,
                mergedPRsInPeriod,
                newPRsInPeriod,
            };
        });
    }

    /**
     * Get commit and contributor statistics for a date range.
     */
    async getCommitStats(dateRange: DateRange): Promise<CommitStats> {
        return withRetry(async () => {
            // Get commits in date range
            const { data: commits } = await this.octokit.repos.listCommits({
                owner: this.owner,
                repo: this.repo,
                since: `${dateRange.startDate}T00:00:00Z`,
                until: `${dateRange.endDate}T23:59:59Z`,
                per_page: 100,
            });

            // Count unique contributors
            const contributors = new Set(commits.map((c) => c.author?.login || c.commit.author?.email).filter(Boolean));

            return {
                recentCommits: commits.length,
                contributors: contributors.size,
            };
        });
    }

    /**
     * Get latest release information.
     */
    async getLatestRelease(): Promise<ReleaseInfo | undefined> {
        return withRetry(async () => {
            try {
                const { data } = await this.octokit.repos.getLatestRelease({
                    owner: this.owner,
                    repo: this.repo,
                });

                // Calculate total download count from assets
                const downloadCount = data.assets.reduce((sum, asset) => sum + asset.download_count, 0);

                return {
                    tagName: data.tag_name,
                    name: data.name,
                    publishedAt: data.published_at || data.created_at,
                    downloadCount,
                };
            } catch (error: any) {
                // No releases found
                if (error.status === 404) {
                    return undefined;
                }
                throw error;
            }
        });
    }

    /**
     * Get repository languages.
     */
    async getLanguages(): Promise<{ [language: string]: number }> {
        return withRetry(async () => {
            const { data } = await this.octokit.repos.listLanguages({
                owner: this.owner,
                repo: this.repo,
            });

            return data;
        });
    }

    /**
     * Get README content from repository.
     * Truncates to maxLength characters if too long.
     */
    async getReadme(maxLength: number = 5000): Promise<string | undefined> {
        return withRetry(async () => {
            try {
                const { data } = await this.octokit.repos.getReadme({
                    owner: this.owner,
                    repo: this.repo,
                    mediaType: { format: "raw" },
                });

                // data is the raw content when using format: "raw"
                const content = typeof data === "string" ? data : "";
                return content.length > maxLength ? content.substring(0, maxLength) + "..." : content;
            } catch (error: any) {
                if (error.status === 404) {
                    return undefined;
                }
                throw error;
            }
        });
    }

    /**
     * Get project configuration file (pubspec.yaml, package.json, etc.)
     */
    async getProjectConfig(): Promise<{ content: string; projectType: CodeAnalysisData["projectType"] } | undefined> {
        const configFiles = [
            { path: "pubspec.yaml", type: "flutter" as const },
            { path: "package.json", type: "nodejs" as const },
            { path: "pyproject.toml", type: "python" as const },
            { path: "requirements.txt", type: "python" as const },
        ];

        for (const { path, type } of configFiles) {
            try {
                const { data } = await this.octokit.repos.getContent({
                    owner: this.owner,
                    repo: this.repo,
                    path,
                    mediaType: { format: "raw" },
                });

                const content = typeof data === "string" ? data : "";
                // Truncate if too long
                const truncated = content.length > 3000 ? content.substring(0, 3000) + "..." : content;
                return { content: truncated, projectType: type };
            } catch {
                // File not found, try next
                continue;
            }
        }

        return undefined;
    }

    /**
     * Get recent issue details with titles and bodies.
     * Useful for understanding user feature requests and bug reports.
     */
    async getRecentIssueDetails(limit: number = 10): Promise<IssueDetail[]> {
        return withRetry(async () => {
            const { data } = await this.octokit.issues.listForRepo({
                owner: this.owner,
                repo: this.repo,
                state: "all",
                sort: "updated",
                direction: "desc",
                per_page: limit,
            });

            // Filter out pull requests
            const issuesOnly = data.filter((i) => !i.pull_request);

            return issuesOnly.map((issue) => ({
                number: issue.number,
                title: issue.title,
                body: issue.body ? (issue.body.length > 500 ? issue.body.substring(0, 500) + "..." : issue.body) : null,
                state: issue.state as "open" | "closed",
                labels: issue.labels
                    .map((l) => (typeof l === "string" ? l : l.name))
                    .filter((n): n is string => n !== undefined),
                createdAt: issue.created_at,
            }));
        });
    }

    /**
     * Get code analysis data including README, config, and issues.
     */
    async getCodeAnalysisData(): Promise<CodeAnalysisData> {
        const [readme, projectConfig, recentIssues] = await Promise.all([
            this.getReadme().catch(() => undefined),
            this.getProjectConfig().catch(() => undefined),
            this.getRecentIssueDetails().catch(() => []),
        ]);

        return {
            readme,
            projectConfig: projectConfig?.content,
            projectType: projectConfig?.projectType || "unknown",
            recentIssues,
        };
    }

    /**
     * Collect all GitHub data for a date range.
     */
    async collectAllData(dateRange: DateRange): Promise<GitHubData> {
        const [repoInfo, issueStats, prStats, commitStats, latestRelease, languages] = await Promise.all([
            this.getRepositoryInfo().catch((err) => {
                console.error("Failed to get repository info:", err.message);
                return null;
            }),
            this.getIssueStats(dateRange).catch((err) => {
                console.error("Failed to get issue stats:", err.message);
                return { openIssues: 0, closedIssuesInPeriod: 0, newIssuesInPeriod: 0 };
            }),
            this.getPullRequestStats(dateRange).catch((err) => {
                console.error("Failed to get PR stats:", err.message);
                return { openPRs: 0, mergedPRsInPeriod: 0, newPRsInPeriod: 0 };
            }),
            this.getCommitStats(dateRange).catch((err) => {
                console.error("Failed to get commit stats:", err.message);
                return { recentCommits: 0, contributors: 0 };
            }),
            this.getLatestRelease().catch((err) => {
                console.error("Failed to get latest release:", err.message);
                return undefined;
            }),
            this.getLanguages().catch((err) => {
                console.error("Failed to get languages:", err.message);
                return {};
            }),
        ]);

        return {
            repoFullName: `${this.owner}/${this.repo}`,
            dateRange: dateRange,
            stars: repoInfo?.stars || 0,
            forks: repoInfo?.forks || 0,
            watchers: repoInfo?.watchers || 0,
            openIssuesCount: repoInfo?.openIssuesCount || 0,
            openIssues: issueStats.openIssues,
            closedIssuesInPeriod: issueStats.closedIssuesInPeriod,
            newIssuesInPeriod: issueStats.newIssuesInPeriod,
            openPRs: prStats.openPRs,
            mergedPRsInPeriod: prStats.mergedPRsInPeriod,
            newPRsInPeriod: prStats.newPRsInPeriod,
            recentCommits: commitStats.recentCommits,
            contributors: commitStats.contributors,
            latestRelease: latestRelease
                ? {
                      tagName: latestRelease.tagName,
                      name: latestRelease.name || undefined,
                      publishedAt: latestRelease.publishedAt,
                      downloadCount: latestRelease.downloadCount,
                  }
                : undefined,
            languages: languages,
            collectedAt: new Date(),
        };
    }
}
