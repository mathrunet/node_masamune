import * as masamune from "@mathrunet/masamune";

/**
 * Define a list of applicable Functions for FirebaseFunctions.
 *
 * FirebaseFunctions用の適用可能なFunctionの一覧を定義します。
 */
export const Functions = {
    /**
     * Periodically check and start marketing report generation.
     *
     * マーケティングレポート生成を定期的にチェックし開始します。
     */
    scheduleMarketingCheck: (options: masamune.SchedulerFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "schedule_marketing_check",
            func: require("./functions/schedule_marketing_check"),
            options: options,
        }),

    /**
     * Collect marketing data from all configured sources.
     *
     * すべての設定されたソースからマーケティングデータを収集します。
     */
    collectMarketingData: (options: masamune.HttpFunctionsOptions = {}) =>
        new masamune.FunctionsData({
            id: "collect_marketing_data",
            func: require("./functions/collect_marketing_data"),
            options: options,
        }),

    // TODO: Add these functions in later phases
    // generateMarketingReport: (options: masamune.HttpFunctionsOptions = {}) =>
    //     new masamune.FunctionsData({
    //         id: "generate_marketing_report",
    //         func: require("./functions/generate_marketing_report"),
    //         options: options,
    //     }),

    // generateMarketingPdf: (options: masamune.HttpFunctionsOptions = {}) =>
    //     new masamune.FunctionsData({
    //         id: "generate_marketing_pdf",
    //         func: require("./functions/generate_marketing_pdf"),
    //         options: options,
    //     }),
} as const;
