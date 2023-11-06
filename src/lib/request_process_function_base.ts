import * as functions from "firebase-functions";
import { FunctionsBase } from "./functions_base";

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
    constructor() {
        super();
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
     * 
     * @param options 
     * Options passed to Functions.
     * 
     * Functionsに渡されたオプション。
     */
    abstract process(reqest: functions.https.Request, response: functions.Response, options: Record<string, any>): Promise<void>;

    data: { [key: string]: string } = {};
    build(regions: string[], data: { [key: string]: string }): Function {
        return functions.runWith({
            timeoutSeconds: this.timeoutSeconds,
        }).region(...regions).https.onRequest(async (req, res) => {
            const config = functions.config();
            return this.process(req, res, config);
        });
    }
}