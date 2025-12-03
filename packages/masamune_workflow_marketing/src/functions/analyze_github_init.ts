/**
 * GitHub Analysis Init Function
 *
 * Initializes GitHub repository analysis:
 * 1. Scans repository structure
 * 2. Detects framework
 * 3. Creates file list for processing
 * 4. Dynamically updates task.actions
 * 5. Saves initial state to Firestore
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
} from "../models";

/**
 * Default batch size (files per action).
 */
const DEFAULT_BATCH_SIZE = 100;

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
        const firestore = admin.firestore();

        const projectDoc = await projectRef.get();
        const projectData = projectDoc.data() as Project | undefined;
        const githubToken = projectData?.github_personal_access_token;

        if (!githubToken) {
            console.error("AnalyzeGitHubInit: No GitHub token in project");
            return {
                ...action,
                results: {
                    githubAnalysis: {
                        error: "No github_personal_access_token configured in project",
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

            // 6. Get folder paths
            const folderPaths = githubClient.getFolderPaths(filePaths);
            console.log(`AnalyzeGitHubInit: Found ${folderPaths.length} folders`);

            // 7. Calculate batch count
            const batchSize = DEFAULT_BATCH_SIZE;
            const batchCount = Math.ceil(filePaths.length / batchSize);
            console.log(`AnalyzeGitHubInit: Will create ${batchCount} batches`);

            // 8. Save state to Firestore
            const projectId = projectRef.id;
            const stateRef = firestore.doc(`plugins/workflow/github_analysis/${projectId}/state/current`);

            const state: GitHubAnalysisState = {
                phase: "processing",
                repository: githubRepository,
                repositoryPath: githubRepositoryPath,
                framework: frameworkInfo as FrameworkInfo,
                totalFiles: filePaths.length,
                processedFiles: 0,
                filePaths: filePaths,
                folderPaths: folderPaths,
                currentBatchIndex: 0,
                batchSize: batchSize,
                updatedAt: new Date(),
            };

            await stateRef.set(state);
            console.log(`AnalyzeGitHubInit: State saved to Firestore`);

            // 9. Update task.actions dynamically
            const taskRef = action.task;
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
            }

            // 10. Return success
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
                        batchSize: batchSize,
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
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new AnalyzeGitHubInit(options).build(regions);

// Export class for testing
module.exports.AnalyzeGitHubInit = AnalyzeGitHubInit;
