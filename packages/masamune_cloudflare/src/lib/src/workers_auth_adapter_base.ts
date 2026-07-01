import { Context } from "hono";
import { WorkerAdapterBase } from "./worker_adapter_base";

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
export abstract class WorkersAuthAdapterBase extends WorkerAdapterBase {
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
