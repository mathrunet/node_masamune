import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, Project, WorkflowContext } from "@mathrunet/masamune_workflow";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { FirebaseAnalyticsClient } from "../clients/firebase_analytics_client";
import "@mathrunet/masamune";

/**
 * A function for collecting data from Firebase Analytics.
 *
 * Firebase Analyticsからデータを収集するためのFunction。
 */
export class CollectFromFirebaseAnalytics extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     *
     * 関数のID。
     */
    id: string = "collect_from_firebase_analytics";

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
        // 1. action.projectからProjectデータを取得
        const action = context.action;
        const project = await (action.project?.ref ?? action.project)?.load();
        const projectData = project?.data() as Project | undefined;
        const serviceAccountJson = projectData?.googleServiceAccount;

        // 2. googleServiceAccountが無ければ空結果を返す
        if (!serviceAccountJson) {
            console.warn("CollectFromFirebaseAnalytics: No googleServiceAccount found in project");
            return {
                ...action,
                results: {
                    "firebaseAnalytics": {},
                }
            };
        }

        // 3. コマンドからパラメータを取得
        const propertyId = action.command?.data?.propertyId as string | undefined;
        const startDate = action.command?.data?.startDate as string | undefined;
        const endDate = action.command?.data?.endDate as string | undefined;

        if (!propertyId) {
            console.warn("CollectFromFirebaseAnalytics: No propertyId found in command");
            return {
                ...action,
                results: {
                    "firebaseAnalytics": {},
                }
            };
        }

        // 4. サービスアカウントJSONを一時ファイルに書き出し
        const tempDir = os.tmpdir();
        const tempPath = path.join(tempDir, `sa-analytics-${Date.now()}.json`);
        fs.writeFileSync(tempPath, serviceAccountJson);

        try {
            // 5. FirebaseAnalyticsClientを使用してデータ取得
            const client = new FirebaseAnalyticsClient({
                serviceAccountPath: tempPath,
                propertyId: propertyId,
            });

            const dateRange = {
                startDate: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                endDate: endDate || new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            };

            const data = await client.collectAllData(dateRange);

            // 6. 結果をMapとして返却
            return {
                ...action,
                results: {
                    "firebaseAnalytics": data,
                }
            };
        } catch (error: any) {
            console.error("CollectFromFirebaseAnalytics: Failed to collect data", error);
            return {
                ...action,
                results: {
                    "firebaseAnalytics": {
                        error: error.message,
                    },
                }
            };
        } finally {
            // 7. 一時ファイル削除
            try {
                fs.unlinkSync(tempPath);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new CollectFromFirebaseAnalytics(options).build(regions);

// Export class for testing
module.exports.CollectFromFirebaseAnalytics = CollectFromFirebaseAnalytics;
