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
import * as hono from "hono";
import { WorkersBase, WorkersOptions } from "./lib/src/workers_base";
import { ScheduleProcessWorkdersBase } from "./lib/src/schedule_process_workders_base";

export * from "@mathrunet/masamune";
export * from "./lib/api";
export * from "./lib/src/workers_base";
export * from "./lib/src/workers_auth_adapter_base";
export * from "./lib/src/workers_rule_adapter_base";
export * from "./lib/src/workers_data";
export * from "./lib/src/request_process_workders_base";
export * from "./lib/src/schedule_process_workders_base";
export * from "./lib/src/http_error";
export * from "./lib/src/google_auth";
export * from "./lib/src/database_adapter";
export * from "./lib/src/rules/rules_loader";
export * from "./lib/src/rules/path_matcher";
export * from "./lib/src/rules/rules_engine";
export * from "./lib/adapters/firebase_auth_adapter";
export * from "./lib/adapters/none_auth_adapter";
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
        event: ScheduledEvent,
        env: unknown,
        ctx: ExecutionContext,
    ) => Promise<void>;
};

export function deploy(deployWorkders: WorkersBase[], options: WorkersOptions = {}): WorkersDeployResult {
    const app = new hono.Hono();
    const scheduleWorkers: ScheduleProcessWorkdersBase[] = [];
    for (const worker of deployWorkders) {
        if (worker instanceof ScheduleProcessWorkdersBase) {
            scheduleWorkers.push(worker);
            continue;
        }
        app.route(worker.path, worker.build(options));
    }
    const result = app as WorkersDeployResult;
    if (scheduleWorkers.length > 0) {
        result.scheduled = async (event, env, ctx) => {
            await Promise.all(
                scheduleWorkers.map((worker) => worker.process(event, env, ctx)),
            );
        };
    }
    return result;
}
