import * as functions from "firebase-functions/v2";
import { FunctionsBase, HttpFunctionsOptions } from "./functions_base";
export { CallableRequest } from "firebase-functions/v2/https";

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
    constructor({
        data = {},
        options,
    }: {
        data?: { [key: string]: string },
        options?: HttpFunctionsOptions | undefined | null,
    }) {
        super({ data: data, options: options });
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
     * @returns {{ [key: string]: any }}
     * Return value of the process.
     * 
     * 処理の戻り値。
     */
    abstract process(query: functions.https.CallableRequest<any>): Promise<{ [key: string]: any }>;

    abstract id: string;
    data: { [key: string]: string } = {};
    build(regions: string[]): Function {
        const options = this.options as HttpFunctionsOptions | undefined | null;
        return functions.https.onCall(        
            {
                region: options?.region ?? regions,
                timeoutSeconds: options?.timeoutSeconds,
                memory: options?.memory,
                minInstances: options?.minInstances,
                concurrency: options?.concurrency,
                maxInstances: options?.maxInstances,
            },
            async (query) => {
                return this.process(query);
            }
        );
    }
}