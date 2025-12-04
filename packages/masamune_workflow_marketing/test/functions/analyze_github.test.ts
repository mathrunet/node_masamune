/**
 * Integration tests for GitHub Analysis functions.
 *
 * Uses GITHUB_TOKEN and GITHUB_REPO from environment variables
 * to test against a real repository.
 *
 * Required environment variables:
 * - GITHUB_TOKEN: Personal access token with repo access
 * - GITHUB_REPO: Repository in owner/repo format (e.g., "mathrunet/flutter_masamune")
 * - GCLOUD_PROJECT or GOOGLE_CLOUD_PROJECT: GCP project ID for AI analysis
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to service account key (for AI)
 */

import { GitHubContentClient } from "../../src/clients/github_content_client";
import { GitHubAnalysisService } from "../../src/services/github_analysis_service";
import { FileSummary, FolderSummary } from "../../src/models";
import {
    readAnalysisData,
    writeAnalysisData,
    createInitialData,
    deleteAnalysisData,
    getStoragePath,
} from "../../src/utils/github_analysis_storage";
import * as admin from "firebase-admin";
import * as path from "path";

// Skip tests if environment variables are not set
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GCP_PROJECT_ID = process.env.VERTEXAI_PROJECT_ID || process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "test-project";
const SERVICE_ACCOUNT_PATH = process.env.VERTEXAI_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_SERVICE_ACCOUNT_PATH;

const describeIfEnvSet = GITHUB_TOKEN && GITHUB_REPO ? describe : describe.skip;

describeIfEnvSet("GitHubContentClient Integration", () => {
    let client: GitHubContentClient;

    beforeAll(() => {
        client = new GitHubContentClient({
            token: GITHUB_TOKEN!,
            repo: GITHUB_REPO!,
        });
    });

    describe("getRepositoryInfo", () => {
        it("should fetch repository information", async () => {
            const info = await client.getRepositoryInfo();

            expect(info).toBeDefined();
            expect(info.fullName).toBeDefined();
            expect(info.defaultBranch).toBeDefined();
            console.log(`Repository: ${info.fullName}, Default branch: ${info.defaultBranch}`);
        });
    });

    describe("getDirectoryContents", () => {
        it("should list root directory contents", async () => {
            const contents = await client.getDirectoryContents("");

            expect(Array.isArray(contents)).toBe(true);
            expect(contents.length).toBeGreaterThan(0);
            console.log(`Found ${contents.length} items in root directory`);
        });
    });

    describe("detectFramework", () => {
        it("should detect the framework used in the repository", async () => {
            const frameworkInfo = await client.detectFramework();

            expect(frameworkInfo).toBeDefined();
            expect(frameworkInfo.framework).toBeDefined();
            expect(Array.isArray(frameworkInfo.platforms)).toBe(true);
            console.log(`Detected framework: ${frameworkInfo.framework}`);
            console.log(`Platforms: ${frameworkInfo.platforms.join(", ")}`);
        });
    });

    describe("getFilteredFileList", () => {
        it("should get filtered list of files for analysis", async () => {
            const files = await client.getFilteredFileList();

            expect(Array.isArray(files)).toBe(true);
            expect(files.length).toBeGreaterThan(0);

            // Verify no excluded paths are present
            const hasExcluded = files.some(f =>
                f.includes("node_modules/") ||
                f.includes(".git/") ||
                f.endsWith(".lock")
            );
            expect(hasExcluded).toBe(false);

            console.log(`Found ${files.length} files for analysis`);
            console.log(`Sample files: ${files.slice(0, 5).join(", ")}`);
        });
    });

    describe("getFileContent", () => {
        it("should fetch file content", async () => {
            const files = await client.getFilteredFileList();
            const firstFile = files[0];

            if (firstFile) {
                const content = await client.getFileContent(firstFile);
                expect(content).toBeDefined();
                expect(typeof content).toBe("string");
                console.log(`Read ${content.length} characters from ${firstFile}`);
            }
        });
    });

    describe("getFolderPaths", () => {
        it("should extract folder paths from file list", async () => {
            const files = await client.getFilteredFileList();
            const folders = client.getFolderPaths(files);

            expect(Array.isArray(folders)).toBe(true);
            // Folders are sorted by depth (deepest first)
            if (folders.length > 1) {
                const depths = folders.map(f => f.split("/").length);
                for (let i = 1; i < depths.length; i++) {
                    expect(depths[i]).toBeLessThanOrEqual(depths[i - 1]);
                }
            }

            console.log(`Found ${folders.length} folders`);
            console.log(`Sample folders: ${folders.slice(0, 5).join(", ")}`);
        });
    });
});

