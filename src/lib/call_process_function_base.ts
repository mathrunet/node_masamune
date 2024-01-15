import * as functions from "firebase-functions/v2";
import { FunctionsBase } from "./functions_base";

/**
 * Base class for defining the data of Functions for executing the Call method of Functions.
 * 
 * FunctionsのCallメソッド実行用のFunctionのデータを定義するためのベースクラス。
 */
export abstract class CallProcessFunctionBase extends FunctionsBase {
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
     * @returns {{ [key: string]: any }}
     * Return value of the process.
     * 
     * 処理の戻り値。
     */
    abstract process(query: any): Promise<{ [key: string]: any }>;

    data: { [key: string]: string } = {};
    build(regions: string[]): Function {
        return functions.https.onCall(        
            {
                region: regions,
                timeoutSeconds: this.options.timeoutSeconds,
                memory: this.options.memory,
                minInstances: this.options.minInstances,
                concurrency: this.options.concurrency,
                maxInstances: this.options.maxInstances ?? undefined,
            },
            async (query) => {
                return this.process(query);
            }
        );
    }
}