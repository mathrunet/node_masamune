import * as admin from "firebase-admin";
import * as katana from "@mathrunet/katana";
export * from "@mathrunet/katana";

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
export function deploy(exports: any, region: katana.Regions, deployFunctions: katana.FunctionsBase[]) {
    if (admin.apps.length === 0) {
        admin.initializeApp();
    }
    for (const func of deployFunctions) {
        if (!process.env.FUNCTION_NAME || process.env.FUNCTION_NAME === func.id) {
            exports[func.id] = func.build(region);
        }
    }
}