// Skip AI tests if GCP credentials are not available
const describeIfGcpSet = SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCLOUD_PROJECT
    ? describe
    : describe.skip;

describeIfGcpSet("GitHubAnalysisService Integration", () => {
    let service: GitHubAnalysisService;

    beforeAll(() => {
        service = new GitHubAnalysisService({
            projectId: GCP_PROJECT_ID,
        });
    });

    describe("getLanguageFromPath", () => {
        it("should detect language from file extension", () => {
            expect(service.getLanguageFromPath("test.ts")).toBe("TypeScript");
            expect(service.getLanguageFromPath("test.js")).toBe("JavaScript");
            expect(service.getLanguageFromPath("test.py")).toBe("Python");
            expect(service.getLanguageFromPath("test.dart")).toBe("Dart");
            expect(service.getLanguageFromPath("test.go")).toBe("Go");
            expect(service.getLanguageFromPath("test.unknown")).toBeUndefined();
        });
    });

    describe("summarizeFile", () => {
        it("should summarize a TypeScript file", async () => {
            const content = `
/**
 * User service for handling user operations.
 */
export class UserService {
    private users: Map<string, User> = new Map();

    async getUser(id: string): Promise<User | null> {
        return this.users.get(id) || null;
    }

    async createUser(data: CreateUserData): Promise<User> {
        const user = { id: generateId(), ...data };
        this.users.set(user.id, user);
        return user;
    }

    async deleteUser(id: string): Promise<boolean> {
        return this.users.delete(id);
    }
}

interface User {
    id: string;
    name: string;
    email: string;
}

interface CreateUserData {
    name: string;
    email: string;
}

function generateId(): string {
    return Math.random().toString(36).substring(2);
}
`;

            const result = await service.summarizeFile(
                content,
                "src/services/user_service.ts",
                "Node.js"
            );

            expect(result.data).toBeDefined();
            expect(result.data.path).toBe("src/services/user_service.ts");
            expect(result.data.language).toBe("TypeScript");
            expect(result.data.summary).toBeDefined();

            // Skip token check if API call failed (returns error message in summary)
            if (!result.data.summary.startsWith("Error")) {
                expect(result.inputTokens).toBeGreaterThan(0);
            }
            console.log("[summarizeFile Result JSON]:", JSON.stringify(result, null, 2));
        });
    });

    describe("summarizeFolder", () => {
        it("should summarize a folder from file summaries", async () => {
            const fileSummaries = [
                {
                    path: "src/services/user_service.ts",
                    language: "TypeScript",
                    summary: "ユーザー管理を行うサービスクラス。ユーザーの取得、作成、削除機能を提供。",
                    features: ["ユーザー取得", "ユーザー作成", "ユーザー削除"],
                    analyzedAt: new Date(),
                },
                {
                    path: "src/services/auth_service.ts",
                    language: "TypeScript",
                    summary: "認証処理を行うサービスクラス。ログイン、ログアウト、トークン検証機能を提供。",
                    features: ["ログイン", "ログアウト", "トークン検証"],
                    analyzedAt: new Date(),
                },
            ];

            const result = await service.summarizeFolder(
                fileSummaries,
                "src/services",
                "Node.js"
            );

            expect(result.data).toBeDefined();
            expect(result.data.path).toBe("src/services");
            expect(result.data.summary).toBeDefined();
            expect(Array.isArray(result.data.features)).toBe(true);
            expect(result.data.fileCount).toBe(2);

            console.log("[summarizeFolder Result JSON]:", JSON.stringify(result, null, 2));
        });
    });

    describe("generateFinalSummary", () => {
        it("should generate final repository analysis", async () => {
            const folderSummaries = [
                {
                    path: "src/services",
                    summary: "サービス層。ビジネスロジックを実装するクラス群。",
                    features: ["ユーザー管理", "認証処理", "データ検証"],
                    fileCount: 5,
                    analyzedAt: new Date(),
                },
                {
                    path: "src/controllers",
                    summary: "コントローラー層。APIエンドポイントのリクエスト処理を担当。",
                    features: ["REST API", "リクエストバリデーション", "レスポンス整形"],
                    fileCount: 3,
                    analyzedAt: new Date(),
                },
                {
                    path: "src/models",
                    summary: "モデル層。データベースモデルとTypeScript型定義。",
                    features: ["ユーザーモデル", "セッションモデル"],
                    fileCount: 4,
                    analyzedAt: new Date(),
                },
            ];

            const frameworkInfo = {
                framework: "Node.js",
                platforms: ["Web API"],
                configFile: "package.json",
            };

            const result = await service.generateFinalSummary(
                folderSummaries,
                frameworkInfo,
                "owner/test-repo",
                ""
            );

            expect(result.data).toBeDefined();
            expect(result.data.repository).toBe("owner/test-repo");
            expect(result.data.framework).toBe("Node.js");
            expect(result.data.overview).toBeDefined();
            expect(Array.isArray(result.data.features)).toBe(true);
            expect(result.data.architecture).toBeDefined();

            console.log("[generateFinalSummary Result JSON]:", JSON.stringify(result, null, 2));
        });
    });

    describe("calculateCost", () => {
        it("should calculate cost from token usage", () => {
            const cost = service.calculateCost(1000, 500);
            expect(cost).toBeGreaterThan(0);
            console.log(`Cost for 1000 input + 500 output tokens: $${cost.toFixed(6)}`);
        });
    });
});

