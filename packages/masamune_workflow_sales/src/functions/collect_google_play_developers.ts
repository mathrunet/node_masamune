import * as admin from "firebase-admin";
import { HttpFunctionsOptions, ModelTimestamp } from "@mathrunet/masamune";
import { Action, WorkflowProcessFunctionBase, WorkflowContext } from "@mathrunet/masamune_workflow";
import { GooglePlayScraperClient } from "../clients/google_play_scraper_client";
import {
    CollectGooglePlayDevelopersParams,
    GooglePlayDeveloperInfo,
    AddressDocument,
    CollectionStats,
    CollectGooglePlayDevelopersResult
} from "../models/google_play_developer_data";

/**
 * A function for collecting developer information from Google Play.
 *
 * Google Playからデベロッパー情報を収集するためのFunction。
 */
export class CollectGooglePlayDevelopers extends WorkflowProcessFunctionBase {
    /**
     * The ID of the function.
     *
     * 関数のID。
     */
    id: string = "collect_google_play_developers";

    /**
     * The process of the function.
     *
     * @param context The context of the function.
     * @returns The action of the function.
     */
    async process(context: WorkflowContext): Promise<Action> {
        const action = context.action;
        const params = action.command?.data as CollectGooglePlayDevelopersParams | undefined;

        // 1. Validate parameters
        if (!params?.mode) {
            console.warn("CollectGooglePlayDevelopers: No mode specified");
            return {
                ...action,
                results: {
                    googlePlayDevelopers: {
                        stats: {
                            mode: "unknown",
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
        const client = new GooglePlayScraperClient({
            lang: params.lang ?? "ja",
            country: params.country ?? "jp"
        });

        const maxCount = params.maxCount ?? 100;
        const collectedDevelopers: GooglePlayDeveloperInfo[] = [];
        const processedDevIds = new Set<string>();
        let savedCount = 0;

        try {
            // 3. Get target developer IDs based on mode
            let targetDevIds: string[] = [];

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

            console.log(`CollectGooglePlayDevelopers: Found ${targetDevIds.length} target developers`);

            // 4. Collect developer information
            for (const devId of targetDevIds) {
                if (collectedDevelopers.length >= maxCount) {
                    console.log(`CollectGooglePlayDevelopers: Reached maxCount limit (${maxCount})`);
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

                        console.log(`CollectGooglePlayDevelopers: Collected ${devInfo.developerName} (email: ${devInfo.email ?? "none"})`);
                    }
                } catch (err: any) {
                    console.warn(`CollectGooglePlayDevelopers: Failed to collect developer: ${devId}`, err.message);
                }
            }

            // 6. Create statistics
            const stats: CollectionStats = {
                mode: params.mode,
                targetCount: targetDevIds.length,
                collectedCount: collectedDevelopers.length,
                withEmailCount: collectedDevelopers.filter(d => d.email).length,
                savedCount: savedCount
            };

            const result: CollectGooglePlayDevelopersResult = {
                stats: stats,
                developers: collectedDevelopers
            };

            console.log(`CollectGooglePlayDevelopers: Completed - ${stats.collectedCount} collected, ${stats.withEmailCount} with email`);

            // 7. Return results
            return {
                ...action,
                results: {
                    googlePlayDevelopers: result
                }
            };

        } catch (error: any) {
            console.error("CollectGooglePlayDevelopers: Failed to collect data", error);
            return {
                ...action,
                results: {
                    googlePlayDevelopers: {
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
        }
    }

    /**
     * Save developer info to Firestore.
     *
     * デベロッパー情報をFirestoreに保存。
     *
     * @param devInfo Developer information / デベロッパー情報
     */
    private async saveToFirestore(devInfo: GooglePlayDeveloperInfo): Promise<void> {
        const firestore = admin.firestore();
        const docId = `googlePlay_${this.sanitizeId(devInfo.developerId)}`;
        const docPath = `plugins/workflow/address/${docId}`;

        const now = admin.firestore.Timestamp.now();

        // Convert ModelTimestamp to Firestore Timestamp
        const collectedTimestamp = devInfo.collectedTime
            ? admin.firestore.Timestamp.fromDate(devInfo.collectedTime.value())
            : now;

        // Build document, omitting undefined values
        const addressDoc: { [key: string]: any } = {
            source: "googlePlay",
            developerId: devInfo.developerId,
            developerName: devInfo.developerName,
            appNames: devInfo.apps.slice(0, 5).map(a => a.title),
            appSummaries: devInfo.apps.slice(0, 3).map(a => a.summary ?? ""),
            appCount: devInfo.apps.length,
            collectedTime: collectedTimestamp,
            updatedTime: now
        };

        // Add optional fields only if they have values
        if (devInfo.companyName) addressDoc.companyName = devInfo.companyName;
        if (devInfo.email) addressDoc.email = devInfo.email;
        if (devInfo.website) addressDoc.website = devInfo.website;
        if (devInfo.privacyPolicyUrl) addressDoc.privacyPolicyUrl = devInfo.privacyPolicyUrl;
        if (devInfo.address) addressDoc.address = devInfo.address;

        await firestore.doc(docPath).set(addressDoc, { merge: true });
    }

    /**
     * Sanitize developer ID for Firestore document ID.
     *
     * FirestoreドキュメントID用にデベロッパーIDをサニタイズ。
     *
     * @param id Developer ID / デベロッパーID
     * @returns Sanitized ID / サニタイズされたID
     */
    private sanitizeId(id: string): string {
        return id
            .replace(/[\/\.#\$\[\]]/g, "_")
            .replace(/\s+/g, "_")
            .replace(/,/g, "");
    }
}

module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => new CollectGooglePlayDevelopers(options).build(regions);

// Export class for testing
module.exports.CollectGooglePlayDevelopers = CollectGooglePlayDevelopers;
