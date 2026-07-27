import { Hono } from "hono";
import { WorkersBase, WorkersOptions } from "./workers_base";
import {
    WorkersQueueExecutionContext,
    WorkersQueueMessageBatch,
} from "./queue_workers_types";

/**
 * Base class for defining Workers data for Cloudflare Queues consumers.
 *
 * Cloudflare Queues consumer用のWorkersデータを定義するためのベースクラス。
 */
export abstract class QueueProcessWorkdersBase<
    Body = unknown,
> extends WorkersBase {
    /**
     * Base class for defining Workers data for Cloudflare Queues consumers.
     *
     * Cloudflare Queues consumer用のWorkersデータを定義するためのベースクラス。
     */
    constructor(options: WorkersOptions = {}) {
        super({ options: options });
    }

    /**
     * Process a batch delivered by Cloudflare Queues.
     *
     * Cloudflare Queuesから配信されたバッチを処理します。
     */
    abstract process(
        batch: WorkersQueueMessageBatch<Body>,
        env: unknown,
        ctx: WorkersQueueExecutionContext,
    ): Promise<void>;

    data: { [key: string]: any } = {};
    build(defaultOptions: WorkersOptions = {}): Hono {
        return new Hono();
    }
}
