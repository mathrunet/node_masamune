import * as functions from "firebase-functions/v2";
import { FunctionsBase } from "./functions_base";
import * as express from "express";

/**
 * Base class for defining Function data for HTTP request execution.
 * 
 * HTTPリクエスト実行用のFunctionのデータを定義するためのベースクラス。
 */
export abstract class RequestProcessFunctionBase extends FunctionsBase {
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

    data: { [key: string]: string } = {};
    build(regions: string[]): Function {
        return functions.https.onRequest(
            {
                region: regions,
                timeoutSeconds: this.options.timeoutSeconds,
                memory: this.options.memory,
                minInstances: this.options.minInstances,
                concurrency: this.options.concurrency,
                maxInstances: this.options.maxInstances ?? undefined,
            },
            async (req, res) => {
                return this.process(req, res);
            }
        );
    }
}