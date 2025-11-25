import { Timestamp } from "firebase-admin/firestore";

/**
 * Report generation schedule type.
 * レポート生成のスケジュールタイプ。
 */
export type ReportSchedule = "daily" | "weekly" | "monthly";

/**
 * App status type.
 * アプリのステータスタイプ。
 */
export type AppStatus = "active" | "paused" | "error";

/**
 * Marketing app configuration stored in Firestore.
 * Firestoreに保存されるマーケティングアプリの設定。
 *
 * Path: plugins/marketing/apps/{appId}
 */
export interface MarketingAppConfig {
    /** Unique identifier for the app. */
    appId: string;
    /** Display name of the app. */
    appName: string;

    // Platform identifiers
    /** Google Play package name (e.g., "com.example.app"). */
    googlePlayPackageId?: string;
    /** App Store app ID (e.g., "1234567890"). */
    appStoreAppId?: string;
    /** Firebase project ID for analytics. */
    firebaseProjectId?: string;
    /** Firebase Analytics property ID (e.g., "properties/123456789"). */
    firebaseAnalyticsPropertyId?: string;
    /** GitHub repository in "owner/repo" format. */
    githubRepo?: string;

    // Report configuration
    /** Report generation schedule. */
    reportSchedule: ReportSchedule;
    /** Timestamp of the last report generation. */
    lastReportGeneratedAt?: Timestamp;
    /** Timestamp when the next report is due. */
    nextReportDueAt?: Timestamp;

    // Status
    /** Current status of the app. */
    status: AppStatus;
    /** Last error message if status is "error". */
    lastError?: string;

    // Owner information
    /** User ID of the app owner. */
    ownerId: string;
    /** Organization ID if applicable. */
    organizationId?: string;

    // Timestamps
    /** Creation timestamp. */
    createdAt: Timestamp;
    /** Last update timestamp. */
    updatedAt: Timestamp;
}

/**
 * Report request status type.
 * レポートリクエストのステータスタイプ。
 */
export type ReportRequestStatus =
    | "pending"
    | "collecting_google_play"
    | "collecting_firebase_analytics"
    | "collecting_github"
    | "collecting_app_store"
    | "analyzing"
    | "generating_report"
    | "generating_pdf"
    | "completed"
    | "failed";

/**
 * Marketing report generation request.
 * マーケティングレポート生成リクエスト。
 *
 * Path: plugins/marketing/requests/{requestId}
 */
export interface MarketingReportRequest {
    /** Unique identifier for the request. */
    requestId: string;
    /** App ID this request is for. */
    appId: string;
    /** Type of report to generate. */
    reportType: ReportSchedule;
    /** Date range for the report. */
    dateRange: {
        startDate: string; // YYYY-MM-DD
        endDate: string;   // YYYY-MM-DD
    };
    /** Current status of the request. */
    status: ReportRequestStatus;
    /** Current processing step description. */
    currentStep?: string;
    /** Progress percentage (0-100). */
    progress?: number;
    /** Error message if failed. */
    error?: string;

    // Result references
    /** Generated report ID. */
    reportId?: string;
    /** PDF download URL. */
    pdfUrl?: string;

    // Timestamps
    /** Creation timestamp. */
    createdAt: Timestamp;
    /** Last update timestamp. */
    updatedAt: Timestamp;
}

/**
 * OAuth token data stored in Firestore.
 * Firestoreに保存されるOAuthトークンデータ。
 *
 * Path: plugins/marketing/tokens/{userId}/{provider}
 */
export interface OAuthTokenData {
    /** OAuth provider (e.g., "google", "github", "apple"). */
    provider: string;
    /** Access token. */
    accessToken: string;
    /** Refresh token (if available). */
    refreshToken?: string;
    /** Token expiration timestamp. */
    expiresAt?: Timestamp;
    /** Token scopes. */
    scopes?: string[];
    /** Additional provider-specific data. */
    metadata?: Record<string, any>;
    /** Last update timestamp. */
    updatedAt: Timestamp;
}
