import * as data from "./lib/functions_data";
import * as admin from "firebase-admin";
export * from "./functions";
export * from "./lib/functions_data";

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
 * @param deployFunctions
 * The elements defined in [Functions] are passed as an array. The passed method is deployed.
 * 
 * [Functions]で定義された要素を配列として渡します。渡されたメソッドがデプロイされます。
 */
export function deploy(exports: any, deployFunctions: [data.FunctionsData]){
    admin.initializeApp();
    for (const data of deployFunctions) {
        if (!process.env.FUNCTION_NAME || process.env.FUNCTION_NAME === data.id) {
            exports[data.id] = data.func;
        }
    }
}
