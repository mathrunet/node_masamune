/**
 * GitHub Analysis Summary Function
 *
 * Generates final repository analysis:
 * 1. Loads all folder summaries from Storage JSON
 * 2. Generates comprehensive analysis using AI
 * 3. Returns final JSON to action.results.githubRepository
 */

import { HttpFunctionsOptions } from "@mathrunet/masamune";
import {
    Action,
    WorkflowProcessFunctionBase,
    WorkflowContext,
} from "@mathrunet/masamune_workflow";
import * as admin from "firebase-admin";
import { GitHubAnalysisService } from "../services/github_analysis_service";
import {
    FolderSummary,
    FrameworkInfo,
    FileSummary,
} from "../models";
import {
    GitHubAnalysisData,
    readAnalysisData,
    writeAnalysisData,
} from "../utils/github_analysis_storage";

/**
 * Extended action command for summary.
 */
interface SummaryActionCommand {
    command: string;
    index: number;
    githubRepository: string;
    githubRepositoryPath?: string;
}

/**
 * A function for generating final GitHub repository analysis.
 *
 * GitHub リポジトリの最終解析を生成するためのFunction。
 */
export class AnalyzeGitHubSummary extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     */
    id: string = "analyze_github_summary";

    /**
     * Process the summary generation.
     */
    async process(context: WorkflowContext): Promise<Action> {
        const action = context.action;
        const command = action.command as SummaryActionCommand;

        const githubRepository = command.githubRepository;
        const githubRepositoryPath = command.githubRepositoryPath || "";

        if (!githubRepository) {
            console.error("AnalyzeGitHubSummary: No githubRepository specified");
            return {
                ...action,
                results: {
                    githubRepository: {
                        error: "No githubRepository specified",
                    },
                },
            };
        }

        // Get project reference
        const projectRef = action.project;
        if (!projectRef) {
            console.error("AnalyzeGitHubSummary: No project reference");
            return {
                ...action,
                results: {
                    githubRepository: {
                        error: "No project reference",
                    },
                },
            };
        }

        // Auto-initialize Firebase Admin if needed
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }

        const projectId = projectRef.id;

        try {
            // 1. Load analysis data from Storage
            const analysisData = await readAnalysisData(projectId);

            if (!analysisData) {
                throw new Error("Analysis data not found");
            }

            const state = analysisData.state;

            // 2. Initialize analysis service
            const gcpProjectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
            if (!gcpProjectId) {
                throw new Error("No GCP project ID found");
            }

            const analysisService = new GitHubAnalysisService({
                projectId: gcpProjectId,
            });

            // 3. Load all folder summaries from memory
            console.log("AnalyzeGitHubSummary: Loading folder summaries...");
            const folderSummaries: FolderSummary[] = [];

            // First, ensure root-level summary exists
            const rootFiles = state.filePaths.filter((fp: string) => !fp.includes("/"));
            if (rootFiles.length > 0) {
                const rootSummary = await this.getOrCreateRootSummary(
                    analysisData,
                    analysisService
                );
                if (rootSummary) {
                    folderSummaries.push(rootSummary);
                }
            }

            // Load folder summaries from memory
            for (const folderPath of state.folderPaths) {
                const folderKey = folderPath || "_root";
                const cached = analysisData.folders[folderKey];

                if (cached) {
                    folderSummaries.push({
                        path: cached.path,
                        summary: cached.summary,
                        features: cached.features,
                        fileCount: cached.fileCount,
                        analyzedAt: new Date(cached.analyzedAt),
                    });
                }
            }

            console.log(`AnalyzeGitHubSummary: Loaded ${folderSummaries.length} folder summaries`);

            // 4. Generate final analysis
            console.log("AnalyzeGitHubSummary: Generating final analysis...");
            const frameworkInfo: FrameworkInfo = state.framework || {
                framework: "unknown",
                platforms: [],
            };

            const result = await analysisService.generateFinalSummary(
                folderSummaries,
                frameworkInfo,
                githubRepository,
                githubRepositoryPath
            );

            // 5. Update state to completed and save
            analysisData.state.phase = "completed";
            await writeAnalysisData(projectId, analysisData);

            // 6. Calculate cost
            const cost = analysisService.calculateCost(result.inputTokens, result.outputTokens);

            // 7. Return final analysis
            console.log("AnalyzeGitHubSummary: Analysis complete");
            return {
                ...action,
                usage: (action.usage ?? 0) + cost,
                results: {
                    githubRepository: result.data,
                },
                // Generate search text for vector embedding
                search: this.generateSearchText(result.data),
            };
        } catch (error: any) {
            console.error("AnalyzeGitHubSummary: Failed to generate summary", error);

            // Update state to failed
            try {
                const analysisData = await readAnalysisData(projectId);
                if (analysisData) {
                    analysisData.state.phase = "failed";
                    analysisData.state.error = error.message;
                    await writeAnalysisData(projectId, analysisData);
                }
            } catch {
                // Ignore
            }

            return {
                ...action,
                results: {
                    githubRepository: {
                        error: error.message,
                    },
                },
            };
        }
    }

    /**
     * Get or create root-level summary for files not in any folder.
     */
    private async getOrCreateRootSummary(
        analysisData: GitHubAnalysisData,
        analysisService: GitHubAnalysisService
    ): Promise<FolderSummary | null> {
        const state = analysisData.state;

        // Check if root summary already exists
        if (analysisData.folders["_root"]) {
            const cached = analysisData.folders["_root"];
            return {
                path: "",
                summary: cached.summary,
                features: cached.features,
                fileCount: cached.fileCount,
                analyzedAt: new Date(cached.analyzedAt),
            };
        }

        // Get root-level file summaries
        const rootFiles = state.filePaths.filter((fp: string) => !fp.includes("/"));
        if (rootFiles.length === 0) {
            return null;
        }

        const fileSummaries: FileSummary[] = [];
        for (const filePath of rootFiles) {
            const cached = analysisData.files[filePath];

            if (cached) {
                fileSummaries.push({
                    path: cached.path,
                    summary: cached.summary,
                    features: cached.features,
                    analyzedAt: new Date(cached.analyzedAt),
                });
            }
        }

        // Generate root summary
        const result = await analysisService.summarizeFolder(
            fileSummaries,
            "",
            state.framework?.framework || "unknown"
        );

        // Save to memory
        analysisData.folders["_root"] = {
            path: "",
            summary: result.data.summary,
            features: result.data.features,
            fileCount: result.data.fileCount,
            analyzedAt: result.data.analyzedAt.toISOString(),
        };

        return result.data;
    }

    /**
     * Generate search text for vector embedding.
     */
    private generateSearchText(analysis: any): string {
        const parts: string[] = [];

        if (analysis.repository) {
            parts.push(`Repository: ${analysis.repository}`);
        }
        if (analysis.framework) {
            parts.push(`Framework: ${analysis.framework}`);
        }
        if (analysis.platforms?.length) {
            parts.push(`Platforms: ${analysis.platforms.join(", ")}`);
        }
        if (analysis.overview) {
            parts.push(`Overview: ${analysis.overview}`);
        }
        if (analysis.architecture) {
            parts.push(`Architecture: ${analysis.architecture}`);
        }
        if (analysis.features?.length) {
            const featureNames = analysis.features.map((f: any) => f.name).join(", ");
            parts.push(`Features: ${featureNames}`);
        }

        return parts.join("\n");
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    _data: { [key: string]: any }
) => new AnalyzeGitHubSummary(options).build(regions);

// Export class for testing
module.exports.AnalyzeGitHubSummary = AnalyzeGitHubSummary;
