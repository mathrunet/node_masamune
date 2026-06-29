import { WorkersBase } from "./workers_base";
import { Hono } from "hono";

/**
 * Define Function data for Cloudflare Workers.
 * 
 * Cloudflare Workers用のFunctionのデータを定義します。
 */
export class WorkersData extends WorkersBase {
    build(): Hono {
        const hono = new Hono();
        if (!this.func) {
            return hono;
        }
        return this.func(
            hono,
            this.options,
            this.data,
        );
    }
}
