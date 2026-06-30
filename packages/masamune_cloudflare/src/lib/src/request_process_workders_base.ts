import { WorkersBase, WorkersOptions } from "./workers_base";
import { Hono } from "hono";
export { Response } from "express";

/**
 * Base class for defining Workers data for HTTP request execution.
 * 
 * HTTPリクエスト実行用のWorkersのデータを定義するためのベースクラス。
 */
export abstract class RequestProcessWorkdersBase extends WorkersBase {
    /**
     * Base class for defining Workers data for HTTP request execution.
     * 
     * HTTPリクエスト実行用のWorkersのデータを定義するためのベースクラス。
     */
    constructor(options: WorkersOptions = {}) {
        super({ options: options });
    }

    /**
     * Specify the actual contents of the process.
     * 
     * 実際の処理の中身を指定します。
     * 
     * @param request
     * Request passed to Functions.
     * 
     * Functionsに渡されたRequest。
     * 
     * @param response
     * Response passed to Functions.
     * 
     * Functionsに渡されたResponse。
     */
    abstract process(hono: Hono): Hono;

    abstract path: string;
    data: { [key: string]: any } = {};
    build(defaultOptions: WorkersOptions = {}): Hono {
        const hono = new Hono();
        const options = this.resolveOptions(defaultOptions);
        this.applyAuthentication(hono, options);
        return this.process(hono);
    }
}
