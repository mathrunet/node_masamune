/**
 * GitHub Content API Client
 *
 * Fetches repository contents for code analysis:
 * - Directory listings
 * - File contents
 * - Repository tree structure
 *
 * @see https://docs.github.com/en/rest/repos/contents
 */

import {
    GitHubContentClientConfig,
    GitHubContentItem,
    GitHubTreeItem,
    EXCLUDED_PATHS,
    EXCLUDED_PATTERNS,
    BINARY_EXTENSIONS,
} from "../models";

// Re-export types for backward compatibility
export {
    GitHubContentClientConfig,
    GitHubContentItem,
    GitHubTreeItem,
};

/**
 * Maximum retries for API calls.
 */
const MAX_RETRIES = 3;

/**
 * Initial retry delay in milliseconds.
 */
const INITIAL_RETRY_DELAY = 1000;

/**
 * GitHub API base URL.
 */
const GITHUB_API_BASE = "https://api.github.com";

/**
 * GitHub API error class.
 */
class GitHubApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public headers: Headers
    ) {
        super(message);
        this.name = "GitHubApiError";
    }
}

/**
 * GitHub Content API Client for repository analysis.
 */
export class GitHubContentClient {
    private token: string;
    private owner: string;
    private repo: string;

    constructor(config: GitHubContentClientConfig) {
        this.token = config.token;

        const [owner, repo] = config.repo.split("/");
        if (!owner || !repo) {
            throw new Error(`Invalid repository format: ${config.repo}. Expected "owner/repo"`);
        }
        this.owner = owner;
        this.repo = repo;
    }

