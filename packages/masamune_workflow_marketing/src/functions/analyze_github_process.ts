/**
 * GitHub Analysis Process Function
 *
 * Processes a folder batch:
 * 1. Reads all files in the folder from GitHub
 * 2. Generates AI summaries for all files + folder in one call
 * 3. Caches summaries in Storage JSON
 */

import { HttpFunctionsOptions } from "@mathrunet/masamune";
import {
    Action,
    WorkflowProcessFunctionBase,
    WorkflowContext,
    Project,
} from "@mathrunet/masamune_workflow";
import * as admin from "firebase-admin";
import { GitHubContentClient } from "../clients/github_content_client";
import { GitHubAnalysisService } from "../services/github_analysis_service";
import {
    StoredFileSummary,
    readAnalysisData,
    writeAnalysisData,
} from "../utils/github_analysis_storage";

/**
 * Extended action command with batch index.
 */
interface ProcessActionCommand {
    command: string;
    index: number;
    githubRepository: string;
    githubRepositoryPath?: string;
    batchIndex: number;
}

/**
 * A function for processing a batch of GitHub files.
 *
 * GitHubファイルのバッチを処理するためのFunction。
 */
export class AnalyzeGitHubProcess extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     */
    id: string = "analyze_github_process";

    /**
     * Process the batch.
     */
    async process(context: WorkflowContext): Promise<Action> {
        const action = context.action;
        const command = action.command as ProcessActionCommand;

        const githubRepository = command.githubRepository;
        const batchIndex = command.batchIndex;

        if (!githubRepository) {
            console.error("AnalyzeGitHubProcess: No githubRepository specified");
            return {
                ...action,
                results: {
                    githubAnalysisProcess: {
                        error: "No githubRepository specified",
                    },
                },
            };
        }

        // Get project reference for GitHub token
        const projectRef = action.project;
        if (!projectRef) {
            console.error("AnalyzeGitHubProcess: No project reference");
            return {
                ...action,
                results: {
                    githubAnalysisProcess: {
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
                throw new Error("Analysis data not found. Run init first.");
            }

            const state = analysisData.state;

            // 2. Get folder batch for this index
            const folderBatches = state.folderBatches || [];
            if (batchIndex >= folderBatches.length) {
                console.warn(`AnalyzeGitHubProcess: Batch ${batchIndex} out of range (${folderBatches.length} batches)`);
                return {
                    ...action,
                    results: {
                        githubAnalysisProcess: {
                            batchIndex: batchIndex,
                            filesProcessed: 0,
                            skipped: true,
                        },
                    },
                };
            }

            const folderBatch = folderBatches[batchIndex];
            const folderPath = folderBatch.folderPath;
            const filesToProcess = folderBatch.files;

            console.log(`AnalyzeGitHubProcess: Processing folder "${folderPath || "(root)"}" with ${filesToProcess.length} files`);

            // 3. Check if already processed
            const folderKey = folderPath || "_root";
            if (analysisData.folders[folderKey]) {
                console.log(`AnalyzeGitHubProcess: Folder ${folderPath} already processed, skipping`);
                return {
                    ...action,
                    results: {
                        githubAnalysisProcess: {
                            batchIndex: batchIndex,
                            folderPath: folderPath,
                            filesProcessed: 0,
                            skipped: true,
                        },
                    },
                };
            }

            // 4. Get GitHub token from project
            const projectDoc = await projectRef.load();
            const projectData = projectDoc.data() as Project | undefined;
            const githubToken = projectData?.github_personal_access_token;

            if (!githubToken) {
                throw new Error("No GitHub token in project");
            }

            // 5. Initialize clients
            const githubClient = new GitHubContentClient({
                token: githubToken,
                repo: githubRepository,
            });

            const gcpProjectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
            if (!gcpProjectId) {
                throw new Error("No GCP project ID found");
            }

            const analysisService = new GitHubAnalysisService({
                projectId: gcpProjectId,
            });

            // 6. Load all file contents in parallel
            console.log(`AnalyzeGitHubProcess: Loading ${filesToProcess.length} files...`);
            const fileContents: Array<{ path: string; content: string }> = [];

            await Promise.all(filesToProcess.map(async (filePath) => {
                try {
                    const content = await githubClient.getFileContent(filePath);
                    fileContents.push({ path: filePath, content });
                } catch (err: any) {
                    console.warn(`AnalyzeGitHubProcess: Failed to read ${filePath}: ${err.message}`);
                    // Save error entry
                    analysisData.files[filePath] = {
                        path: filePath,
                        summary: `Error reading file: ${err.message}`,
                        analyzedAt: new Date().toISOString(),
                    };
                }
            }));

            console.log(`AnalyzeGitHubProcess: Loaded ${fileContents.length}/${filesToProcess.length} files`);

            // 7. Analyze folder batch with single AI call
            let totalInputTokens = 0;
            let totalOutputTokens = 0;

            if (fileContents.length > 0) {
                console.log(`AnalyzeGitHubProcess: Analyzing folder "${folderPath || "(root)"}" with AI...`);
                const result = await analysisService.analyzeFolderBatch(
                    fileContents,
                    folderPath,
                    state.framework?.framework || "unknown"
                );

                totalInputTokens = result.inputTokens;
                totalOutputTokens = result.outputTokens;

                // 8. Save file summaries to memory
                for (const fileSummary of result.data.files) {
                    const cacheEntry: StoredFileSummary = {
                        path: fileSummary.path,
                        language: fileSummary.language,
                        summary: fileSummary.summary,
                        features: fileSummary.features,
                        analyzedAt: fileSummary.analyzedAt.toISOString(),
                    };
                    analysisData.files[fileSummary.path] = cacheEntry;
                }

                // 9. Save folder summary to memory
                analysisData.folders[folderKey] = {
                    path: folderPath,
                    summary: result.data.folder.summary,
                    features: result.data.folder.features,
                    fileCount: result.data.folder.fileCount,
                    analyzedAt: result.data.folder.analyzedAt.toISOString(),
                };

                console.log(`AnalyzeGitHubProcess: Folder "${folderPath || "(root)"}" analyzed successfully`);
            }

            // 10. Update state
            const newProcessedCount = state.processedFiles + filesToProcess.length;
            analysisData.state.processedFiles = newProcessedCount;
            analysisData.state.currentBatchIndex = batchIndex + 1;

            // 11. Save updated data to Storage
            await writeAnalysisData(projectId, analysisData);

            // 12. Calculate cost
            const cost = analysisService.calculateCost(totalInputTokens, totalOutputTokens);

            // 13. Return results
            return {
                ...action,
                usage: (action.usage ?? 0) + cost,
                results: {
                    githubAnalysisProcess: {
                        batchIndex: batchIndex,
                        folderPath: folderPath,
                        filesProcessed: filesToProcess.length,
                        filesAnalyzed: fileContents.length,
                        totalProcessed: newProcessedCount,
                        totalFiles: state.totalFiles,
                        inputTokens: totalInputTokens,
                        outputTokens: totalOutputTokens,
                    },
                },
            };
        } catch (error: any) {
            console.error("AnalyzeGitHubProcess: Failed to process batch", error);
            return {
                ...action,
                results: {
                    githubAnalysisProcess: {
                        error: error.message,
                        batchIndex: batchIndex,
                    },
                },
            };
        }
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new AnalyzeGitHubProcess(options).build(regions);

// Export class for testing
module.exports.AnalyzeGitHubProcess = AnalyzeGitHubProcess;
