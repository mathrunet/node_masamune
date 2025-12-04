/**
 * GitHub Analysis Storage Utilities
 *
 * Firebase Storageを使用したGitHub分析データの読み書きユーティリティ。
 * Firestoreの代わりに1つのJSONファイルにすべてのデータを保存することでコストを削減。
 */

import * as admin from "firebase-admin";
import {
    GitHubAnalysisState,
    FrameworkInfo,
    FolderBatch,
} from "../models";

/**
 * File summary stored in JSON.
 */
export interface StoredFileSummary {
    path: string;
    language?: string;
    summary: string;
    features?: string[];
    analyzedAt: string;
}

/**
 * Folder summary stored in JSON.
 */
export interface StoredFolderSummary {
    path: string;
    summary: string;
    features: string[];
    fileCount: number;
    analyzedAt: string;
}

/**
 * Complete GitHub analysis data stored in a single JSON file.
 */
export interface GitHubAnalysisData {
    /** Processing state */
    state: {
        phase: "initializing" | "processing" | "completed" | "failed";
        repository: string;
        repositoryPath: string;
        framework?: FrameworkInfo;
        totalFiles: number;
        processedFiles: number;
        filePaths: string[];
        folderPaths: string[];
        folderBatches?: FolderBatch[];
        currentBatchIndex: number;
        batchSize: number;
        error?: string;
        updatedAt: string;
    };

    /** File analysis results (keyed by path) */
    files: { [path: string]: StoredFileSummary };

    /** Folder analysis results (keyed by path) */
    folders: { [path: string]: StoredFolderSummary };
}

/**
 * Get the Storage file path for a project's GitHub analysis.
 */
export function getStoragePath(projectId: string): string {
    return `assets/${projectId}/github_analysis.json`;
}

/**
 * Read GitHub analysis data from Firebase Storage.
 *
 * @param projectId - The project ID
 * @returns The analysis data, or null if not found
 */
export async function readAnalysisData(
    projectId: string
): Promise<GitHubAnalysisData | null> {
    const storageBucket = process.env.STORAGE_BUCKET ||
        `${process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "unknown"}.appspot.com`;

    const bucket = admin.storage().bucket(storageBucket);
    const filePath = getStoragePath(projectId);
    const file = bucket.file(filePath);

    try {
        const [exists] = await file.exists();
        if (!exists) {
            console.log(`GitHubAnalysisStorage: File not found: ${filePath}`);
            return null;
        }

        const [content] = await file.download();
        const data = JSON.parse(content.toString("utf-8")) as GitHubAnalysisData;
        console.log(`GitHubAnalysisStorage: Loaded data from ${filePath}`);
        return data;
    } catch (error: any) {
        console.error(`GitHubAnalysisStorage: Failed to read ${filePath}:`, error.message);
        return null;
    }
}

/**
 * Write GitHub analysis data to Firebase Storage.
 *
 * @param projectId - The project ID
 * @param data - The analysis data to write
 */
export async function writeAnalysisData(
    projectId: string,
    data: GitHubAnalysisData
): Promise<void> {
    const storageBucket = process.env.STORAGE_BUCKET ||
        `${process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "unknown"}.appspot.com`;

    const bucket = admin.storage().bucket(storageBucket);
    const filePath = getStoragePath(projectId);
    const file = bucket.file(filePath);

    // Update timestamp
    data.state.updatedAt = new Date().toISOString();

    const jsonContent = JSON.stringify(data, null, 2);

    await file.save(jsonContent, {
        contentType: "application/json",
        metadata: {
            cacheControl: "no-cache",
        },
    });

    console.log(`GitHubAnalysisStorage: Saved data to ${filePath} (${jsonContent.length} bytes)`);
}

/**
 * Create initial analysis data structure.
 *
 * @param state - Initial state from analyze_github_init
 * @returns Empty GitHubAnalysisData structure
 */
export function createInitialData(state: GitHubAnalysisState): GitHubAnalysisData {
    return {
        state: {
            phase: "processing",
            repository: state.repository,
            repositoryPath: state.repositoryPath,
            framework: state.framework,
            totalFiles: state.totalFiles,
            processedFiles: 0,
            filePaths: state.filePaths,
            folderPaths: state.folderPaths,
            folderBatches: state.folderBatches,
            currentBatchIndex: 0,
            batchSize: state.batchSize,
            updatedAt: new Date().toISOString(),
        },
        files: {},
        folders: {},
    };
}

/**
 * Delete GitHub analysis data from Firebase Storage.
 *
 * @param projectId - The project ID
 */
export async function deleteAnalysisData(projectId: string): Promise<void> {
    const storageBucket = process.env.STORAGE_BUCKET ||
        `${process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "unknown"}.appspot.com`;

    const bucket = admin.storage().bucket(storageBucket);
    const filePath = getStoragePath(projectId);
    const file = bucket.file(filePath);

    try {
        const [exists] = await file.exists();
        if (exists) {
            await file.delete();
            console.log(`GitHubAnalysisStorage: Deleted ${filePath}`);
        }
    } catch (error: any) {
        console.warn(`GitHubAnalysisStorage: Failed to delete ${filePath}:`, error.message);
    }
}
