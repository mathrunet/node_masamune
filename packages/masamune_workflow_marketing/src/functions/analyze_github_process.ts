/**
 * GitHub Analysis Process Function
 *
 * Processes a batch of files:
 * 1. Reads batch of files from GitHub
 * 2. Generates AI summaries for each file
 * 3. Caches summaries in Firestore
 * 4. Generates folder summaries when all files in folder are done
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
    GitHubAnalysisState,
    GitHubFileCacheEntry,
    GitHubFolderCacheEntry,
    FileSummary,
} from "../models";

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
        const firestore = admin.firestore();

        const projectId = projectRef.id;

        try {
            // 1. Load state from Firestore
            const stateRef = firestore.doc(`plugins/workflow/github_analysis/${projectId}/state/current`);
            const stateDoc = await stateRef.get();

            if (!stateDoc.exists) {
                throw new Error("Analysis state not found. Run init first.");
            }

            const state = stateDoc.data() as GitHubAnalysisState;

            // 2. Get GitHub token from project
            const projectDoc = await projectRef.get();
            const projectData = projectDoc.data() as Project | undefined;
            const githubToken = projectData?.github_personal_access_token;

            if (!githubToken) {
                throw new Error("No GitHub token in project");
            }

            // 3. Initialize clients
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

            // 4. Calculate batch range
            const batchSize = state.batchSize;
            const startIndex = batchIndex * batchSize;
            const endIndex = Math.min(startIndex + batchSize, state.filePaths.length);
            const batchFiles = state.filePaths.slice(startIndex, endIndex);

            console.log(`AnalyzeGitHubProcess: Processing batch ${batchIndex}, files ${startIndex}-${endIndex - 1}`);

            // 5. Process each file
            let totalInputTokens = 0;
            let totalOutputTokens = 0;
            const processedSummaries: FileSummary[] = [];

            for (const filePath of batchFiles) {
                try {
                    // Check if already cached
                    const encodedPath = encodeURIComponent(filePath);
                    const cacheRef = firestore.doc(`plugins/workflow/github_analysis/${projectId}/files/${encodedPath}`);
                    const cacheDoc = await cacheRef.get();

                    if (cacheDoc.exists) {
                        console.log(`AnalyzeGitHubProcess: File ${filePath} already cached, skipping`);
                        const cached = cacheDoc.data() as GitHubFileCacheEntry;
                        processedSummaries.push({
                            path: cached.path,
                            language: cached.language,
                            summary: cached.summary,
                            features: cached.features,
                            analyzedAt: cached.analyzedAt,
                        });
                        continue;
                    }

                    // Get file content
                    console.log(`AnalyzeGitHubProcess: Reading ${filePath}...`);
                    let content: string;
                    try {
                        content = await githubClient.getFileContent(filePath);
                    } catch (err: any) {
                        console.warn(`AnalyzeGitHubProcess: Failed to read ${filePath}: ${err.message}`);
                        // Save error entry
                        const errorEntry: GitHubFileCacheEntry = {
                            path: filePath,
                            type: "file",
                            summary: `Error reading file: ${err.message}`,
                            analyzedAt: new Date(),
                        };
                        await cacheRef.set(errorEntry);
                        continue;
                    }

                    // Generate summary
                    console.log(`AnalyzeGitHubProcess: Summarizing ${filePath}...`);
                    const result = await analysisService.summarizeFile(
                        content,
                        filePath,
                        state.framework?.framework || "unknown"
                    );

                    totalInputTokens += result.inputTokens;
                    totalOutputTokens += result.outputTokens;

                    // Save to cache
                    const cacheEntry: GitHubFileCacheEntry = {
                        path: filePath,
                        type: "file",
                        language: result.data.language,
                        summary: result.data.summary,
                        features: result.data.features,
                        analyzedAt: result.data.analyzedAt,
                    };
                    await cacheRef.set(cacheEntry);

                    processedSummaries.push(result.data);

                } catch (err: any) {
                    console.error(`AnalyzeGitHubProcess: Error processing ${filePath}:`, err.message);
                }
            }

            // 6. Update state
            const newProcessedCount = state.processedFiles + batchFiles.length;
            await stateRef.update({
                processedFiles: newProcessedCount,
                currentBatchIndex: batchIndex + 1,
                updatedAt: new Date(),
            });

            // 7. Check if any folders are complete and generate folder summaries
            const completedFolders = await this.checkCompletedFolders(
                firestore,
                projectId,
                state,
                analysisService
            );

            // 8. Calculate cost
            const cost = analysisService.calculateCost(totalInputTokens, totalOutputTokens);

            // 9. Return results
            return {
                ...action,
                usage: (action.usage ?? 0) + cost,
                results: {
                    githubAnalysisProcess: {
                        batchIndex: batchIndex,
                        filesProcessed: batchFiles.length,
                        totalProcessed: newProcessedCount,
                        totalFiles: state.totalFiles,
                        foldersCompleted: completedFolders.length,
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

    /**
     * Check for completed folders and generate summaries.
     */
    private async checkCompletedFolders(
        firestore: admin.firestore.Firestore,
        projectId: string,
        state: GitHubAnalysisState,
        analysisService: GitHubAnalysisService
    ): Promise<string[]> {
        const completedFolders: string[] = [];

        // Process folders from deepest to shallowest
        for (const folderPath of state.folderPaths) {
            // Check if folder summary already exists
            const encodedFolderPath = encodeURIComponent(folderPath || "_root");
            const folderCacheRef = firestore.doc(`plugins/workflow/github_analysis/${projectId}/folders/${encodedFolderPath}`);
            const folderCacheDoc = await folderCacheRef.get();

            if (folderCacheDoc.exists) {
                continue; // Already processed
            }

            // Get all files in this folder
            const filesInFolder = state.filePaths.filter(fp => {
                const prefix = folderPath ? folderPath + "/" : "";
                if (!fp.startsWith(prefix)) return false;
                const relativePath = fp.substring(prefix.length);
                return !relativePath.includes("/"); // Direct children only
            });

            // Check if all files in folder are cached
            let allCached = true;
            const fileSummaries: FileSummary[] = [];

            for (const filePath of filesInFolder) {
                const encodedPath = encodeURIComponent(filePath);
                const cacheRef = firestore.doc(`plugins/workflow/github_analysis/${projectId}/files/${encodedPath}`);
                const cacheDoc = await cacheRef.get();

                if (!cacheDoc.exists) {
                    allCached = false;
                    break;
                }

                const cached = cacheDoc.data() as GitHubFileCacheEntry;
                fileSummaries.push({
                    path: cached.path,
                    language: cached.language,
                    summary: cached.summary,
                    features: cached.features,
                    analyzedAt: cached.analyzedAt,
                });
            }

            if (!allCached) {
                continue; // Not all files processed yet
            }

            // Generate folder summary
            console.log(`AnalyzeGitHubProcess: Generating folder summary for ${folderPath || "(root)"}`);
            const result = await analysisService.summarizeFolder(
                fileSummaries,
                folderPath,
                state.framework?.framework || "unknown"
            );

            // Save folder summary
            const folderEntry: GitHubFolderCacheEntry = {
                path: folderPath,
                type: "folder",
                summary: result.data.summary,
                features: result.data.features,
                fileCount: result.data.fileCount,
                analyzedAt: result.data.analyzedAt,
            };
            await folderCacheRef.set(folderEntry);

            completedFolders.push(folderPath);
        }

        return completedFolders;
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new AnalyzeGitHubProcess(options).build(regions);

// Export class for testing
module.exports.AnalyzeGitHubProcess = AnalyzeGitHubProcess;
