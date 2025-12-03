import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 *
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
    /**
     * A function for collecting data from Google Play Console.
     *
     * Google Play Consoleからデータを収集するためのFunction。
     */
    collectFromGooglePlayConsole: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "collect_from_google_play_console",
            func: require("./functions/collect_from_google_play_console"),
            options: options
        }),
    /**
     * A function for collecting data from App Store Connect.
     *
     * App Store Connectからデータを収集するためのFunction。
     */
    collectFromAppStore: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "collect_from_app_store",
            func: require("./functions/collect_from_app_store"),
            options: options
        }),
    /**
     * A function for collecting data from Firebase Analytics.
     *
     * Firebase Analyticsからデータを収集するためのFunction。
     */
    collectFromFirebaseAnalytics: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "collect_from_firebase_analytics",
            func: require("./functions/collect_from_firebase_analytics"),
            options: options
        }),
    /**
     * A function for analyzing marketing data using AI (Gemini).
     *
     * AIを使用してマーケティングデータを解析するためのFunction。
     */
    analyzeMarketingData: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "analyze_marketing_data",
            func: require("./functions/analyze_marketing_data"),
            options: options
        }),
    /**
     * A function for generating marketing analytics PDF report.
     *
     * マーケティング分析PDFレポートを生成するためのFunction。
     */
    generateMarketingPdf: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "generate_marketing_pdf",
            func: require("./functions/generate_marketing_pdf"),
            options: options
        }),
    /**
     * A function for initializing GitHub repository analysis.
     *
     * GitHubリポジトリ解析を初期化するためのFunction。
     */
    analyzeGithubInit: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "analyze_github_init",
            func: require("./functions/analyze_github_init"),
            options: options
        }),
    /**
     * A function for processing a batch of GitHub files.
     *
     * GitHubファイルのバッチを処理するためのFunction。
     */
    analyzeGithubProcess: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "analyze_github_process",
            func: require("./functions/analyze_github_process"),
            options: options
        }),
    /**
     * A function for generating final GitHub repository analysis.
     *
     * GitHubリポジトリの最終解析を生成するためのFunction。
     */
    analyzeGithubSummary: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "analyze_github_summary",
            func: require("./functions/analyze_github_summary"),
            options: options
        }),
} as const;
