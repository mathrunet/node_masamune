import * as functions from "firebase-functions/v2";
import { FunctionsBase, HttpFunctionsOptions } from "./functions_base";
import * as express from "express";
export { Request } from "firebase-functions/v2/https";
export { Response } from "express";

/**
 * Base class for defining Function data for HTTP request execution.
 * 
 * HTTPリクエスト実行用のFunctionのデータを定義するためのベースクラス。
 */
export abstract class RequestProcessFunctionBase extends FunctionsBase {
    /**
     * Base class for defining Function data for HTTP request execution.
     * 
     * HTTPリクエスト実行用のFunctionのデータを定義するためのベースクラス。
     */
    constructor(options: HttpFunctionsOptions = {}) {
        super({ options: options });
    }

    /**
     * Specify the actual contents of the process.
     * 
     * 実際の処理の中身を指定します。
     * 
     * @param reqest
     * Request passed to Functions.
     * 
     * Functionsに渡されたRequest。
     * 
     * @param response
     * Response passed to Functions.
     * 
     * Functionsに渡されたResponse。
     */
    abstract process(reqest: functions.https.Request, response: express.Response<any>): Promise<void>;

    abstract id: string;
    data: { [key: string]: any } = {};
    build(regions: string[]): Function {
        const options = this.options as HttpFunctionsOptions | undefined | null;
        return functions.https.onRequest(
            {
                region: options?.region ?? regions,
                timeoutSeconds: options?.timeoutSeconds,
                memory: options?.memory,
                minInstances: options?.minInstances,
                concurrency: options?.concurrency,
                maxInstances: options?.maxInstances,
            },
            async (req, res) => {
                return this.process(req, res);
            }
        );
    }
}