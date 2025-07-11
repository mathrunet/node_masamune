import * as base from "./lib/src/functions_base";
import * as admin from "firebase-admin";
import * as regions from "./lib/regions";
export * from "./functions";
export * from "./lib/api";
export * from "./lib/src/sql_api_base";
export * from "./lib/src/schedule_process_function_base";
export * from "./lib/src/request_process_function_base";
export * from "./lib/src/call_process_function_base";
export * from "./lib/src/firestore_triggered_process_function_base";
export * from "./lib/model_field_value/model_field_value";
export * from "./lib/utils";
export * from "./lib/exntensions/string.extension";
export * as gmail from "./lib/functions/gmail";
export * as sendGrid from "./lib/functions/send_grid";
export * as notification from "./lib/functions/send_notification";
export * from "./lib/src/firebase_loader";

/**
 * Methods for deploying to Firebase Functions.
 * 
 * Firebase Functionsにデプロイするためのメソッドです。
 * 
 * @param exports
 * Pass the `exports` as is.
 * 
 * `exports`をそのまま渡します。
 * 
 * @param region
 * Specify a region such as `asia-northeast1`.
 * 
 * `asia-northeast1`などのリージョンを指定します。
 * 
 * @param deployFunctions
 * The elements defined in [Functions] are passed as an array. The passed method is deployed.
 * 
 * [Functions]で定義された要素を配列として渡します。渡されたメソッドがデプロイされます。
 * 
 * @param data
 * Specify the topic name to be used for pub/sub and the length of the schedule.
 * 
 * pub/subで用いるトピック名やスケジュールの長さなどを指定します。
 */
export function deploy(exports: any, region: regions.Regions, deployFunctions: base.FunctionsBase[]) {
    if (admin.apps.length === 0) {
        admin.initializeApp();
    }
    for (const func of deployFunctions) {
        if (!process.env.FUNCTION_NAME || process.env.FUNCTION_NAME === func.id) {
            exports[func.id] = func.build(region);
        }
    }
}
