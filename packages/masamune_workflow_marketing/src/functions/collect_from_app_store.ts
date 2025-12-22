import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, Project, WorkflowContext } from "@mathrunet/masamune_workflow";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AppStoreClient } from "../clients/app_store_client";
import "@mathrunet/masamune";

/**
 * A function for collecting data from App Store Connect.
 *
 * App Store Connectからデータを収集するためのFunction。
 */
export class CollectFromAppStore extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     *
     * 関数のID。
     */
    id: string = "collect_from_app_store";

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
        const issuerId = projectData?.appstoreIssuerId;
        const authKeyId = projectData?.appstoreAuthKeyId;
        const authKey = projectData?.appstoreAuthKey;

        // 2. App Store認証情報が無ければ空結果を返す
        if (!issuerId || !authKeyId || !authKey) {
            console.warn("CollectFromAppStore: No App Store credentials found in project");
            return {
                ...action,
                results: {
                    "appStore": {},
                }
            };
        }

        // 3. コマンドからパラメータを取得
        const appId = action.command?.data?.appId as string | undefined;
        const vendorNumber = action.command?.data?.vendorNumber as string | undefined;
        const startDate = action.command?.data?.startDate as string | undefined;
        const endDate = action.command?.data?.endDate as string | undefined;

        if (!appId) {
            console.warn("CollectFromAppStore: No appId found in command");
            return {
                ...action,
                results: {
                    "appStore": {},
                }
            };
        }

        // 4. P8キーを一時ファイルに書き出し
        const tempDir = os.tmpdir();
        const tempPath = path.join(tempDir, `appstore-key-${Date.now()}.p8`);
        fs.writeFileSync(tempPath, authKey);

        try {
            // 5. AppStoreClientを使用してデータ取得
            const client = new AppStoreClient({
                keyId: authKeyId,
                issuerId: issuerId,
                privateKeyPath: tempPath,
                appId: appId,
                vendorNumber: vendorNumber,
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
                    "appStore": data,
                }
            };
        } catch (error: any) {
            console.error("CollectFromAppStore: Failed to collect data", error);
            return {
                ...action,
                results: {
                    "appStore": {
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
) => new CollectFromAppStore(options).build(regions);

// Export class for testing
module.exports.CollectFromAppStore = CollectFromAppStore;
