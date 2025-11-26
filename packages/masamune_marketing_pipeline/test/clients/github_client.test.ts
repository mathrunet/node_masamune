/**
 * GitHub API Client Tests
 *
 * TDD: Write tests first, then implement the client.
 *
 * Required environment variables in test/.env:
 * - GITHUB_TOKEN: Personal Access Token
 * - GITHUB_REPO: Repository in format "owner/repo"
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load test environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

import { GitHubClient } from "../../src/clients/github_client";
import { DateRange } from "../../src/models/marketing_data";

describe("GitHubClient", () => {
    let client: GitHubClient;
    const token = process.env.GITHUB_TOKEN || "";
    const repo = process.env.GITHUB_REPO || "";

    // Date range for testing (last 30 days)
    const dateRange: DateRange = {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    };

    beforeAll(() => {
        if (!token || !repo) {
            console.warn("Skipping GitHub tests: Missing environment variables");
            return;
        }

        client = new GitHubClient({
            token: token,
            repo: repo,
        });
    });

    describe("initialization", () => {
        it("should create client with valid config", () => {
            if (!token || !repo) {
                return;
            }
            expect(client).toBeDefined();
        });

        it("should parse owner and repo from full name", () => {
            const testClient = new GitHubClient({
                token: "test-token",
                repo: "owner/repo-name",
            });
            expect(testClient).toBeDefined();
        });
    });

    describe("getRepositoryInfo", () => {
        it("should fetch repository basic information", async () => {
            if (!token || !repo) {
                return;
            }

            const repoInfo = await client.getRepositoryInfo();

            expect(repoInfo).toBeDefined();
            expect(repoInfo.fullName).toBe(repo);
            expect(typeof repoInfo.stars).toBe("number");
            expect(typeof repoInfo.forks).toBe("number");
            expect(typeof repoInfo.watchers).toBe("number");
            expect(typeof repoInfo.openIssuesCount).toBe("number");
        }, 30000);
    });

    describe("getIssueStats", () => {
        it("should fetch issue statistics", async () => {
            if (!token || !repo) {
                return;
            }

            const issues = await client.getIssueStats(dateRange);

            expect(issues).toBeDefined();
            expect(typeof issues.openIssues).toBe("number");
            expect(typeof issues.closedIssuesInPeriod).toBe("number");
            expect(typeof issues.newIssuesInPeriod).toBe("number");
        }, 30000);
    });

    describe("getPullRequestStats", () => {
        it("should fetch pull request statistics", async () => {
            if (!token || !repo) {
                return;
            }

            const prs = await client.getPullRequestStats(dateRange);

            expect(prs).toBeDefined();
            expect(typeof prs.openPRs).toBe("number");
            expect(typeof prs.mergedPRsInPeriod).toBe("number");
            expect(typeof prs.newPRsInPeriod).toBe("number");
        }, 30000);
    });

    describe("getCommitStats", () => {
        it("should fetch commit and contributor statistics", async () => {
            if (!token || !repo) {
                return;
            }

            const commits = await client.getCommitStats(dateRange);

            expect(commits).toBeDefined();
            expect(typeof commits.recentCommits).toBe("number");
            expect(typeof commits.contributors).toBe("number");
        }, 30000);
    });

    describe("getLatestRelease", () => {
        it("should fetch latest release information", async () => {
            if (!token || !repo) {
                return;
            }

            const release = await client.getLatestRelease();

            // Release might be undefined if there are no releases
            if (release) {
                expect(release.tagName).toBeDefined();
                expect(release.publishedAt).toBeDefined();
            }
        }, 30000);
    });

    describe("getLanguages", () => {
        it("should fetch repository languages", async () => {
            if (!token || !repo) {
                return;
            }

            const languages = await client.getLanguages();

            expect(languages).toBeDefined();
            expect(typeof languages).toBe("object");
        }, 30000);
    });

    describe("collectAllData", () => {
        it("should collect all GitHub data", async () => {
            if (!token || !repo) {
                return;
            }

            const data = await client.collectAllData(dateRange);

            expect(data).toBeDefined();
            expect(data.repoFullName).toBe(repo);
            expect(data.dateRange).toEqual(dateRange);
            expect(typeof data.stars).toBe("number");
            expect(typeof data.forks).toBe("number");
            expect(data.collectedAt).toBeInstanceOf(Date);
        }, 60000);
    });
});