    /**
     * Make a GitHub API request.
     */
    private async request<T>(endpoint: string): Promise<T> {
        const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
            headers: {
                "Authorization": `Bearer ${this.token}`,
                "Accept": "application/vnd.github.v3+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });

        if (!response.ok) {
            throw new GitHubApiError(
                `GitHub API error: ${response.status} ${response.statusText}`,
                response.status,
                response.headers
            );
        }

        return response.json() as Promise<T>;
    }

    /**
     * Execute with retry logic.
     */
    private async withRetry<T>(operation: () => Promise<T>, retries: number = MAX_RETRIES): Promise<T> {
        let lastError: Error | null = null;

        for (let i = 0; i < retries; i++) {
            try {
                return await operation();
            } catch (error: any) {
                lastError = error;

                // Don't retry on 404 (not found)
                if (error.status === 404) {
                    throw error;
                }

                // Rate limit - wait longer
                if (error.status === 403 && error.headers?.get?.("x-ratelimit-remaining") === "0") {
                    const resetTime = parseInt(error.headers?.get?.("x-ratelimit-reset") || "0", 10);
                    const waitTime = resetTime ? (resetTime * 1000 - Date.now()) : 60000;
                    console.warn(`Rate limited. Waiting ${Math.ceil(waitTime / 1000)}s before retry...`);
                    await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 60000)));
                    continue;
                }

                // Exponential backoff for other errors
                if (i < retries - 1) {
                    const delay = INITIAL_RETRY_DELAY * Math.pow(2, i);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError || new Error("Operation failed after retries");
    }

    /**
     * Get repository information.
     */
    async getRepositoryInfo(): Promise<{
        defaultBranch: string;
        fullName: string;
        description: string | null;
    }> {
        return this.withRetry(async () => {
            const data = await this.request<{
                default_branch: string;
                full_name: string;
                description: string | null;
            }>(`/repos/${this.owner}/${this.repo}`);

            return {
                defaultBranch: data.default_branch,
                fullName: data.full_name,
                description: data.description,
            };
        });
    }

    /**
     * Get directory contents at a specific path.
     */
    async getDirectoryContents(path: string = ""): Promise<GitHubContentItem[]> {
        return this.withRetry(async () => {
            const endpoint = path
                ? `/repos/${this.owner}/${this.repo}/contents/${path}`
                : `/repos/${this.owner}/${this.repo}/contents`;

            const data = await this.request<Array<{
                name: string;
                path: string;
                sha: string;
                size: number;
                type: string;
                url: string;
                download_url: string | null;
            }>>(endpoint);

            if (!Array.isArray(data)) {
                throw new Error(`Path is not a directory: ${path}`);
            }

            return data.map(item => ({
                name: item.name,
                path: item.path,
                sha: item.sha,
                size: item.size || 0,
                type: item.type as "file" | "dir" | "submodule" | "symlink",
                url: item.url,
                downloadUrl: item.download_url || undefined,
            }));
        });
    }

    /**
     * Get file content (for files under 1MB).
     */
    async getFileContent(path: string): Promise<string> {
        return this.withRetry(async () => {
            const data = await this.request<{
                type: string;
                content?: string;
                encoding?: string;
            }>(`/repos/${this.owner}/${this.repo}/contents/${path}`);

            if (Array.isArray(data)) {
                throw new Error(`Path is a directory: ${path}`);
            }

            if (data.type !== "file") {
                throw new Error(`Path is not a file: ${path} (type: ${data.type})`);
            }

            if (!data.content) {
                throw new Error(`No content available for: ${path}`);
            }

            // Content is base64 encoded
            return Buffer.from(data.content, "base64").toString("utf-8");
        });
    }

    /**
     * Get file content via Blob API (for larger files).
     */
    async getFileContentViaBlob(sha: string): Promise<string> {
        return this.withRetry(async () => {
            const data = await this.request<{
                content: string;
                encoding: string;
            }>(`/repos/${this.owner}/${this.repo}/git/blobs/${sha}`);

            if (data.encoding === "base64") {
                return Buffer.from(data.content, "base64").toString("utf-8");
            }

            return data.content;
        });
    }

    /**
     * Get repository tree recursively.
     */
    async getRepositoryTree(basePath: string = ""): Promise<GitHubTreeItem[]> {
        return this.withRetry(async () => {
            const repoInfo = await this.getRepositoryInfo();

            const data = await this.request<{
                tree: Array<{
                    path?: string;
                    mode?: string;
                    type?: string;
                    sha?: string;
                    size?: number;
                    url?: string;
                }>;
            }>(`/repos/${this.owner}/${this.repo}/git/trees/${repoInfo.defaultBranch}?recursive=1`);

            let items = data.tree.map(item => ({
                path: item.path || "",
                mode: item.mode || "",
                type: item.type as "blob" | "tree",
                sha: item.sha || "",
                size: item.size,
                url: item.url || "",
            }));

            // Filter by base path if specified
            if (basePath) {
                const normalizedBase = basePath.endsWith("/") ? basePath : basePath + "/";
                items = items.filter(item =>
                    item.path.startsWith(normalizedBase) || item.path === basePath
                );
            }

            return items;
        });
    }

    /**
     * Get filtered file list for analysis.
     * Excludes binary files, generated files, and common non-source directories.
     */
    async getFilteredFileList(basePath: string = ""): Promise<string[]> {
        const tree = await this.getRepositoryTree(basePath);

        return tree
            .filter(item => item.type === "blob")
            .map(item => item.path)
            .filter(path => this.shouldIncludeFile(path));
    }

    /**
     * Check if a file should be included in analysis.
     */
    shouldIncludeFile(path: string): boolean {
        const parts = path.split("/");

        // Check excluded directories
        for (const part of parts) {
            if (EXCLUDED_PATHS.includes(part)) {
                return false;
            }
        }

        // Check excluded patterns
        for (const pattern of EXCLUDED_PATTERNS) {
            if (pattern.test(path)) {
                return false;
            }
        }

        // Check binary extensions
        const ext = this.getExtension(path);
        if (BINARY_EXTENSIONS.includes(ext.toLowerCase())) {
            return false;
        }

        return true;
    }

    /**
     * Get file extension.
     */
    private getExtension(path: string): string {
        const lastDot = path.lastIndexOf(".");
        if (lastDot === -1) return "";
        return path.substring(lastDot);
    }

    /**
     * Get folder paths from file list.
     */
    getFolderPaths(filePaths: string[]): string[] {
        const folders = new Set<string>();

        for (const filePath of filePaths) {
            const parts = filePath.split("/");
            // Build all parent folder paths
            for (let i = 1; i < parts.length; i++) {
                folders.add(parts.slice(0, i).join("/"));
            }
        }

        // Sort by depth (deepest first for bottom-up processing)
        return Array.from(folders).sort((a, b) => {
            const depthA = a.split("/").length;
            const depthB = b.split("/").length;
            return depthB - depthA;
        });
    }

    /**
     * Get files in a specific folder.
     */
    getFilesInFolder(filePaths: string[], folderPath: string): string[] {
        const prefix = folderPath ? folderPath + "/" : "";
        return filePaths.filter(path => {
            if (!path.startsWith(prefix)) return false;
            // Only direct children (no nested folders)
            const relativePath = path.substring(prefix.length);
            return !relativePath.includes("/");
        });
    }

    /**
     * Detect framework from repository.
     */
    async detectFramework(basePath: string = ""): Promise<{
        framework: string;
        platforms: string[];
        configFile?: string;
        configContent?: string;
    }> {
        const tree = await this.getRepositoryTree(basePath);
        const files = tree.filter(t => t.type === "blob").map(t => t.path);
        const dirs = tree.filter(t => t.type === "tree").map(t => t.path);

        const prefix = basePath ? basePath + "/" : "";

        // Check for Flutter (pubspec.yaml)
        const pubspecPath = files.find(f =>
            f === prefix + "pubspec.yaml" || f === "pubspec.yaml"
        );
        if (pubspecPath) {
            const platforms: string[] = [];
            if (dirs.some(d => d === prefix + "android" || d === "android")) platforms.push("android");
            if (dirs.some(d => d === prefix + "ios" || d === "ios")) platforms.push("ios");
            if (dirs.some(d => d === prefix + "web" || d === "web")) platforms.push("web");
            if (dirs.some(d => d === prefix + "macos" || d === "macos")) platforms.push("macos");
            if (dirs.some(d => d === prefix + "windows" || d === "windows")) platforms.push("windows");
            if (dirs.some(d => d === prefix + "linux" || d === "linux")) platforms.push("linux");

            try {
                const content = await this.getFileContent(pubspecPath);
                return {
                    framework: "flutter",
                    platforms: platforms.length > 0 ? platforms : ["android", "ios"],
                    configFile: pubspecPath,
                    configContent: content,
                };
            } catch {
                return {
                    framework: "flutter",
                    platforms: platforms.length > 0 ? platforms : ["android", "ios"],
                    configFile: pubspecPath,
                };
            }
        }

        // Check for Node.js (package.json)
        const packagePath = files.find(f =>
            f === prefix + "package.json" || f === "package.json"
        );
        if (packagePath) {
            try {
                const content = await this.getFileContent(packagePath);
                const pkg = JSON.parse(content);
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };

                // React Native / Expo
                if (deps["react-native"] || deps["expo"]) {
                    return {
                        framework: deps["expo"] ? "expo" : "react-native",
                        platforms: ["android", "ios"],
                        configFile: packagePath,
                        configContent: content,
                    };
                }

                // Next.js
                if (deps["next"]) {
                    return {
                        framework: "nextjs",
                        platforms: ["web"],
                        configFile: packagePath,
                        configContent: content,
                    };
                }

                // React
                if (deps["react"]) {
                    return {
                        framework: "react",
                        platforms: ["web"],
                        configFile: packagePath,
                        configContent: content,
                    };
                }

                // Vue
                if (deps["vue"]) {
                    return {
                        framework: "vue",
                        platforms: ["web"],
                        configFile: packagePath,
                        configContent: content,
                    };
                }

                // Generic Node.js
                return {
                    framework: "nodejs",
                    platforms: ["server"],
                    configFile: packagePath,
                    configContent: content,
                };
            } catch {
                return {
                    framework: "nodejs",
                    platforms: ["server"],
                    configFile: packagePath,
                };
            }
        }

        // Check for Python
        const pythonConfig = files.find(f =>
            f === prefix + "pyproject.toml" ||
            f === prefix + "setup.py" ||
            f === prefix + "requirements.txt" ||
            f === "pyproject.toml" ||
            f === "setup.py" ||
            f === "requirements.txt"
        );
        if (pythonConfig) {
            try {
                const content = await this.getFileContent(pythonConfig);
                return {
                    framework: "python",
                    platforms: ["server"],
                    configFile: pythonConfig,
                    configContent: content,
                };
            } catch {
                return {
                    framework: "python",
                    platforms: ["server"],
                    configFile: pythonConfig,
                };
            }
        }

        // Check for Rust
        const cargoPath = files.find(f =>
            f === prefix + "Cargo.toml" || f === "Cargo.toml"
        );
        if (cargoPath) {
            try {
                const content = await this.getFileContent(cargoPath);
                return {
                    framework: "rust",
                    platforms: ["native"],
                    configFile: cargoPath,
                    configContent: content,
                };
            } catch {
                return {
                    framework: "rust",
                    platforms: ["native"],
                    configFile: cargoPath,
                };
            }
        }

        // Check for Go
        const goModPath = files.find(f =>
            f === prefix + "go.mod" || f === "go.mod"
        );
        if (goModPath) {
            try {
                const content = await this.getFileContent(goModPath);
                return {
                    framework: "go",
                    platforms: ["server"],
                    configFile: goModPath,
                    configContent: content,
                };
            } catch {
                return {
                    framework: "go",
                    platforms: ["server"],
                    configFile: goModPath,
                };
            }
        }

        // Unknown framework
        return {
            framework: "unknown",
            platforms: [],
        };
    }
}
