/**
 * Copyright (c) 2025 mathru. All rights reserved.
 * 
 * Manages packages on Cloudflare Workers for the server portion (NodeJS) of the Masamune framework.
 * 
 * To use, import * as masamune from "@mathrunet/masamune_cloudflare";
 *
 * [mathru.net]: https://mathru.net
 * [YouTube]: https://www.youtube.com/c/mathrunetchannel
 */
// 公開型宣言を読むconsumerにもWorkerの共通型を読み込ませる。
import type { WorkersScheduledEvent } from "./lib/src/cloudflare_workers_types";
export type { WorkersScheduledEvent } from "./lib/src/cloudflare_workers_types";
import * as hono from "hono";
import { WorkersBase, WorkersOptions } from "./lib/src/workers_base";
import { ScheduleProcessWorkdersBase } from "./lib/src/schedule_process_workders_base";
import { RegionScheduleProcessWorkdersBase } from "./lib/src/region_schedule_process_workders_base";
import { QueueProcessWorkdersBase } from "./lib/src/queue_process_workders_base";
import {
    WorkersQueueExecutionContext,
    WorkersQueueMessageBatch,
} from "./lib/src/queue_workers_types";

export * from "./lib/api";
export * from "./lib/src/workers_base";
export * from "./lib/src/workers_auth_adapter_base";
export * from "./lib/src/workers_rule_adapter_base";
export * from "./lib/src/workers_data";
export * from "./lib/src/request_process_workders_base";
export * from "./lib/src/schedule_process_workders_base";
export * from "./lib/src/region_schedule_process_workders_base";
export * from "./lib/src/internal_request";
export * from "./lib/src/queue_process_workders_base";
export * from "./lib/src/queue_workers_types";
export * from "./lib/src/http_error";
export * from "./lib/src/vector_sync";
export * from "./lib/src/google_auth";
export * from "./lib/src/database_adapter";
export * from "./lib/src/rules/rules_loader";
export * from "./lib/src/rules/path_matcher";
export * from "./lib/src/rules/rules_engine";
export * from "./lib/adapters/firebase_auth_adapter";
export * from "./lib/adapters/none_auth_adapter";
export * from "./lib/adapters/internal_auth_adapter";
export * from "./lib/adapters/rules_middleware";
export * from "./lib/adapters";

/**
 * Methods for deploying to Cloudflare Workers.
 * 
 * Cloudflare Workersにデプロイするためのメソッドです。
 * 
 * @param exports
 * Pass the `exports` as is.
 * 
 * `exports`をそのまま渡します。
 * 
 * @param deployWorkders
 * The elements defined in [Workers] are passed as an array. The passed method is deployed.
 * 
 * [Workers]で定義された要素を配列として渡します。渡されたメソッドがデプロイされます。
 */
export type WorkersDeployResult = hono.Hono & {
    scheduled?: (
        event: WorkersScheduledEvent,
        env: unknown,
        ctx: ExecutionContext,
    ) => Promise<void>;
    queue?: (
        batch: WorkersQueueMessageBatch,
        env: unknown,
        ctx: WorkersQueueExecutionContext,
    ) => Promise<void>;
};

/**
 * Type of Worker deployment.
 *
 * `edge` runs near each client without placement, and `region` runs near a fixed-region backend with placement.
 *
 * Workerのデプロイタイプ。
 *
 * `edge`はplacementなしで各クライアントの近くで動き、`region`はplacementで固定リージョンのバックエンドの近くで動きます。
 */
export type WorkersDeployType = "edge" | "region";

/**
 * Options for [deploy].
 *
 * [deploy]のオプション。
 */
export interface WorkersDeployOptions extends WorkersOptions {
    /**
     * Type of this Worker. When set, every response has the `x-masamune-worker` header.
     *
     * このWorkerのタイプ。指定するとすべてのレスポンスに`x-masamune-worker`ヘッダを付与します。
     */
    type?: WorkersDeployType | undefined;
}

export function deploy(deployWorkders: WorkersBase[], options: WorkersDeployOptions = {}): WorkersDeployResult {
    const app = new hono.Hono();
    const { type, ...workersOptions } = options;
    if (type !== undefined) {
        if (type !== "edge" && type !== "region") {
            throw new Error(`Invalid Worker type: ${String(type)}`);
        }
        app.use("*", async (context, next) => {
            await next();
            context.header("x-masamune-worker", type);
        });
    }
    const scheduleWorkers: ScheduleProcessWorkdersBase[] = [];
    const queueWorkers: QueueProcessWorkdersBase[] = [];
    for (const worker of deployWorkders) {
        if (worker instanceof ScheduleProcessWorkdersBase) {
            scheduleWorkers.push(worker);
            if (worker instanceof RegionScheduleProcessWorkdersBase) {
                app.route(worker.path, worker.build(workersOptions));
            }
            continue;
        }
        if (worker instanceof QueueProcessWorkdersBase) {
            queueWorkers.push(worker);
            continue;
        }
        app.route(worker.path, worker.build(workersOptions));
    }
    const result = app as WorkersDeployResult;
    if (scheduleWorkers.length > 0) {
        result.scheduled = async (event, env, ctx) => {
            await Promise.all(
                scheduleWorkers.map((worker) => worker.process(event, env, ctx)),
            );
        };
    }
    if (queueWorkers.length > 0) {
        result.queue = async (batch, env, ctx) => {
            await Promise.all(
                queueWorkers.map((worker) => worker.process(batch, env, ctx)),
            );
        };
    }
    return result;
}
