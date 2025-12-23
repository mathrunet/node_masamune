import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 *
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
    /**
     * A function for collecting developer information from Google Play public pages.
     *
     * Google Playの公開ページからデベロッパー情報を収集するためのFunction。
     */
    collectGooglePlayDevelopers: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "collect_google_play_developers",
            func: require("./functions/collect_google_play_developers"),
            options: options
        }),
} as const;
