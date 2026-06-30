import { Context, MiddlewareHandler } from "hono";

/**
 * Authentication context for Cloudflare Workers.
 *
 * Cloudflare Workersの認証コンテキスト。
 */
export interface WorkersAuthenticationContext {
    /**
     * User ID.
     *
     * ユーザーID。
     */
    uid?: string | undefined;

    /**
     * Decoded authentication token.
     *
     * デコード済みの認証トークン。
     */
    token?: { [key: string]: any } | undefined;
}

/**
 * Base class for authentication middleware for Cloudflare Workers.
 *
 * Cloudflare Workers用の認証ミドルウェアのベースクラス。
 */
export abstract class WorkersAuthenticationMiddlewareBase {
    /**
     * Create Hono middleware.
     *
     * Honoミドルウェアを作成します。
     */
    abstract build(): MiddlewareHandler;

    /**
     * Set authentication context.
     *
     * 認証コンテキストを設定します。
     */
    protected setAuthenticationContext(
        context: Context,
        authentication: WorkersAuthenticationContext,
    ): void {
        context.set("authentication", authentication);
    }
}
