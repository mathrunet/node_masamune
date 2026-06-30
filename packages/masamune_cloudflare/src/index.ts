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

export * from "@mathrunet/masamune";
export * from "./lib/api";
export * from "./lib/src/workers_base";
export * from "./lib/src/workers_authentication_middleware_base";
export * from "./lib/src/workers_data";
export * from "./lib/src/request_process_workders_base";
export * from "./lib/middlewares";

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
export function deploy(deployWorkders: WorkersBase[], options: WorkersOptions = {}): hono.Hono {
    const app = new hono.Hono();
    for (const worker of deployWorkders) {
        app.route(worker.path, worker.build(options));
    }
    return app;
}
