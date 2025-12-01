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
    /**
     * A function for collecting data from App Store Connect.
     *
     * App Store Connectからデータを収集するためのFunction。
     */
    collectFromAppStore: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "collect_from_app_store",
            func: require("./functions/collect_from_app_store"),
            options: options
        }),
    /**
     * A function for collecting data from Firebase Analytics.
     *
     * Firebase Analyticsからデータを収集するためのFunction。
     */
    collectFromFirebaseAnalytics: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "collect_from_firebase_analytics",
            func: require("./functions/collect_from_firebase_analytics"),
            options: options
        }),
} as const;
