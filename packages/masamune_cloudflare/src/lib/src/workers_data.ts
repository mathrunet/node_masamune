import { WorkersBase, WorkersOptions } from "./workers_base";
import { Hono } from "hono";

/**
 * Define Function data for Cloudflare Workers.
 * 
 * Cloudflare Workers用のFunctionのデータを定義します。
 */
export class WorkersData extends WorkersBase {
    build(defaultOptions: WorkersOptions = {}): Hono {
        const hono = new Hono();
        const options = this.resolveOptions(defaultOptions);
        this.applyAuthentication(hono, options);
        if (!this.func) {
            return hono;
        }
        return this.func(
            hono,
            options,
            this.data,
        );
    }
}