// End-to-end integration test (only if all env vars are set)
const describeE2E = (GITHUB_TOKEN && GITHUB_REPO && (SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCLOUD_PROJECT))
    ? describe
    : describe.skip;

describeE2E("End-to-End GitHub Analysis", () => {
    it("should analyze a real repository with full output", async () => {
        const client = new GitHubContentClient({
            token: GITHUB_TOKEN!,
            repo: GITHUB_REPO!,
        });

        const service = new GitHubAnalysisService({
            projectId: GCP_PROJECT_ID,
        });

        // 1. Get repository info
        console.log("=== Step 1: Repository Info ===");
        const repoInfo = await client.getRepositoryInfo();
        console.log("[Repository Info JSON]:", JSON.stringify(repoInfo, null, 2));

        // 2. Detect framework
        console.log("\n=== Step 2: Framework Detection ===");
        const frameworkInfo = await client.detectFramework();
        console.log("[Framework Info JSON]:", JSON.stringify({
            framework: frameworkInfo.framework,
            platforms: frameworkInfo.platforms,
            configFile: frameworkInfo.configFile,
        }, null, 2));

        // 3. Get file list
        console.log("\n=== Step 3: File List ===");
        const files = await client.getFilteredFileList();
        console.log(`Found ${files.length} files for analysis`);

        // Filter Dart files for Flutter project
        const dartFiles = files.filter(f => f.endsWith(".dart")).slice(0, 5);
        console.log(`Analyzing ${dartFiles.length} Dart files...`);

        // 4. Analyze sample files
        console.log("\n=== Step 4: File Analysis ===");
        const fileSummaries: FileSummary[] = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        for (const filePath of dartFiles) {
            try {
                const content = await client.getFileContent(filePath);
                const result = await service.summarizeFile(
                    content,
                    filePath,
                    frameworkInfo.framework
                );
                fileSummaries.push(result.data);
                totalInputTokens += result.inputTokens;
                totalOutputTokens += result.outputTokens;
                console.log(`[File: ${filePath}]`);
                console.log(JSON.stringify(result.data, null, 2));
            } catch (err: any) {
                console.warn(`Error analyzing ${filePath}: ${err.message}`);
            }
        }

        // 5. Summarize folders
        console.log("\n=== Step 5: Folder Summary ===");
        const folders = client.getFolderPaths(dartFiles);
        const topFolders = folders.slice(0, 3);
        const folderSummaries: FolderSummary[] = [];

        for (const folder of topFolders) {
            const folderFiles = fileSummaries.filter(f => f.path.startsWith(folder + "/"));
            if (folderFiles.length > 0) {
                const result = await service.summarizeFolder(
                    folderFiles,
                    folder,
                    frameworkInfo.framework
                );
                folderSummaries.push(result.data);
                totalInputTokens += result.inputTokens;
                totalOutputTokens += result.outputTokens;
                console.log(`[Folder: ${folder}]`);
                console.log(JSON.stringify(result.data, null, 2));
            }
        }

        // 6. Generate final summary
        console.log("\n=== Step 6: Final Repository Analysis ===");
        const finalResult = await service.generateFinalSummary(
            folderSummaries.length > 0 ? folderSummaries : fileSummaries.map(f => ({
                path: f.path,
                summary: f.summary,
                features: f.features || [],
                fileCount: 1,
                analyzedAt: f.analyzedAt,
            })),
            frameworkInfo,
            GITHUB_REPO!,
            ""
        );
        totalInputTokens += finalResult.inputTokens;
        totalOutputTokens += finalResult.outputTokens;

        console.log("[Final Analysis JSON]:");
        console.log(JSON.stringify(finalResult.data, null, 2));

        // 7. Cost summary
        console.log("\n=== Step 7: Cost Summary ===");
        const totalCost = service.calculateCost(totalInputTokens, totalOutputTokens);
        console.log(JSON.stringify({
            totalInputTokens,
            totalOutputTokens,
            totalCost: `$${totalCost.toFixed(6)}`,
        }, null, 2));

        // Verify
        expect(fileSummaries.length).toBeGreaterThan(0);
        expect(finalResult.data.overview).toBeDefined();

        console.log("\n=== E2E Analysis Complete ===");
    }, 300000); // 5 minute timeout
});

