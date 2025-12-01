import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 *
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
    /**
     * A function for collecting data from Google Play Console.
     *
     * Google Play Consoleからデータを収集するためのFunction。
     */
    collectFromGooglePlayConsole: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "collect_from_google_play_console",
            func: require("./functions/collect_from_google_play_console"),
            options: options
        }),
} as const;
