import * as functions from "firebase-functions/v2";

/**
 * Error category for classification.
 * エラーのカテゴリ分類。
 */
export enum ErrorCategory {
    RATE_LIMIT = "rate_limit",
    AUTHENTICATION = "authentication",
    NOT_FOUND = "not_found",
    NETWORK = "network",
    INTERNAL = "internal",
    VALIDATION = "validation",
    PERMISSION = "permission",
}

/**
 * Marketing pipeline error class.
 * マーケティングパイプラインのエラークラス。
 */
export class MarketingPipelineError extends Error {
    public readonly category: ErrorCategory;
    public readonly retryable: boolean;
    public readonly originalError?: Error;

    constructor(
        message: string,
        category: ErrorCategory,
        retryable: boolean = false,
        originalError?: Error
    ) {
        super(message);
        this.name = "MarketingPipelineError";
        this.category = category;
        this.retryable = retryable;
        this.originalError = originalError;
    }

    /**
     * Convert to Firebase HttpsError.
     */
    toHttpsError(): functions.https.HttpsError {
        const codeMap: Record<ErrorCategory, functions.https.FunctionsErrorCode> = {
            [ErrorCategory.RATE_LIMIT]: "resource-exhausted",
            [ErrorCategory.AUTHENTICATION]: "unauthenticated",
            [ErrorCategory.NOT_FOUND]: "not-found",
            [ErrorCategory.NETWORK]: "unavailable",
            [ErrorCategory.INTERNAL]: "internal",
            [ErrorCategory.VALIDATION]: "invalid-argument",
            [ErrorCategory.PERMISSION]: "permission-denied",
        };

        return new functions.https.HttpsError(codeMap[this.category], this.message);
    }
}

/**
 * Retry configuration.
 * リトライ設定。
 */
export interface RetryConfig {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
};

/**
 * Sleep for a specified duration.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic.
 * リトライロジックを使用して関数を実行。
 *
 * @param fn - Function to execute
 * @param config - Retry configuration
 * @param shouldRetry - Function to determine if retry should happen
 * @returns Result of the function
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    shouldRetry: (error: Error, attempt: number) => boolean = () => true
): Promise<T> {
    let lastError: Error | null = null;
    let delay = config.initialDelayMs;

    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            if (attempt > config.maxRetries || !shouldRetry(error, attempt)) {
                throw error;
            }

            console.warn(
                `Attempt ${attempt}/${config.maxRetries + 1} failed: ${error.message}. ` +
                `Retrying in ${delay}ms...`
            );

            await sleep(delay);
            delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
        }
    }

    throw lastError;
}

/**
 * Classify an error into a category.
 * エラーをカテゴリに分類。
 */
export function classifyError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    if (message.includes("rate limit") || message.includes("quota") || message.includes("429")) {
        return ErrorCategory.RATE_LIMIT;
    }

    if (
        message.includes("unauthorized") ||
        message.includes("unauthenticated") ||
        message.includes("401") ||
        message.includes("invalid token")
    ) {
        return ErrorCategory.AUTHENTICATION;
    }

    if (message.includes("not found") || message.includes("404")) {
        return ErrorCategory.NOT_FOUND;
    }

    if (
        message.includes("network") ||
        message.includes("timeout") ||
        message.includes("econnrefused") ||
        message.includes("503")
    ) {
        return ErrorCategory.NETWORK;
    }

    if (message.includes("permission") || message.includes("403") || message.includes("forbidden")) {
        return ErrorCategory.PERMISSION;
    }

    if (message.includes("invalid") || message.includes("validation")) {
        return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.INTERNAL;
}

/**
 * Create a MarketingPipelineError from a generic error.
 */
export function wrapError(error: Error, defaultMessage?: string): MarketingPipelineError {
    const category = classifyError(error);
    const retryable = [ErrorCategory.RATE_LIMIT, ErrorCategory.NETWORK].includes(category);

    return new MarketingPipelineError(
        defaultMessage || error.message,
        category,
        retryable,
        error
    );
}

/**
 * Log error with context.
 */
export function logError(context: string, error: Error, metadata?: Record<string, any>): void {
    console.error(`[${context}] Error:`, {
        message: error.message,
        name: error.name,
        stack: error.stack,
        ...metadata,
    });
}
