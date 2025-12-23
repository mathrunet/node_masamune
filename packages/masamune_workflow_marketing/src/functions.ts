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
     *
     * @description
     * Collects app performance metrics, reviews, and statistics from Google Play Console
     * using service account credentials configured in the project settings.
     *
     * Google Play Consoleからアプリのパフォーマンス指標、レビュー、統計情報を収集します。
     * プロジェクト設定で構成されたサービスアカウント認証情報を使用します。
     *
     * @param {ActionCommand} command - Action command parameters / アクションコマンドパラメータ
     * @param {string} command.packageName - (Required) Android package name (e.g., "com.example.app") / (必須) Androidパッケージ名 (例: "com.example.app")
     * @param {string} [command.startDate] - Start date for data collection (YYYY-MM-DD format, default: 7 days ago) / データ収集開始日 (YYYY-MM-DD形式、デフォルト: 7日前)
     * @param {string} [command.endDate] - End date for data collection (YYYY-MM-DD format, default: yesterday) / データ収集終了日 (YYYY-MM-DD形式、デフォルト: 昨日)
     *
     * @returns {Action.results.googlePlayConsole} - Collection results / 収集結果
     * @returns {Object} results.googlePlayConsole - Google Play Console data / Google Play Consoleデータ
     * @returns {number} [results.googlePlayConsole.downloads] - Total download count / 総ダウンロード数
     * @returns {number} [results.googlePlayConsole.activeInstalls] - Active installation count / アクティブインストール数
     * @returns {number} [results.googlePlayConsole.rating] - Average rating (1-5) / 平均評価 (1-5)
     * @returns {number} [results.googlePlayConsole.ratingCount] - Total number of ratings / 評価総数
     * @returns {Array<Review>} [results.googlePlayConsole.recentReviews] - Recent user reviews / 最新のユーザーレビュー
     * @returns {string} [results.googlePlayConsole.error] - Error message if collection failed / 収集失敗時のエラーメッセージ
     *
     * @requires
     * - Project must have `googleServiceAccount` configured / プロジェクトに`googleServiceAccount`が設定されている必要があります
     * - Service account must have Google Play Developer API access / サービスアカウントにGoogle Play Developer APIへのアクセス権限が必要です
     *
     * @example
     * // Action command example
     * {
     *   command: "collect_from_google_play_console",
     *   packageName: "com.example.myapp",
     *   startDate: "2024-01-01",
     *   endDate: "2024-01-31"
     * }
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
     *
     * @description
     * Collects app performance metrics, reviews, and statistics from App Store Connect
     * using App Store Connect API credentials configured in the project settings.
     *
     * App Store Connectからアプリのパフォーマンス指標、レビュー、統計情報を収集します。
     * プロジェクト設定で構成されたApp Store Connect API認証情報を使用します。
     *
     * @param {ActionCommand} command - Action command parameters / アクションコマンドパラメータ
     * @param {string} command.appId - (Required) App Store app ID / (必須) App StoreアプリID
     * @param {string} [command.vendorNumber] - Vendor number for sales reports / 売上レポート用のベンダー番号
     * @param {string} [command.startDate] - Start date for data collection (YYYY-MM-DD format, default: 7 days ago) / データ収集開始日 (YYYY-MM-DD形式、デフォルト: 7日前)
     * @param {string} [command.endDate] - End date for data collection (YYYY-MM-DD format, default: yesterday) / データ収集終了日 (YYYY-MM-DD形式、デフォルト: 昨日)
     *
     * @returns {Action.results.appStore} - Collection results / 収集結果
     * @returns {Object} results.appStore - App Store data / App Storeデータ
     * @returns {string} [results.appStore.appName] - App name / アプリ名
     * @returns {number} [results.appStore.downloads] - Total download count / 総ダウンロード数
     * @returns {number} [results.appStore.rating] - Average rating (1-5) / 平均評価 (1-5)
     * @returns {number} [results.appStore.ratingCount] - Total number of ratings / 評価総数
     * @returns {Array<Review>} [results.appStore.recentReviews] - Recent user reviews / 最新のユーザーレビュー
     * @returns {string} [results.appStore.error] - Error message if collection failed / 収集失敗時のエラーメッセージ
     *
     * @requires
     * - Project must have `appstoreIssuerId`, `appstoreAuthKeyId`, and `appstoreAuthKey` configured / プロジェクトに`appstoreIssuerId`、`appstoreAuthKeyId`、`appstoreAuthKey`が設定されている必要があります
     * - API key must have App Store Connect API access / APIキーにApp Store Connect APIへのアクセス権限が必要です
     *
     * @example
     * // Action command example
     * {
     *   command: "collect_from_app_store",
     *   appId: "123456789",
     *   vendorNumber: "12345678",
     *   startDate: "2024-01-01",
     *   endDate: "2024-01-31"
     * }
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
     *
     * @description
     * Collects user engagement metrics and event data from Firebase Analytics (Google Analytics 4)
     * using service account credentials configured in the project settings.
     *
     * Firebase Analytics (Google Analytics 4)からユーザーエンゲージメント指標とイベントデータを収集します。
     * プロジェクト設定で構成されたサービスアカウント認証情報を使用します。
     *
     * @param {ActionCommand} command - Action command parameters / アクションコマンドパラメータ
     * @param {string} command.propertyId - (Required) Firebase Analytics property ID (e.g., "12345678") / (必須) Firebase AnalyticsプロパティID (例: "12345678")
     * @param {string} [command.startDate] - Start date for data collection (YYYY-MM-DD format, default: 7 days ago) / データ収集開始日 (YYYY-MM-DD形式、デフォルト: 7日前)
     * @param {string} [command.endDate] - End date for data collection (YYYY-MM-DD format, default: yesterday) / データ収集終了日 (YYYY-MM-DD形式、デフォルト: 昨日)
     *
     * @returns {Action.results.firebaseAnalytics} - Collection results / 収集結果
     * @returns {Object} results.firebaseAnalytics - Firebase Analytics data / Firebase Analyticsデータ
     * @returns {number} [results.firebaseAnalytics.activeUsers] - Active user count / アクティブユーザー数
     * @returns {number} [results.firebaseAnalytics.sessions] - Session count / セッション数
     * @returns {number} [results.firebaseAnalytics.engagementRate] - Engagement rate / エンゲージメント率
     * @returns {number} [results.firebaseAnalytics.averageSessionDuration] - Average session duration in seconds / 平均セッション時間（秒）
     * @returns {Object} [results.firebaseAnalytics.events] - Event data by event name / イベント名別のイベントデータ
     * @returns {string} [results.firebaseAnalytics.error] - Error message if collection failed / 収集失敗時のエラーメッセージ
     *
     * @requires
     * - Project must have `googleServiceAccount` configured / プロジェクトに`googleServiceAccount`が設定されている必要があります
     * - Service account must have Google Analytics Data API access / サービスアカウントにGoogle Analytics Data APIへのアクセス権限が必要です
     *
     * @example
     * // Action command example
     * {
     *   command: "collect_from_firebase_analytics",
     *   propertyId: "12345678",
     *   startDate: "2024-01-01",
     *   endDate: "2024-01-31"
     * }
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
     *
     * @description
     * Analyzes marketing data collected from Google Play Console, App Store, and Firebase Analytics
     * using Google's Gemini AI. Generates comprehensive insights, improvement suggestions, trend analysis,
     * review analysis, and optional GitHub-aware improvements and market positioning analysis.
     *
     * Google Play Console、App Store、Firebase Analyticsから収集したマーケティングデータを
     * GoogleのGemini AIを使用して分析します。包括的なインサイト、改善提案、トレンド分析、
     * レビュー分析、およびオプションのGitHub対応改善提案と市場ポジショニング分析を生成します。
     *
     * @param {ActionCommand} command - Action command parameters (none required) / アクションコマンドパラメータ（必須なし）
     *
     * @returns {Action.results.marketingAnalytics} - AI-generated analysis results / AI生成の分析結果
     * @returns {Object} results.marketingAnalytics - Marketing analytics data / マーケティング分析データ
     * @returns {OverallAnalysis} results.marketingAnalytics.overallAnalysis - Overall performance analysis / 総合パフォーマンス分析
     * @returns {string} results.marketingAnalytics.overallAnalysis.summary - Executive summary (2-3 paragraphs) / エグゼクティブサマリー（2-3段落）
     * @returns {string[]} results.marketingAnalytics.overallAnalysis.highlights - Key highlights (positive points) / 主要なハイライト（ポジティブなポイント）
     * @returns {string[]} results.marketingAnalytics.overallAnalysis.concerns - Areas of concern / 懸念事項
     * @returns {KeyMetric[]} results.marketingAnalytics.overallAnalysis.keyMetrics - Key performance metrics / 主要パフォーマンス指標
     * @returns {ImprovementSuggestion[]} results.marketingAnalytics.improvementSuggestions - Actionable improvement suggestions (5-8 items) / 実行可能な改善提案（5-8項目）
     * @returns {string} results.marketingAnalytics.improvementSuggestions[].title - Suggestion title / 提案タイトル
     * @returns {string} results.marketingAnalytics.improvementSuggestions[].description - Detailed description / 詳細説明
     * @returns {"high"|"medium"|"low"} results.marketingAnalytics.improvementSuggestions[].priority - Priority level / 優先度
     * @returns {string} results.marketingAnalytics.improvementSuggestions[].category - Category (user_acquisition, retention, engagement, monetization, quality, development) / カテゴリー
     * @returns {string} results.marketingAnalytics.improvementSuggestions[].expectedImpact - Expected impact / 期待される影響
     * @returns {TrendAnalysis} results.marketingAnalytics.trendAnalysis - Trend analysis and predictions / トレンド分析と予測
     * @returns {string} results.marketingAnalytics.trendAnalysis.userGrowthTrend - User growth trend analysis / ユーザー成長トレンド分析
     * @returns {string} results.marketingAnalytics.trendAnalysis.engagementTrend - Engagement trend analysis / エンゲージメントトレンド分析
     * @returns {string} results.marketingAnalytics.trendAnalysis.ratingTrend - Rating trend analysis / 評価トレンド分析
     * @returns {string[]} results.marketingAnalytics.trendAnalysis.predictions - Predictions for next period / 次期予測
     * @returns {ReviewAnalysis} results.marketingAnalytics.reviewAnalysis - User review analysis / ユーザーレビュー分析
     * @returns {Object} results.marketingAnalytics.reviewAnalysis.sentiment - Sentiment breakdown (percentages must sum to 100) / センチメント内訳（合計100%）
     * @returns {number} results.marketingAnalytics.reviewAnalysis.sentiment.positive - Positive sentiment percentage / ポジティブセンチメント率
     * @returns {number} results.marketingAnalytics.reviewAnalysis.sentiment.neutral - Neutral sentiment percentage / ニュートラルセンチメント率
     * @returns {number} results.marketingAnalytics.reviewAnalysis.sentiment.negative - Negative sentiment percentage / ネガティブセンチメント率
     * @returns {string[]} results.marketingAnalytics.reviewAnalysis.commonThemes - Common themes in reviews / レビューの共通テーマ
     * @returns {string[]} results.marketingAnalytics.reviewAnalysis.actionableInsights - Actionable insights from reviews / レビューから得られる実行可能なインサイト
     * @returns {CompetitivePositioningAnalysis} [results.marketingAnalytics.competitivePositioning] - Competitive positioning (when market research data is available) / 競合ポジショニング（市場調査データがある場合）
     * @returns {string} results.marketingAnalytics.competitivePositioning.marketPosition - Current market position / 現在の市場ポジション
     * @returns {Object[]} results.marketingAnalytics.competitivePositioning.competitorComparison - Competitor comparison / 競合比較
     * @returns {string} results.marketingAnalytics.competitivePositioning.differentiationStrategy - Differentiation strategy / 差別化戦略
     * @returns {string[]} results.marketingAnalytics.competitivePositioning.quickWins - Quick-win tactics / クイックウィン戦術
     * @returns {MarketOpportunityPriorityAnalysis} [results.marketingAnalytics.marketOpportunityPriority] - Market opportunity priority (when market research data is available) / 市場機会優先度（市場調査データがある場合）
     * @returns {Object[]} results.marketingAnalytics.marketOpportunityPriority.prioritizedOpportunities - Prioritized opportunities / 優先順位付けされた機会
     * @returns {string} results.marketingAnalytics.marketOpportunityPriority.strategicRecommendation - Strategic recommendation / 戦略的推奨事項
     * @returns {boolean} results.marketingAnalytics.marketDataIntegrated - Whether market research data was integrated / 市場調査データが統合されたかどうか
     * @returns {string} results.marketingAnalytics.generatedAt - Generation timestamp (ISO 8601) / 生成タイムスタンプ（ISO 8601）
     *
     * @returns {Action.results.githubImprovements} - GitHub-aware improvement suggestions (when GitHub analysis is available) / GitHub対応改善提案（GitHub分析がある場合）
     * @returns {string} results.githubImprovements.repository - Repository name / リポジトリ名
     * @returns {string} results.githubImprovements.framework - Detected framework / 検出されたフレームワーク
     * @returns {string} results.githubImprovements.improvementSummary - Summary of improvements / 改善提案サマリー
     * @returns {Object[]} results.githubImprovements.improvements - Code-level improvement suggestions / コードレベルの改善提案
     * @returns {string} results.githubImprovements.improvements[].title - Improvement title / 改善タイトル
     * @returns {string} results.githubImprovements.improvements[].description - Detailed description / 詳細説明
     * @returns {string} results.githubImprovements.improvements[].relatedFeature - Related feature name / 関連機能名
     * @returns {Object[]} results.githubImprovements.improvements[].codeReferences - Code file references / コードファイル参照
     * @returns {string} results.githubImprovements.improvements[].codeReferences[].filePath - File path / ファイルパス
     * @returns {string} results.githubImprovements.improvements[].codeReferences[].currentFunctionality - Current functionality / 現在の機能
     * @returns {string} results.githubImprovements.improvements[].codeReferences[].proposedChange - Proposed change / 提案される変更
     * @returns {"add"|"modify"|"refactor"|"optimize"} results.githubImprovements.improvements[].codeReferences[].modificationType - Modification type / 変更タイプ
     *
     * @returns {Action.usage} - AI cost (in USD) added to action.usage / AIコスト（USD）がaction.usageに追加されます
     *
     * @requires
     * - Task must have at least one of: googlePlayConsole, appStore, firebaseAnalytics in task.results / タスクに少なくとも1つのデータソースが必要です
     * - GCP project ID must be configured in environment variables / 環境変数にGCPプロジェクトIDが設定されている必要があります
     *
     * @example
     * // Action command example (no parameters needed)
     * {
     *   command: "analyze_marketing_data"
     * }
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
     *
     * @description
     * Generates a comprehensive PDF report from marketing analytics data.
     * Creates charts for key metrics and compiles all analysis into a formatted PDF document
     * that is uploaded to Firebase Storage.
     *
     * マーケティング分析データから包括的なPDFレポートを生成します。
     * 主要指標のグラフを作成し、すべての分析をフォーマットされたPDFドキュメントにまとめ、
     * Firebase Storageにアップロードします。
     *
     * @param {ActionCommand} command - Action command parameters / アクションコマンドパラメータ
     * @param {"daily"|"weekly"|"monthly"} [command.reportType="weekly"] - Report type (daily, weekly, or monthly) / レポートタイプ（日次、週次、月次）
     * @param {string} [command.startDate] - Report start date (used for date range display) / レポート開始日（日付範囲表示に使用）
     * @param {string} [command.endDate] - Report end date (used for date range display) / レポート終了日（日付範囲表示に使用）
     *
     * @returns {Action.assets.marketingAnalyticsPdf} - PDF report file path / PDFレポートファイルパス
     * @returns {string} assets.marketingAnalyticsPdf - Firebase Storage path to the generated PDF (e.g., "reports/{taskId}/{timestamp}_marketing_report.pdf") / 生成されたPDFへのFirebase Storageパス
     *
     * @returns {Action.results.pdfError} - Error information if generation failed / 生成失敗時のエラー情報
     * @returns {string} [results.pdfError] - Error message / エラーメッセージ
     *
     * @requires
     * - Task must have at least one of: googlePlayConsole, appStore, firebaseAnalytics in task.results / タスクに少なくとも1つのデータソースが必要です
     * - Firebase Storage bucket must be configured / Firebase Storageバケットが設定されている必要があります
     *
     * @pdf_contents
     * The generated PDF includes:
     * - Executive summary
     * - Key metrics dashboard
     * - Performance charts (downloads, ratings, engagement, etc.)
     * - Trend analysis
     * - Review sentiment analysis
     * - Improvement suggestions
     * - GitHub repository improvements (if available)
     * - Market positioning analysis (if market research data is available)
     *
     * 生成されるPDFには以下が含まれます：
     * - エグゼクティブサマリー
     * - 主要指標ダッシュボード
     * - パフォーマンスチャート（ダウンロード数、評価、エンゲージメントなど）
     * - トレンド分析
     * - レビューセンチメント分析
     * - 改善提案
     * - GitHubリポジトリ改善提案（利用可能な場合）
     * - 市場ポジショニング分析（市場調査データがある場合）
     *
     * @example
     * // Action command example
     * {
     *   command: "generate_marketing_pdf",
     *   reportType: "weekly",
     *   startDate: "2024-01-01",
     *   endDate: "2024-01-07"
     * }
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
     *
     * @description
     * Initializes GitHub repository analysis by scanning the repository structure,
     * detecting the framework, and creating a file list for batch processing.
     * This function dynamically updates task.actions to add process and summary steps.
     *
     * GitHubリポジトリ解析を初期化し、リポジトリ構造をスキャンし、
     * フレームワークを検出し、バッチ処理用のファイルリストを作成します。
     * このfunctionはtask.actionsを動的に更新してプロセスとサマリーのステップを追加します。
     *
     * @param {ActionCommand} command - Action command parameters / アクションコマンドパラメータ
     * @param {string} command.githubRepository - (Required) GitHub repository in format "owner/repo" (e.g., "facebook/react") / (必須) GitHubリポジトリ（形式: "owner/repo"、例: "facebook/react"）
     * @param {string} [command.githubRepositoryPath=""] - Path within repository to analyze (default: root) / 解析するリポジトリ内のパス（デフォルト: ルート）
     * @param {number} command.index - Current action index in task.actions / task.actions内の現在のアクションインデックス
     *
     * @returns {Action.results.githubAnalysisInit} - Initialization results / 初期化結果
     * @returns {string} results.githubAnalysisInit.repository - Repository name / リポジトリ名
     * @returns {string} results.githubAnalysisInit.repositoryPath - Repository path / リポジトリパス
     * @returns {string} results.githubAnalysisInit.framework - Detected framework (e.g., "flutter", "react-native", "android", "ios") / 検出されたフレームワーク
     * @returns {string[]} results.githubAnalysisInit.platforms - Detected platforms / 検出されたプラットフォーム
     * @returns {number} results.githubAnalysisInit.totalFiles - Total files to analyze / 解析対象ファイル総数
     * @returns {number} results.githubAnalysisInit.totalFolders - Total folders / フォルダー総数
     * @returns {number} results.githubAnalysisInit.batchCount - Number of process batches to create / 作成されるプロセスバッチ数
     * @returns {string} [results.githubAnalysis.error] - Error message if initialization failed / 初期化失敗時のエラーメッセージ
     *
     * @side_effects
     * - Updates task.actions to insert analyze_github_process actions (one per folder batch) / task.actionsを更新してanalyze_github_processアクションを挿入（フォルダーバッチごとに1つ）
     * - Updates task.actions to insert analyze_github_summary action at the end / task.actionsを更新してanalyze_github_summaryアクションを最後に挿入
     * - Saves analysis state to Firebase Storage / 分析状態をFirebase Storageに保存
     *
     * @requires
     * - Project must have `githubPersonalAccessToken` configured / プロジェクトに`githubPersonalAccessToken`が設定されている必要があります
     * - GitHub token must have repository read access / GitHubトークンにリポジトリ読み取りアクセス権限が必要です
     *
     * @example
     * // Action command example
     * {
     *   command: "analyze_github_init",
     *   index: 3,
     *   githubRepository: "flutter/flutter",
     *   githubRepositoryPath: "packages/flutter"
     * }
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
     *
     * @description
     * Processes a folder batch from the GitHub repository analysis.
     * Reads all files in the folder, generates AI summaries for files and folders,
     * and caches the results in Firebase Storage for the summary step.
     *
     * GitHubリポジトリ解析からフォルダーバッチを処理します。
     * フォルダー内のすべてのファイルを読み取り、ファイルとフォルダーのAIサマリーを生成し、
     * サマリーステップのために結果をFirebase Storageにキャッシュします。
     *
     * @param {ActionCommand} command - Action command parameters / アクションコマンドパラメータ
     * @param {string} command.githubRepository - (Required) GitHub repository in format "owner/repo" / (必須) GitHubリポジトリ（形式: "owner/repo"）
     * @param {string} [command.githubRepositoryPath=""] - Path within repository / リポジトリ内のパス
     * @param {number} command.batchIndex - Batch index to process (0-based) / 処理するバッチインデックス（0始まり）
     *
     * @returns {Action.results.githubAnalysisProcess} - Processing results / 処理結果
     * @returns {number} results.githubAnalysisProcess.batchIndex - Batch index that was processed / 処理されたバッチインデックス
     * @returns {string} results.githubAnalysisProcess.folderPath - Folder path that was analyzed / 解析されたフォルダーパス
     * @returns {number} results.githubAnalysisProcess.filesProcessed - Number of files in the batch / バッチ内のファイル数
     * @returns {number} results.githubAnalysisProcess.filesAnalyzed - Number of files successfully analyzed / 正常に解析されたファイル数
     * @returns {number} results.githubAnalysisProcess.totalProcessed - Total files processed so far / これまでに処理された総ファイル数
     * @returns {number} results.githubAnalysisProcess.totalFiles - Total files to process / 処理する総ファイル数
     * @returns {number} results.githubAnalysisProcess.inputTokens - AI input tokens used / 使用されたAI入力トークン
     * @returns {number} results.githubAnalysisProcess.outputTokens - AI output tokens generated / 生成されたAI出力トークン
     * @returns {boolean} [results.githubAnalysisProcess.skipped] - Whether the batch was skipped (already processed) / バッチがスキップされたかどうか（既に処理済み）
     * @returns {string} [results.githubAnalysisProcess.error] - Error message if processing failed / 処理失敗時のエラーメッセージ
     *
     * @returns {Action.usage} - AI cost (in USD) added to action.usage / AIコスト（USD）がaction.usageに追加されます
     *
     * @requires
     * - analyze_github_init must have been run first / analyze_github_initが先に実行されている必要があります
     * - Project must have `githubPersonalAccessToken` configured / プロジェクトに`githubPersonalAccessToken`が設定されている必要があります
     *
     * @note
     * This function is automatically created by analyze_github_init and should not be called directly.
     * Multiple instances run in parallel to process different folder batches.
     *
     * このfunctionはanalyze_github_initによって自動的に作成され、直接呼び出すべきではありません。
     * 異なるフォルダーバッチを処理するために複数のインスタンスが並列実行されます。
     *
     * @example
     * // Action command example (auto-generated by analyze_github_init)
     * {
     *   command: "analyze_github_process",
     *   githubRepository: "flutter/flutter",
     *   githubRepositoryPath: "packages/flutter",
     *   batchIndex: 0
     * }
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
     *
     * @description
     * Generates the final comprehensive repository analysis by aggregating all folder summaries
     * from the process steps. Uses AI to create an overview, architecture description,
     * and feature list for the repository.
     *
     * プロセスステップからすべてのフォルダーサマリーを集約して、最終的な包括的なリポジトリ解析を生成します。
     * AIを使用してリポジトリの概要、アーキテクチャ説明、機能リストを作成します。
     *
     * @param {ActionCommand} command - Action command parameters / アクションコマンドパラメータ
     * @param {string} command.githubRepository - (Required) GitHub repository in format "owner/repo" / (必須) GitHubリポジトリ（形式: "owner/repo"）
     * @param {string} [command.githubRepositoryPath=""] - Path within repository / リポジトリ内のパス
     *
     * @returns {Action.results.githubRepository} - Final repository analysis / 最終リポジトリ解析
     * @returns {string} results.githubRepository.repository - Repository name / リポジトリ名
     * @returns {string} results.githubRepository.framework - Detected framework / 検出されたフレームワーク
     * @returns {string[]} results.githubRepository.platforms - Detected platforms / 検出されたプラットフォーム
     * @returns {string} results.githubRepository.overview - High-level overview of the repository / リポジトリの概要
     * @returns {string} results.githubRepository.architecture - Architecture description / アーキテクチャ説明
     * @returns {RepositoryFeature[]} results.githubRepository.features - List of features / 機能リスト
     * @returns {string} results.githubRepository.features[].name - Feature name / 機能名
     * @returns {string} results.githubRepository.features[].description - Feature description / 機能説明
     * @returns {string[]} results.githubRepository.features[].relatedFiles - Related file paths / 関連ファイルパス
     * @returns {string} results.githubRepository.generatedAt - Generation timestamp (ISO 8601) / 生成タイムスタンプ（ISO 8601）
     * @returns {string} [results.githubRepository.error] - Error message if analysis failed / 解析失敗時のエラーメッセージ
     *
     * @returns {Action.search} - Search text for vector embedding / ベクトル埋め込み用の検索テキスト
     *
     * @returns {Action.usage} - AI cost (in USD) added to action.usage / AIコスト（USD）がaction.usageに追加されます
     *
     * @requires
     * - All analyze_github_process actions must have completed / すべてのanalyze_github_processアクションが完了している必要があります
     * - Project must have valid analysis data in Firebase Storage / プロジェクトにFirebase Storageに有効な解析データが必要です
     *
     * @note
     * This function is automatically created by analyze_github_init and should not be called directly.
     * It runs after all analyze_github_process actions have completed.
     *
     * このfunctionはanalyze_github_initによって自動的に作成され、直接呼び出すべきではありません。
     * すべてのanalyze_github_processアクションが完了した後に実行されます。
     *
     * @example
     * // Action command example (auto-generated by analyze_github_init)
     * {
     *   command: "analyze_github_summary",
     *   githubRepository: "flutter/flutter",
     *   githubRepositoryPath: "packages/flutter"
     * }
     */
    analyzeGithubSummary: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "analyze_github_summary",
            func: require("./functions/analyze_github_summary"),
            options: options
        }),
    /**
     * A function for conducting market research using Gemini with Google Search.
     *
     * Gemini + Google Searchを使用して市場調査を行うためのFunction。
     *
     * @description
     * Conducts comprehensive market research using Google's Gemini AI with Google Search grounding.
     * Analyzes market potential, competitor landscape, and business opportunities based on
     * project information. Uses real-time web search to gather current market data.
     *
     * GoogleのGemini AIとGoogle Search groundingを使用して包括的な市場調査を実施します。
     * プロジェクト情報に基づいて市場ポテンシャル、競合状況、ビジネス機会を分析します。
     * リアルタイムのウェブ検索を使用して現在の市場データを収集します。
     *
     * @param {ActionCommand} command - Action command parameters (none required) / アクションコマンドパラメータ（必須なし）
     *
     * @returns {Action.results.marketResearchData} - Market research results / 市場調査結果
     * @returns {MarketPotential} results.marketResearchData.marketPotential - Market potential analysis / 市場ポテンシャル分析
     * @returns {string} results.marketResearchData.marketPotential.summary - Market potential summary / 市場ポテンシャルサマリー
     * @returns {string} [results.marketResearchData.marketPotential.tam] - Total Addressable Market estimate / TAM（Total Addressable Market）推定値
     * @returns {string} [results.marketResearchData.marketPotential.sam] - Serviceable Addressable Market estimate / SAM（Serviceable Addressable Market）推定値
     * @returns {string} [results.marketResearchData.marketPotential.som] - Serviceable Obtainable Market estimate / SOM（Serviceable Obtainable Market）推定値
     * @returns {string[]} results.marketResearchData.marketPotential.marketDrivers - Key market drivers / 主要な市場ドライバー
     * @returns {string[]} results.marketResearchData.marketPotential.marketBarriers - Market entry barriers / 市場参入障壁
     * @returns {string[]} results.marketResearchData.marketPotential.targetSegments - Target market segments / ターゲット市場セグメント
     * @returns {CompetitorAnalysis} results.marketResearchData.competitorAnalysis - Competitor analysis / 競合分析
     * @returns {Competitor[]} results.marketResearchData.competitorAnalysis.competitors - List of competitors (3-5 companies) / 競合リスト（3-5社）
     * @returns {string} results.marketResearchData.competitorAnalysis.competitors[].name - Competitor name / 競合名
     * @returns {string} results.marketResearchData.competitorAnalysis.competitors[].description - Competitor description / 競合説明
     * @returns {string} [results.marketResearchData.competitorAnalysis.competitors[].marketShare] - Market share / 市場シェア
     * @returns {string[]} results.marketResearchData.competitorAnalysis.competitors[].strengths - Competitor strengths / 競合の強み
     * @returns {string[]} results.marketResearchData.competitorAnalysis.competitors[].weaknesses - Competitor weaknesses / 競合の弱み
     * @returns {string} [results.marketResearchData.competitorAnalysis.competitors[].pricing] - Pricing model / 価格モデル
     * @returns {string} [results.marketResearchData.competitorAnalysis.competitors[].targetAudience] - Target audience / ターゲット層
     * @returns {string} [results.marketResearchData.competitorAnalysis.competitors[].sourceUrl] - Source URL / ソースURL
     * @returns {string} results.marketResearchData.competitorAnalysis.marketLandscape - Overall market landscape / 市場全体の状況
     * @returns {string[]} results.marketResearchData.competitorAnalysis.competitiveAdvantages - Our competitive advantages / 当社の競争優位性
     * @returns {string[]} results.marketResearchData.competitorAnalysis.differentiationOpportunities - Differentiation opportunities / 差別化機会
     * @returns {string[]} results.marketResearchData.competitorAnalysis.marketGaps - Unmet market needs / 未充足の市場ニーズ
     * @returns {BusinessOpportunity[]} results.marketResearchData.businessOpportunities - Business opportunities / ビジネス機会
     * @returns {string} results.marketResearchData.businessOpportunities[].title - Opportunity title / 機会タイトル
     * @returns {string} results.marketResearchData.businessOpportunities[].description - Opportunity description / 機会説明
     * @returns {"market_gap"|"emerging_trend"|"underserved_segment"|"technology_shift"|"regulatory_change"|"other"} results.marketResearchData.businessOpportunities[].type - Opportunity type / 機会タイプ
     * @returns {"high"|"medium"|"low"} results.marketResearchData.businessOpportunities[].potentialImpact - Potential impact / 潜在的インパクト
     * @returns {"immediate"|"short_term"|"medium_term"|"long_term"} results.marketResearchData.businessOpportunities[].timeframe - Timeframe / 時間枠
     * @returns {string[]} results.marketResearchData.businessOpportunities[].requirements - Requirements to pursue / 追求するための要件
     * @returns {string[]} results.marketResearchData.businessOpportunities[].risks - Associated risks / 関連リスク
     * @returns {string[]} results.marketResearchData.dataSources - Data source URLs / データソースURL
     * @returns {string} results.marketResearchData.generatedAt - Generation timestamp (ISO 8601) / 生成タイムスタンプ（ISO 8601）
     * @returns {string} [results.marketResearchData.error] - Error message if research failed / 調査失敗時のエラーメッセージ
     *
     * @returns {Action.usage} - AI cost (in USD) added to action.usage / AIコスト（USD）がaction.usageに追加されます
     *
     * @requires
     * - Project must have at least `description` field configured / プロジェクトに少なくとも`description`フィールドが設定されている必要があります
     * - GCP project ID must be configured in environment variables / 環境変数にGCPプロジェクトIDが設定されている必要があります
     *
     * @note
     * Uses Gemini with Google Search grounding to collect real-time market data.
     * Prioritizes data from the last 12 months for accuracy.
     *
     * リアルタイムの市場データを収集するためにGoogle Search groundingを使用したGeminiを使用します。
     * 精度のために過去12か月のデータを優先します。
     *
     * @example
     * // Action command example (no parameters needed)
     * {
     *   command: "research_market"
     * }
     */
    researchMarket: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "research_market",
            func: require("./functions/research_market"),
            options: options
        }),
    /**
     * A function for analyzing market research data.
     *
     * 市場調査データを分析するためのFunction。
     *
     * @description
     * Performs deep strategic analysis of market research data collected by research_market.
     * Generates demand forecasts, revenue enhancement strategies, traffic growth strategies,
     * and key insights for business planning.
     *
     * research_marketによって収集された市場調査データの深い戦略分析を実行します。
     * 需要予測、収益向上戦略、トラフィック成長戦略、およびビジネス計画のための主要なインサイトを生成します。
     *
     * @param {ActionCommand} command - Action command parameters (none required) / アクションコマンドパラメータ（必須なし）
     *
     * @returns {Action.results.marketResearch} - Strategic analysis results / 戦略分析結果
     * @returns {string} results.marketResearch.summary - Executive summary of the analysis / 分析のエグゼクティブサマリー
     * @returns {DemandForecast} results.marketResearch.demandForecast - Demand forecast analysis / 需要予測分析
     * @returns {DemandPeriod} results.marketResearch.demandForecast.currentDemand - Current demand analysis / 現在の需要分析
     * @returns {DemandPeriod} results.marketResearch.demandForecast.threeMonthForecast - 3-month forecast / 3か月予測
     * @returns {DemandPeriod} results.marketResearch.demandForecast.oneYearForecast - 1-year forecast / 1年予測
     * @returns {DemandPeriod} results.marketResearch.demandForecast.threeYearForecast - 3-year forecast / 3年予測
     * @returns {DemandPeriod} results.marketResearch.demandForecast.fiveYearForecast - 5-year forecast / 5年予測
     * @returns {string} results.marketResearch.demandForecast.currentDemand.period - Period label / 期間ラベル
     * @returns {"very_high"|"high"|"medium"|"low"|"very_low"} results.marketResearch.demandForecast.currentDemand.demandLevel - Demand level / 需要レベル
     * @returns {string} [results.marketResearch.demandForecast.currentDemand.estimatedMarketSize] - Estimated market size / 推定市場規模
     * @returns {string} [results.marketResearch.demandForecast.currentDemand.growthRate] - Growth rate / 成長率
     * @returns {string[]} results.marketResearch.demandForecast.currentDemand.keyFactors - Key factors driving forecast / 予測を駆動する主要因子
     * @returns {"high"|"medium"|"low"} results.marketResearch.demandForecast.currentDemand.confidence - Forecast confidence / 予測信頼度
     * @returns {"rapidly_growing"|"growing"|"stable"|"declining"|"rapidly_declining"} results.marketResearch.demandForecast.overallTrend - Overall market trend / 市場全体のトレンド
     * @returns {string} results.marketResearch.demandForecast.summary - Forecast summary / 予測サマリー
     * @returns {RevenueStrategy[]} results.marketResearch.revenueStrategies - Revenue enhancement strategies (3-5 items) / 収益向上戦略（3-5項目）
     * @returns {string} results.marketResearch.revenueStrategies[].name - Strategy name / 戦略名
     * @returns {string} results.marketResearch.revenueStrategies[].description - Strategy description / 戦略説明
     * @returns {"pricing"|"monetization"|"expansion"|"partnership"|"product"|"marketing"} results.marketResearch.revenueStrategies[].type - Strategy type / 戦略タイプ
     * @returns {"high"|"medium"|"low"} results.marketResearch.revenueStrategies[].priority - Priority level / 優先度
     * @returns {string} results.marketResearch.revenueStrategies[].expectedImpact - Expected impact / 期待される影響
     * @returns {string[]} results.marketResearch.revenueStrategies[].implementationSteps - Implementation steps / 実装ステップ
     * @returns {string[]} results.marketResearch.revenueStrategies[].kpiMetrics - KPI metrics to track / 追跡するKPI指標
     * @returns {string} results.marketResearch.revenueStrategies[].timeline - Implementation timeline / 実装タイムライン
     * @returns {TrafficStrategy[]} results.marketResearch.trafficStrategies - Traffic growth strategies (3-5 items) / トラフィック成長戦略（3-5項目）
     * @returns {string} results.marketResearch.trafficStrategies[].name - Strategy name / 戦略名
     * @returns {string} results.marketResearch.trafficStrategies[].description - Strategy description / 戦略説明
     * @returns {"organic_search"|"paid_ads"|"social_media"|"content_marketing"|"referral"|"email"|"partnerships"|"other"} results.marketResearch.trafficStrategies[].channel - Channel type / チャネルタイプ
     * @returns {"high"|"medium"|"low"} results.marketResearch.trafficStrategies[].priority - Priority level / 優先度
     * @returns {string} results.marketResearch.trafficStrategies[].expectedImpact - Expected impact / 期待される影響
     * @returns {string[]} results.marketResearch.trafficStrategies[].implementationSteps - Implementation steps / 実装ステップ
     * @returns {string} [results.marketResearch.trafficStrategies[].estimatedCost] - Estimated cost / 推定コスト
     * @returns {string} results.marketResearch.trafficStrategies[].timeline - Implementation timeline / 実装タイムライン
     * @returns {string[]} results.marketResearch.keyInsights - Key insights (5-7 items) / 主要なインサイト（5-7項目）
     * @returns {MarketResearchData} results.marketResearch.researchData - Original research data / 元の調査データ
     * @returns {string} results.marketResearch.generatedAt - Generation timestamp (ISO 8601) / 生成タイムスタンプ（ISO 8601）
     * @returns {string} [results.marketResearch.error] - Error message if analysis failed / 分析失敗時のエラーメッセージ
     *
     * @returns {Action.usage} - AI cost (in USD) added to action.usage / AIコスト（USD）がaction.usageに追加されます
     *
     * @requires
     * - Task must have valid marketResearchData in task.results / タスクに有効なmarketResearchDataが必要です
     * - research_market must have been run first / research_marketが先に実行されている必要があります
     * - GCP project ID must be configured in environment variables / 環境変数にGCPプロジェクトIDが設定されている必要があります
     *
     * @note
     * This function analyzes the raw market research data and generates actionable strategic insights.
     * It should be run after research_market to get comprehensive strategic recommendations.
     *
     * このfunctionは生の市場調査データを分析し、実行可能な戦略的インサイトを生成します。
     * 包括的な戦略的推奨事項を得るためにresearch_marketの後に実行する必要があります。
     *
     * @example
     * // Action command example (no parameters needed)
     * {
     *   command: "analyze_market_research"
     * }
     */
    analyzeMarketResearch: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "analyze_market_research",
            func: require("./functions/analyze_market_research"),
            options: options
        }),
} as const;
