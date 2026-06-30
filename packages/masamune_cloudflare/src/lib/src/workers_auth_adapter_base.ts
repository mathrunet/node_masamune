import { Context, MiddlewareHandler } from "hono";

/**
 * Authentication context for Cloudflare Workers.
 *
 * Cloudflare Workersの認証コンテキスト。
 */
export interface WorkersAuthContext {
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
 * Base class for authentication adapter for Cloudflare Workers.
 *
 * Cloudflare Workers用の認証アダプターのベースクラス。
 */
export abstract class WorkersAuthAdapterBase {
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
    protected setAuthContext(
        context: Context,
        authentication: WorkersAuthContext,
    ): void {
        context.set("authentication", authentication);
    }
}
