import { MiddlewareHandler } from "hono";

/**
 * Base class for worker adapter for Cloudflare Workers.
 *
 * Cloudflare Workers用のワーカーアダプターのベースクラス。
 */
export abstract class WorkerAdapterBase {
    /**
     * Create Hono middleware.
     *
     * Honoミドルウェアを作成します。
     */
    abstract build(): MiddlewareHandler;
}
