import * as functions from "firebase-functions";
import { FunctionsBase } from "./functions_base";

/**
 * Base class for defining the data of Functions for executing the Call method of Functions.
 * 
 * FunctionsのCallメソッド実行用のFunctionのデータを定義するためのベースクラス。
 */
export abstract class CallProcessFunctionBase extends FunctionsBase {
    /**
     * Base class for defining the data of Functions for executing the Call method of Functions.
     * 
     * FunctionsのCallメソッド実行用のFunctionのデータを定義するためのベースクラス。
     */
    constructor() {
        super();
    }

    /**
     * Specify the actual contents of the process.
     * 
     * 実際の処理の中身を指定します。
     * 
     * @param {any} query
     * Query passed to Functions.
     * 
     * Functionsに渡されたクエリ。
     * 
     * @param {Record<string, any>} options 
     * Options passed to Functions.
     * 
     * Functionsに渡されたオプション。
     * 
     * @returns {{ [key: string]: any }}
     * Return value of the process.
     * 
     * 処理の戻り値。
     */
    abstract process(query: any, options: Record<string, any>): Promise<{ [key: string]: any }>;

    data: { [key: string]: string } = {};
    build(regions: string[], data: { [key: string]: string }): Function {
        return functions.runWith({
            timeoutSeconds: this.timeoutSeconds,
        }).region(...regions).https.onCall(async (query) => {
            const config = functions.config();
            return this.process(query, config);
        });
    }
}