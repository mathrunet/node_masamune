import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, WorkflowContext } from "@mathrunet/masamune_workflow";
import * as admin from "firebase-admin";
import { ChartService, ChartInputData } from "../services/chart_service";
import { PDFService, PDFInputData } from "../services/pdf_service";
import "@mathrunet/masamune";

/**
 * A function for generating marketing analytics PDF report.
 *
 * マーケティング分析PDFレポートを生成するためのFunction。
 */
export class GenerateMarketingPdf extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     *
     * 関数のID。
     */
    id: string = "generate_marketing_pdf";

    /**
     * The process of the function.
     *
     * @param context
     * The context of the function.
     *
     * @returns
     * The action of the function.
     */
    async process(context: WorkflowContext): Promise<Action> {
        const action = context.action;
        const task = context.task;

        // 1. task.results から各データを取得
        const googlePlayConsole = task.results?.googlePlayConsole as { [key: string]: any } | undefined;
        const appStore = task.results?.appStore as { [key: string]: any } | undefined;
        const firebaseAnalytics = task.results?.firebaseAnalytics as { [key: string]: any } | undefined;
        const marketingAnalytics = task.results?.marketingAnalytics as { [key: string]: any } | undefined;
        const githubRepository = task.results?.githubRepository as { [key: string]: any } | undefined;
        const githubImprovements = task.results?.githubImprovements as { [key: string]: any } | undefined;

        // 2. いずれのデータも無ければ空データを返却
        if (!googlePlayConsole && !appStore && !firebaseAnalytics && !marketingAnalytics) {
            console.log("GenerateMarketingPdf: No marketing data found in task.results");
            return {
                ...action,
                assets: {
                    marketingAnalyticsPdf: "",
                }
            };
        }

        try {
            // 3. グラフを生成
            console.log("GenerateMarketingPdf: Generating charts...");
            const chartService = new ChartService();
            const chartInputData: ChartInputData = {
                googlePlayConsole,
                appStore,
                firebaseAnalytics,
                marketingAnalytics,
            };
            const charts = await chartService.generateAllCharts(chartInputData);
            console.log("GenerateMarketingPdf: Charts generated:", Object.keys(charts).filter(k => charts[k as keyof typeof charts]));

            // 4. PDFを生成
            console.log("GenerateMarketingPdf: Generating PDF...");
            const pdfService = new PDFService();
            const pdfInputData: PDFInputData = {
                googlePlayConsole,
                appStore,
                firebaseAnalytics,
                marketingAnalytics,
                githubRepository,
                githubImprovements,
            };

            // Determine app name from available data
            const appName = appStore?.appName ||
                googlePlayConsole?.packageName?.split(".")?.pop() ||
                "Marketing Report";

            // Determine date range from action command or use defaults
            const command = action.command as { [key: string]: any };
            const dateRange = command?.startDate && command?.endDate
                ? { startDate: command.startDate, endDate: command.endDate }
                : undefined;

            const pdfBuffer = await pdfService.generateReport({
                data: pdfInputData,
                charts,
                appName,
                reportType: (command?.reportType as "daily" | "weekly" | "monthly") || "weekly",
                dateRange,
            });
            console.log("GenerateMarketingPdf: PDF generated, size:", pdfBuffer.length, "bytes");

            // 5. Firebase Storage にアップロード
            const storageBucket = process.env.STORAGE_BUCKET ||
                `${process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "unknown"}.appspot.com`;

            console.log("GenerateMarketingPdf: Uploading to Storage bucket:", storageBucket);

            const storage = admin.storage().bucket(storageBucket);
            const timestamp = Date.now();
            const taskId = task["@uid"] || "unknown";
            const filePath = `reports/${taskId}/${timestamp}_marketing_report.pdf`;

            const file = storage.file(filePath);
            await file.save(pdfBuffer, {
                contentType: "application/pdf",
                metadata: {
                    cacheControl: "public, max-age=86400",
                },
            });
            console.log("GenerateMarketingPdf: PDF uploaded to:", filePath);

            // 6. パスを assets.marketingAnalyticsPdf に格納
            return {
                ...action,
                assets: {
                    marketingAnalyticsPdf: filePath,
                }
            };
        } catch (error: any) {
            console.error("GenerateMarketingPdf: Failed to generate PDF", error);
            return {
                ...action,
                assets: {
                    marketingAnalyticsPdf: "",
                },
                results: {
                    pdfError: error.message,
                }
            };
        }
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new GenerateMarketingPdf(options).build(regions);

// Export class for testing
module.exports.GenerateMarketingPdf = GenerateMarketingPdf;
