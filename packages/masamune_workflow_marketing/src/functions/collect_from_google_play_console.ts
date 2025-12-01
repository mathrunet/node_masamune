import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions, firestoreLoader, storageLoader } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase } from "@mathrunet/masamune_workflow";

/**
 * A function for collecting data from Google Play Console.
 * 
 * Google Play Consoleからデータを収集するためのFunction。
 */
class CollectFromGooglePlayConsole extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     * 
     * 関数のID。
     */
    id: string = "collect_from_google_play_console";
    /**
     * The process of the function.
     * 
     * @param action
     * The action of the function.
     * 
     * @returns
     * The action of the function.
     */
    process(action: Action): Promise<Action> {

    }

}