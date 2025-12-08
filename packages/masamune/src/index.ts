/**
 * Copyright (c) 2025 mathru. All rights reserved.
 * 
 * Manages packages for the server portion (NodeJS) of the Masamune framework.
 * 
 * To use, import * as masamune from "@mathrunet/masamune";
 *
 * [mathru.net]: https://mathru.net
 * [YouTube]: https://www.youtube.com/c/mathrunetchannel
 */
import * as admin from "firebase-admin";
import { Regions } from "./lib/regions";
import { FunctionsBase } from "./lib/src/functions_base";

export * from "./lib/api";
export * from "./lib/regions";
export * as utils from "./lib/utils";

export * from "./lib/src/firebase_loader";
export * from "./lib/src/functions_base";
export * from "./lib/src/functions_data";
export * as firestore from "./lib/src/firestore_base";
export * from "./lib/src/sql_api_base";
export * from "./lib/src/call_process_function_base";
export * from "./lib/src/firestore_triggered_process_function_base";
export * from "./lib/src/request_process_function_base";
export * from "./lib/src/schedule_process_function_base";

export * from "./lib/model_field_value/model_field_value";
export * from "./lib/model_field_value/default_model_field_value_converter";

export * from "./lib/exntensions/string.extension";
export * from "./lib/exntensions/firestore.extension";

export * as test from "./functions/test";

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
 * Specify a region such as `us-central1`.
 * 
 * `us-central1`などのリージョンを指定します。
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
export function deploy(exports: any, region: Regions, deployFunctions: FunctionsBase[]) {
    if (admin.apps.length === 0) {
        admin.initializeApp();
    }
    for (const func of deployFunctions) {
        if (!process.env.FUNCTION_NAME || process.env.FUNCTION_NAME === func.id) {
            exports[func.id] = func.build(region);
        }
    }
}