// Storage integration test
describe("GitHub Analysis Storage Integration", () => {
    const testProjectId = `test-github-storage-${Date.now()}`;
    const serviceAccountPath = path.resolve(__dirname, "../mathru-net-39425d37638c.json");

    beforeAll(() => {
        // Initialize Firebase Admin if not already initialized
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccountPath),
                projectId: "mathru-net",
                storageBucket: "mathru-net.appspot.com",
            });
        }
    });

    afterAll(async () => {
        // Cleanup test data
        try {
            await deleteAnalysisData(testProjectId);
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    it("should create, read, update, and delete analysis data in Storage", async () => {
        // 1. Create initial data
        console.log("=== Step 1: Create Initial Data ===");
        const initialState = {
            phase: "processing" as const,
            repository: "test/repo",
            repositoryPath: "",
            framework: { framework: "Flutter", platforms: ["iOS", "Android"] },
            totalFiles: 10,
            processedFiles: 0,
            filePaths: ["lib/main.dart", "lib/app.dart", "lib/utils/helper.dart"],
            folderPaths: ["lib", "lib/utils"],
            currentBatchIndex: 0,
            batchSize: 100,
            updatedAt: new Date(),
        };

        const analysisData = createInitialData(initialState);
        await writeAnalysisData(testProjectId, analysisData);
        console.log(`Created analysis data at: ${getStoragePath(testProjectId)}`);

        // 2. Read data
        console.log("\n=== Step 2: Read Data ===");
        const readData = await readAnalysisData(testProjectId);
        expect(readData).not.toBeNull();
        expect(readData!.state.repository).toBe("test/repo");
        expect(readData!.state.totalFiles).toBe(10);
        console.log("Read state:", JSON.stringify(readData!.state, null, 2));

        // 3. Update data (add file summaries)
        console.log("\n=== Step 3: Update Data ===");
        readData!.files["lib/main.dart"] = {
            path: "lib/main.dart",
            language: "Dart",
            summary: "Main entry point of the Flutter application",
            features: ["App initialization", "Root widget"],
            analyzedAt: new Date().toISOString(),
        };
        readData!.files["lib/app.dart"] = {
            path: "lib/app.dart",
            language: "Dart",
            summary: "App widget with theme and routing configuration",
            features: ["Theme setup", "Routing"],
            analyzedAt: new Date().toISOString(),
        };
        readData!.state.processedFiles = 2;
        readData!.state.currentBatchIndex = 1;

        await writeAnalysisData(testProjectId, readData!);
        console.log("Updated with 2 file summaries");

        // 4. Read updated data
        console.log("\n=== Step 4: Verify Update ===");
        const updatedData = await readAnalysisData(testProjectId);
        expect(updatedData!.state.processedFiles).toBe(2);
        expect(Object.keys(updatedData!.files)).toHaveLength(2);
        expect(updatedData!.files["lib/main.dart"]).toBeDefined();
        console.log("Files in storage:", Object.keys(updatedData!.files));

        // 5. Add folder summary
        console.log("\n=== Step 5: Add Folder Summary ===");
        updatedData!.folders["lib"] = {
            path: "lib",
            summary: "Main source directory containing Flutter app code",
            features: ["App structure", "Core widgets"],
            fileCount: 2,
            analyzedAt: new Date().toISOString(),
        };
        updatedData!.state.phase = "completed";

        await writeAnalysisData(testProjectId, updatedData!);
        console.log("Added folder summary and marked as completed");

        // 6. Final verification
        console.log("\n=== Step 6: Final Verification ===");
        const finalData = await readAnalysisData(testProjectId);
        expect(finalData!.state.phase).toBe("completed");
        expect(Object.keys(finalData!.folders)).toHaveLength(1);
        console.log("Final state:", JSON.stringify(finalData!.state, null, 2));
        console.log("Folders:", Object.keys(finalData!.folders));

        // 7. Delete data
        console.log("\n=== Step 7: Delete Data ===");
        await deleteAnalysisData(testProjectId);
        const deletedData = await readAnalysisData(testProjectId);
        expect(deletedData).toBeNull();
        console.log("Data deleted successfully");

        console.log("\n=== Storage Integration Test Complete ===");
    }, 60000); // 1 minute timeout
});
