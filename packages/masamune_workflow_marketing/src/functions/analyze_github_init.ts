/**
 * GitHub Analysis Init Function
 *
 * Initializes GitHub repository analysis:
 * 1. Scans repository structure
 * 2. Detects framework
 * 3. Creates file list for processing
 * 4. Dynamically updates task.actions
 * 5. Saves initial state to Firebase Storage (as JSON)
 */

import { HttpFunctionsOptions } from "@mathrunet/masamune";
import {
    Action,
    WorkflowProcessFunctionBase,
    WorkflowContext,
    Project,
    ActionCommand,
} from "@mathrunet/masamune_workflow";
import * as admin from "firebase-admin";
import { GitHubContentClient } from "../clients/github_content_client";
import {
    GitHubAnalysisState,
    GitHubAnalysisActionCommand,
    FrameworkInfo,
    FolderBatch,
} from "../models";
import {
    createInitialData,
    writeAnalysisData,
} from "../utils/github_analysis_storage";
import "@mathrunet/masamune";

/**
 * A function for initializing GitHub repository analysis.
 *
 * GitHubリポジトリ解析を初期化するためのFunction。
 */
export class AnalyzeGitHubInit extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     */
    id: string = "analyze_github_init";

    /**
     * Process the initialization.
     */
    async process(context: WorkflowContext): Promise<Action> {
        const action = context.action;
        const task = context.task;
        const command = action.command as GitHubAnalysisActionCommand;

        // 1. Validate input
        const githubRepository = command.githubRepository;
        const githubRepositoryPath = command.githubRepositoryPath || "";

        if (!githubRepository) {
            console.error("AnalyzeGitHubInit: No githubRepository specified");
            return {
                ...action,
                results: {
                    githubAnalysis: {
                        error: "No githubRepository specified in action command",
                    },
                },
            };
        }

        // 2. Get GitHub token from project
        const projectRef = action.project;
        if (!projectRef) {
            console.error("AnalyzeGitHubInit: No project reference");
            return {
                ...action,
                results: {
                    githubAnalysis: {
                        error: "No project reference in action",
                    },
                },
            };
        }

        // Auto-initialize Firebase Admin if needed
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }

        const projectDoc = await projectRef.load();
        const projectData = projectDoc.data() as Project | undefined;
        const githubToken = projectData?.githubPersonalAccessToken;

        if (!githubToken) {
            console.error("AnalyzeGitHubInit: No GitHub token in project");
            return {
                ...action,
                results: {
                    githubAnalysis: {
                        error: "No githubPersonalAccessToken configured in project",
                    },
                },
            };
        }

        try {
            // 3. Initialize GitHub client
            const githubClient = new GitHubContentClient({
                token: githubToken,
                repo: githubRepository,
            });

            // 4. Detect framework
            console.log(`AnalyzeGitHubInit: Detecting framework for ${githubRepository}...`);
            const frameworkInfo = await githubClient.detectFramework(githubRepositoryPath);
            console.log(`AnalyzeGitHubInit: Framework detected: ${frameworkInfo.framework}`);

            // 5. Get filtered file list
            console.log(`AnalyzeGitHubInit: Getting file list...`);
            const filePaths = await githubClient.getFilteredFileList(githubRepositoryPath);
            console.log(`AnalyzeGitHubInit: Found ${filePaths.length} files to analyze`);

            // 6. Get folder paths (sorted by depth, deepest first)
            const folderPaths = githubClient.getFolderPaths(filePaths);
            console.log(`AnalyzeGitHubInit: Found ${folderPaths.length} folders`);

            // 7. Group files by folder for batch processing
            const folderBatches = this.groupFilesByFolder(filePaths, folderPaths);
            console.log(`AnalyzeGitHubInit: Created ${folderBatches.length} folder batches`);

            // 8. Calculate batch count (one batch per folder group)
            const batchCount = folderBatches.length;
            console.log(`AnalyzeGitHubInit: Will create ${batchCount} process actions`);

            // 9. Save state to Firebase Storage
            const projectId = projectRef.id;

            const state: GitHubAnalysisState = {
                phase: "processing",
                repository: githubRepository,
                repositoryPath: githubRepositoryPath,
                framework: frameworkInfo as FrameworkInfo,
                totalFiles: filePaths.length,
                processedFiles: 0,
                filePaths: filePaths,
                folderPaths: folderPaths,
                folderBatches: folderBatches,
                currentBatchIndex: 0,
                batchSize: 0, // Not used in folder-based batching
                updatedAt: new Date(),
            };

            const analysisData = createInitialData(state);
            await writeAnalysisData(projectId, analysisData);
            console.log(`AnalyzeGitHubInit: State saved to Storage`);

            // 9. Update task.actions dynamically
            const taskRef = action.task?.ref;;
            console.log(`AnalyzeGitHubInit: action.task =`, taskRef ? taskRef.path : "undefined");
            console.log(`AnalyzeGitHubInit: task.actions length =`, task.actions?.length);
            if (taskRef) {
                await this.updateTaskActions(
                    taskRef,
                    task.actions,
                    command.index,
                    batchCount,
                    githubRepository,
                    githubRepositoryPath
                );
                console.log(`AnalyzeGitHubInit: Task actions updated`);
                // Verify update
                const updatedDoc = await taskRef.load();
                const updatedActions = updatedDoc.data()?.actions || [];
                console.log(`AnalyzeGitHubInit: Verified actions count =`, updatedActions.length);
            }

            // 11. Return success
            return {
                ...action,
                results: {
                    githubAnalysisInit: {
                        repository: githubRepository,
                        repositoryPath: githubRepositoryPath,
                        framework: frameworkInfo.framework,
                        platforms: frameworkInfo.platforms,
                        totalFiles: filePaths.length,
                        totalFolders: folderPaths.length,
                        batchCount: batchCount,
                    },
                },
            };
        } catch (error: any) {
            console.error("AnalyzeGitHubInit: Failed to initialize", error);
            return {
                ...action,
                results: {
                    githubAnalysis: {
                        error: error.message,
                    },
                },
            };
        }
    }

    /**
     * Update task.actions to include process and summary actions.
     */
    private async updateTaskActions(
        taskRef: admin.firestore.DocumentReference,
        currentActions: ActionCommand[],
        currentIndex: number,
        batchCount: number,
        githubRepository: string,
        githubRepositoryPath: string
    ): Promise<void> {
        // Create new actions array
        const newActions: ActionCommand[] = [];

        // Keep actions up to and including current (init)
        for (let i = 0; i <= currentIndex; i++) {
            newActions.push(currentActions[i]);
        }

        // Add process actions for each batch
        for (let i = 0; i < batchCount; i++) {
            newActions.push({
                command: "analyze_github_process",
                index: currentIndex + 1 + i,
                githubRepository: githubRepository,
                githubRepositoryPath: githubRepositoryPath,
                batchIndex: i,
            });
        }

        // Add summary action
        newActions.push({
            command: "analyze_github_summary",
            index: currentIndex + 1 + batchCount,
            githubRepository: githubRepository,
            githubRepositoryPath: githubRepositoryPath,
        });

        // Shift remaining actions
        const shiftAmount = batchCount + 1; // process actions + summary action
        for (let i = currentIndex + 1; i < currentActions.length; i++) {
            const action = currentActions[i];
            newActions.push({
                ...action,
                index: action.index + shiftAmount,
            });
        }

        // Update task document
        await taskRef.update({
            actions: newActions,
        });
    }

    /**
     * Group files by folder for batch processing.
     * Each folder becomes one batch (one AI call).
     * Multiple small folders may be grouped together.
     */
    private groupFilesByFolder(
        filePaths: string[],
        folderPaths: string[]
    ): FolderBatch[] {
        // Create a map of folder -> files
        const folderFileMap = new Map<string, string[]>();

        // Initialize with all folder paths
        for (const folderPath of folderPaths) {
            folderFileMap.set(folderPath, []);
        }

        // Also handle root-level files
        folderFileMap.set("", []);

        // Assign each file to its direct parent folder
        for (const filePath of filePaths) {
            const lastSlash = filePath.lastIndexOf("/");
            const folderPath = lastSlash === -1 ? "" : filePath.substring(0, lastSlash);

            if (folderFileMap.has(folderPath)) {
                folderFileMap.get(folderPath)?.push(filePath);
            } else {
                // Find the closest parent folder
                let parent = folderPath;
                while (parent && !folderFileMap.has(parent)) {
                    const parentSlash = parent.lastIndexOf("/");
                    parent = parentSlash === -1 ? "" : parent.substring(0, parentSlash);
                }
                folderFileMap.get(parent)!.push(filePath);
            }
        }

        // Convert to FolderBatch array, filtering out empty folders
        const batches: FolderBatch[] = [];

        // Sort folders by depth (shallowest first for better grouping)
        const sortedFolders = Array.from(folderFileMap.entries())
            .filter(([, files]) => files.length > 0)
            .sort((a, b) => {
                const depthA = a[0] === "" ? 0 : a[0].split("/").length;
                const depthB = b[0] === "" ? 0 : b[0].split("/").length;
                return depthA - depthB;
            });

        for (const [folderPath, files] of sortedFolders) {
            // Each folder is its own batch for simplicity
            // (can be optimized later to group small folders)
            batches.push({
                folderPath,
                files,
            });
        }

        console.log(`AnalyzeGitHubInit: Grouped into ${batches.length} folder batches`);
        return batches;
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new AnalyzeGitHubInit(options).build(regions);

// Export class for testing
module.exports.AnalyzeGitHubInit = AnalyzeGitHubInit;
