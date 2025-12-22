import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, Project, WorkflowContext } from "@mathrunet/masamune_workflow";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GooglePlayClient } from "../clients/google_play_client";
import "@mathrunet/masamune";

/**
 * A function for collecting data from Google Play Console.
 *
 * Google Play Consoleからデータを収集するためのFunction。
 */
export class CollectFromGooglePlayConsole extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     *
     * 関数のID。
     */
    id: string = "collect_from_google_play_console";

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
            console.warn("CollectFromGooglePlayConsole: No googleServiceAccount found in project");
            return {
                ...action,
                results: {
                    "googlePlayConsole": {},
                }
            };
        }

        // 3. コマンドからパラメータを取得
        const packageName = action.command?.data?.packageName as string | undefined;
        const startDate = action.command?.data?.startDate as string | undefined;
        const endDate = action.command?.data?.endDate as string | undefined;

        if (!packageName) {
            console.warn("CollectFromGooglePlayConsole: No packageName found in command");
            return {
                ...action,
                results: {
                    "googlePlayConsole": {},
                }
            };
        }

        // 4. サービスアカウントJSONを一時ファイルに書き出し
        const tempDir = os.tmpdir();
        const tempPath = path.join(tempDir, `sa-${Date.now()}.json`);
        fs.writeFileSync(tempPath, serviceAccountJson);

        try {
            // 5. GooglePlayClientを使用してデータ取得
            const client = new GooglePlayClient({
                serviceAccountPath: tempPath,
                packageName: packageName,
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
                    "googlePlayConsole": data,
                }
            };
        } catch (error: any) {
            console.error("CollectFromGooglePlayConsole: Failed to collect data", error);
            return {
                ...action,
                results: {
                    "googlePlayConsole": {
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
) => new CollectFromGooglePlayConsole(options).build(regions);

// Export class for testing
module.exports.CollectFromGooglePlayConsole = CollectFromGooglePlayConsole;
