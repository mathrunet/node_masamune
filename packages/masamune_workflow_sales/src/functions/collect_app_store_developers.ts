import * as admin from "firebase-admin";
import { HttpFunctionsOptions } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, WorkflowContext } from "@mathrunet/masamune_workflow";
import { AppStoreScraperClient } from "../clients/app_store_scraper_client";
import {
    CollectAppStoreDevelopersParams,
    AppStoreDeveloperInfo,
    AppStoreCollectionStats,
    CollectAppStoreDevelopersResult
} from "../models/app_store_developer_data";

/**
 * A function for collecting developer information from App Store.
 *
 * App Storeからデベロッパー情報を収集するためのFunction。
 */
export class CollectAppStoreDevelopers extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     *
     * 関数のID。
     */
    id: string = "collect_app_store_developers";

    /**
     * The process of the function.
     *
     * @param context The context of the function.
     * @returns The action of the function.
     */
    async process(context: WorkflowContext): Promise<Action> {
        const action = context.action;
        const params = action.command?.data as CollectAppStoreDevelopersParams | undefined;

        // 1. Validate parameters
        if (!params?.mode) {
            console.warn("CollectAppStoreDevelopers: No mode specified");
            return {
                ...action,
                results: {
                    appStoreDevelopers: {
                        stats: {
                            mode: "developer_ids",
                            targetCount: 0,
                            collectedCount: 0,
                            withEmailCount: 0,
                            savedCount: 0
                        },
                        developers: [],
                        error: "No mode specified in command parameters"
                    }
                }
            };
        }

        // 2. Initialize client
        const client = new AppStoreScraperClient({
            lang: params.lang ?? "ja",
            country: params.country ?? "jp",
            enableWebsiteScraping: true
        });

        const maxCount = params.maxCount ?? 100;
        const collectedDevelopers: AppStoreDeveloperInfo[] = [];
        const processedDevIds = new Set<number>();
        let savedCount = 0;

        try {
            // 3. Get target developer IDs based on mode
            let targetDevIds: number[] = [];

            switch (params.mode) {
                case "developer_ids":
                    targetDevIds = params.developerIds ?? [];
                    break;

                case "category_ranking":
                    if (!params.categoryConfig) {
                        throw new Error("categoryConfig is required for category_ranking mode");
                    }
                    const listApps = await client.getListApps(params.categoryConfig);
                    targetDevIds = client.extractDeveloperIds(listApps);
                    break;

                case "search_keyword":
                    if (!params.searchConfig) {
                        throw new Error("searchConfig is required for search_keyword mode");
                    }
                    const searchApps = await client.searchApps(params.searchConfig);
                    targetDevIds = client.extractDeveloperIds(searchApps);
                    break;

                default:
                    throw new Error(`Unknown mode: ${params.mode}`);
            }

            console.log(`CollectAppStoreDevelopers: Found ${targetDevIds.length} target developers`);

            // 4. Collect developer information
            for (const devId of targetDevIds) {
                if (collectedDevelopers.length >= maxCount) {
                    console.log(`CollectAppStoreDevelopers: Reached maxCount limit (${maxCount})`);
                    break;
                }

                if (processedDevIds.has(devId)) {
                    continue;
                }
                processedDevIds.add(devId);

                try {
                    const devInfo = await client.getDeveloperInfo(devId);
                    if (devInfo) {
                        collectedDevelopers.push(devInfo);

                        // 5. Save to Firestore
                        await this.saveToFirestore(devInfo);
                        savedCount++;

                        console.log(`CollectAppStoreDevelopers: Collected ${devInfo.developerName} (email: ${devInfo.email ?? "none"})`);
                    }
                } catch (err: any) {
                    console.warn(`CollectAppStoreDevelopers: Failed to collect developer: ${devId}`, err.message);
                }
            }

            // 6. Create statistics
            const stats: AppStoreCollectionStats = {
                mode: params.mode,
                targetCount: targetDevIds.length,
                collectedCount: collectedDevelopers.length,
                withEmailCount: collectedDevelopers.filter(d => d.email).length,
                savedCount: savedCount
            };

            const result: CollectAppStoreDevelopersResult = {
                stats: stats,
                developers: collectedDevelopers
            };

            console.log(`CollectAppStoreDevelopers: Completed - ${stats.collectedCount} collected, ${stats.withEmailCount} with email`);

            // 7. Return results
            return {
                ...action,
                results: {
                    appStoreDevelopers: result
                }
            };

        } catch (error: any) {
            console.error("CollectAppStoreDevelopers: Failed to collect data", error);
            return {
                ...action,
                results: {
                    appStoreDevelopers: {
                        stats: {
                            mode: params.mode,
                            targetCount: 0,
                            collectedCount: collectedDevelopers.length,
                            withEmailCount: collectedDevelopers.filter(d => d.email).length,
                            savedCount: savedCount
                        },
                        developers: collectedDevelopers,
                        error: error.message
                    }
                }
            };
        } finally {
            // 8. Cleanup browser resources
            await client.close();
        }
    }

    /**
     * Save developer info to Firestore.
     *
     * デベロッパー情報をFirestoreに保存。
     *
     * @param devInfo Developer information / デベロッパー情報
     */
    private async saveToFirestore(devInfo: AppStoreDeveloperInfo): Promise<void> {
        const firestore = admin.firestore();
        const docId = `appStore_${devInfo.developerId}`;
        const docPath = `plugins/workflow/address/${docId}`;

        const now = admin.firestore.Timestamp.now();

        // Convert ModelTimestamp to Firestore Timestamp
        const collectedTimestamp = devInfo.collectedTime
            ? admin.firestore.Timestamp.fromDate(devInfo.collectedTime.value())
            : now;

        // Build document, omitting undefined values
        const addressDoc: { [key: string]: any } = {
            source: "appStore",
            developerId: devInfo.developerId,
            developerName: devInfo.developerName,
            appNames: devInfo.apps.slice(0, 5).map(a => a.title),
            appDescriptions: devInfo.apps.slice(0, 3).map(a => a.description ?? ""),
            appCount: devInfo.apps.length,
            collectedTime: collectedTimestamp,
            updatedTime: now
        };

        // Add optional fields only if they have values
        if (devInfo.companyName) addressDoc.companyName = devInfo.companyName;
        if (devInfo.email) addressDoc.email = devInfo.email;
        if (devInfo.website) addressDoc.website = devInfo.website;
        if (devInfo.developerUrl) addressDoc.developerUrl = devInfo.developerUrl;
        if (devInfo.contactPageUrls && devInfo.contactPageUrls.length > 0) {
            addressDoc.contactPageUrls = devInfo.contactPageUrls;
        }

        await firestore.doc(docPath).set(addressDoc, { merge: true });
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new CollectAppStoreDevelopers(options).build(regions);

// Export class for testing
module.exports.CollectAppStoreDevelopers = CollectAppStoreDevelopers;
