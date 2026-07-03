import { Context } from "hono";
import { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * HTTP error with a status code.
 *
 * ステータスコード付きのHTTPエラー。
 */
export class HttpError extends Error {
    /**
     * HTTP error with a status code.
     *
     * ステータスコード付きのHTTPエラー。
     *
     * @param status
     * HTTP status code.
     *
     * HTTPステータスコード。
     *
     * @param message
     * Error message.
     *
     * エラーメッセージ。
     */
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

/**
 * Convert an error to a JSON response.
 *
 * エラーをJSONレスポンスに変換します。
 *
 * @param context
 * Hono context.
 *
 * Honoのコンテキスト。
 *
 * @param error
 * Error to convert.
 *
 * 変換するエラー。
 *
 * @returns { Response }
 * JSON response.
 *
 * JSONレスポンス。
 */
export function jsonError(context: Context, error: unknown): Response {
    if (error instanceof HttpError) {
        return context.json(
            { error: error.message },
            error.status as ContentfulStatusCode,
        );
    }
    console.error(error);
    return context.json({
        error: error instanceof Error ? error.message : String(error),
    }, 500);
}

/**
 * Resolve a configuration value.
 *
 * The value specified in the options takes precedence, and if it is not specified, the value is obtained from `context.env` (Cloudflare Workers secrets and environment variables).
 *
 * 設定値を解決します。
 *
 * オプションで指定された値を優先し、指定されていない場合は`context.env`（Cloudflare Workersのシークレット・環境変数）から取得します。
 *
 * @param context
 * Hono context.
 *
 * Honoのコンテキスト。
 *
 * @param optionValue
 * Value specified programmatically in the options.
 *
 * オプションでプログラム的に指定された値。
 *
 * @param envName
 * Name of the environment variable (Workers secret binding).
 *
 * 環境変数名（Workersシークレットバインディング名）。
 *
 * @returns { string | undefined }
 * Resolved value. Returns `undefined` if not found.
 *
 * 解決された値。見つからない場合は`undefined`を返します。
 */
export function resolveConfig(
    context: Context,
    optionValue: string | undefined | null,
    envName: string,
): string | undefined {
    if (typeof optionValue === "string" && optionValue.length > 0) {
        return optionValue;
    }
    const env = (context.env ?? {}) as Record<string, unknown>;
    const value = env[envName];
    if (typeof value === "string" && value.length > 0) {
        return value;
    }
    return undefined;
}
