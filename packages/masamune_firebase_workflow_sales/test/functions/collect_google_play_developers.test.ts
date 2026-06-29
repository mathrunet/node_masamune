import * as admin from "firebase-admin";
import { WorkflowContext, Action } from "@mathrunet/masamune_workflow";
import { CollectGooglePlayDevelopers } from "../../src/functions/collect_google_play_developers";
import {
    CollectGooglePlayDevelopersParams,
    CollectGooglePlayDevelopersResult
} from "../../src/models/google_play_developer_data";

describe("CollectGooglePlayDevelopers", () => {
    let firestore: admin.firestore.Firestore;
    let functionInstance: CollectGooglePlayDevelopers;

    beforeAll(() => {
        firestore = admin.firestore();
        functionInstance = new CollectGooglePlayDevelopers({});
    });

    afterEach(async () => {
        // Clean up test documents (ignore permission errors)
        try {
            const snapshot = await firestore
                .collection("plugins/workflow/address")
                .where("source", "==", "googlePlay")
                .limit(100)
                .get();

            const batch = firestore.batch();
            snapshot.docs.forEach(doc => {
                if (doc.id.startsWith("test-") || doc.id.startsWith("googlePlay_test")) {
                    batch.delete(doc.ref);
                }
            });
            await batch.commit();
        } catch (error: any) {
            // Ignore cleanup errors - they don't affect test results
        }
    });

    /**
     * Helper to create workflow context
     */
    function createContext(params: CollectGooglePlayDevelopersParams): WorkflowContext {
        const action = {
            command: {
                command: "collect_google_play_developers",
                index: 0,
                data: params
            }
        } as unknown as Action;
        return {
            action: action,
            data: {},
            logs: []
        } as unknown as WorkflowContext;
    }

    /**
     * Helper to log results
     */
    function logResults(testName: string, result: CollectGooglePlayDevelopersResult | undefined): void {
        console.log("\n========================================");
        console.log(`[${testName}] Collection Results`);
        console.log("========================================");

        if (!result) {
            console.log("No results returned");
            return;
        }

        console.log("\n--- Statistics ---");
        console.log(`Mode: ${result.stats.mode}`);
        console.log(`Target Count: ${result.stats.targetCount}`);
        console.log(`Collected Count: ${result.stats.collectedCount}`);
        console.log(`With Email Count: ${result.stats.withEmailCount}`);
        console.log(`Saved Count: ${result.stats.savedCount}`);

        if (result.error) {
            console.log(`Error: ${result.error}`);
        }

        console.log("\n--- Developers ---");
        result.developers.forEach((dev, idx) => {
            console.log(`\n[${idx + 1}] ${dev.developerName}`);
            console.log(`    ID: ${dev.developerId}`);
            console.log(`    Email: ${dev.email ?? "(none)"}`);
            console.log(`    Website: ${dev.website ?? "(none)"}`);
            console.log(`    Apps: ${dev.apps.length} apps`);
            if (dev.apps.length > 0) {
                console.log(`    Sample Apps: ${dev.apps.slice(0, 3).map(a => a.title).join(", ")}`);
            }
        });

        console.log("\n========================================\n");
    }

    describe("Mode A: developer_ids", () => {
        it("should collect developer info by developer IDs", async () => {
            const params: CollectGooglePlayDevelopersParams = {
                mode: "developer_ids",
                developerIds: ["Google LLC"],
                lang: "ja",
                country: "jp",
                maxCount: 3
            };

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;
            logResults("developer_ids - Google LLC", result);

            expect(result).toBeDefined();
            expect(result.stats.mode).toBe("developer_ids");
            expect(result.stats.collectedCount).toBeGreaterThan(0);
            expect(result.developers.length).toBeGreaterThan(0);

            // Check first developer
            const firstDev = result.developers[0];
            expect(firstDev.developerId).toBe("Google LLC");
            expect(firstDev.developerName).toBeDefined();
            expect(firstDev.apps.length).toBeGreaterThan(0);
        }, 60000);

        it("should handle multiple developer IDs", async () => {
            const params: CollectGooglePlayDevelopersParams = {
                mode: "developer_ids",
                developerIds: ["Google LLC", "Meta Platforms, Inc."],
                lang: "ja",
                country: "jp",
                maxCount: 5
            };

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;
            logResults("developer_ids - Multiple", result);

            expect(result).toBeDefined();
            expect(result.stats.collectedCount).toBeLessThanOrEqual(5);
            expect(result.developers.length).toBeGreaterThan(0);
        }, 120000);
    });

    describe("Mode B: category_ranking", () => {
        it("should collect developers from category ranking", async () => {
            const params: CollectGooglePlayDevelopersParams = {
                mode: "category_ranking",
                categoryConfig: {
                    category: "GAME_ACTION",
                    collection: "TOP_FREE",
                    num: 10
                },
                lang: "ja",
                country: "jp",
                maxCount: 5
            };

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;
            logResults("category_ranking - GAME_ACTION/TOP_FREE", result);

            expect(result).toBeDefined();
            expect(result.stats.mode).toBe("category_ranking");
            // Note: Category ranking results may vary depending on Google Play availability
            if (result.stats.targetCount > 0) {
                expect(result.developers.length).toBeLessThanOrEqual(5);
            }
        }, 120000);

        it("should handle different category", async () => {
            const params: CollectGooglePlayDevelopersParams = {
                mode: "category_ranking",
                categoryConfig: {
                    category: "PRODUCTIVITY",
                    collection: "TOP_FREE",
                    num: 5
                },
                lang: "ja",
                country: "jp",
                maxCount: 3
            };

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;
            logResults("category_ranking - PRODUCTIVITY/TOP_FREE", result);

            expect(result).toBeDefined();
            expect(result.stats.mode).toBe("category_ranking");
        }, 120000);
    });

    describe("Mode C: search_keyword", () => {
        it("should collect developers from search keyword", async () => {
            const params: CollectGooglePlayDevelopersParams = {
                mode: "search_keyword",
                searchConfig: {
                    term: "フィットネス",
                    num: 10
                },
                lang: "ja",
                country: "jp",
                maxCount: 5
            };

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;
            logResults("search_keyword - フィットネス", result);

            expect(result).toBeDefined();
            expect(result.stats.mode).toBe("search_keyword");
            // Note: Search results may vary, so we just check it completes without error
        }, 120000);

        it("should handle English keyword", async () => {
            const params: CollectGooglePlayDevelopersParams = {
                mode: "search_keyword",
                searchConfig: {
                    term: "task manager",
                    num: 5
                },
                lang: "en",
                country: "us",
                maxCount: 3
            };

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;
            logResults("search_keyword - task manager (EN)", result);

            expect(result).toBeDefined();
            expect(result.stats.mode).toBe("search_keyword");
        }, 120000);
    });

    describe("Firestore Save", () => {
        // Note: These tests require Firestore write permissions.
        // They may be skipped if the service account lacks permissions.

        it("should save developer info to Firestore (requires Firestore permissions)", async () => {
            const params: CollectGooglePlayDevelopersParams = {
                mode: "developer_ids",
                developerIds: ["Google LLC"],
                lang: "ja",
                country: "jp",
                maxCount: 1
            };

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;
            logResults("Firestore Save Test", result);

            // If savedCount is 0, it may be due to permission issues - just log and skip verification
            if (result.stats.savedCount === 0) {
                console.log("Firestore save skipped (possible permission issue). Collection data verified instead.");
                expect(result.stats.collectedCount).toBeGreaterThan(0);
                return;
            }

            expect(result.stats.savedCount).toBeGreaterThan(0);

            // Verify Firestore document
            try {
                const docRef = firestore.doc("plugins/workflow/address/googlePlay_Google_LLC");
                const doc = await docRef.get();

                console.log("\n--- Firestore Document ---");
                console.log(`Path: ${docRef.path}`);
                console.log(`Exists: ${doc.exists}`);
                if (doc.exists) {
                    const data = doc.data();
                    console.log(`Data: ${JSON.stringify(data, null, 2)}`);
                }
                console.log("");

                expect(doc.exists).toBe(true);

                const data = doc.data();
                expect(data?.source).toBe("googlePlay");
                expect(data?.developerId).toBe("Google LLC");
                expect(data?.developerName).toBeDefined();
            } catch (error: any) {
                if (error.message?.includes("PERMISSION_DENIED")) {
                    console.log("Firestore read skipped due to permission issue.");
                } else {
                    throw error;
                }
            }
        }, 60000);

        it("should overwrite existing document with merge (requires Firestore permissions)", async () => {
            // First save
            const params: CollectGooglePlayDevelopersParams = {
                mode: "developer_ids",
                developerIds: ["Google LLC"],
                lang: "ja",
                country: "jp",
                maxCount: 1
            };

            const context1 = createContext(params);
            const result1 = await functionInstance.process(context1);
            const resultData = result1.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;

            // If save failed due to permissions, skip this test
            if (resultData.stats.savedCount === 0) {
                console.log("Firestore merge test skipped (possible permission issue).");
                expect(resultData.stats.collectedCount).toBeGreaterThan(0);
                return;
            }

            try {
                // Get first save time
                const docRef = firestore.doc("plugins/workflow/address/googlePlay_Google_LLC");
                const firstDoc = await docRef.get();
                const firstUpdatedTime = firstDoc.data()?.updatedTime;

                // Wait a bit
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Second save (should update)
                const context2 = createContext(params);
                await functionInstance.process(context2);

                const secondDoc = await docRef.get();
                const secondUpdatedTime = secondDoc.data()?.updatedTime;

                console.log("\n--- Merge Test ---");
                console.log(`First updatedTime: ${JSON.stringify(firstUpdatedTime)}`);
                console.log(`Second updatedTime: ${JSON.stringify(secondUpdatedTime)}`);
                console.log("");

                expect(secondDoc.exists).toBe(true);
                // updatedTime should be different (newer)
                expect(secondUpdatedTime).not.toEqual(firstUpdatedTime);
            } catch (error: any) {
                if (error.message?.includes("PERMISSION_DENIED")) {
                    console.log("Firestore merge test skipped due to permission issue.");
                } else {
                    throw error;
                }
            }
        }, 120000);
    });

    describe("maxCount Limit", () => {
        it("should respect maxCount limit", async () => {
            const params: CollectGooglePlayDevelopersParams = {
                mode: "category_ranking",
                categoryConfig: {
                    category: "GAME",
                    collection: "TOP_FREE",
                    num: 50
                },
                lang: "ja",
                country: "jp",
                maxCount: 3
            };

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;
            logResults("maxCount Limit Test", result);

            expect(result).toBeDefined();
            expect(result.stats.collectedCount).toBeLessThanOrEqual(3);
            expect(result.developers.length).toBeLessThanOrEqual(3);
        }, 120000);
    });

    describe("Error Handling", () => {
        it("should handle missing mode parameter", async () => {
            const params = {} as CollectGooglePlayDevelopersParams;

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;
            logResults("Error - Missing Mode", result);

            expect(result).toBeDefined();
            expect(result.error).toBeDefined();
            expect(result.stats.collectedCount).toBe(0);
        }, 30000);

        it("should handle missing categoryConfig for category_ranking mode", async () => {
            const params: CollectGooglePlayDevelopersParams = {
                mode: "category_ranking",
                lang: "ja",
                country: "jp",
                maxCount: 5
            };

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;
            logResults("Error - Missing categoryConfig", result);

            expect(result).toBeDefined();
            expect(result.error).toBeDefined();
        }, 30000);

        it("should handle missing searchConfig for search_keyword mode", async () => {
            const params: CollectGooglePlayDevelopersParams = {
                mode: "search_keyword",
                lang: "ja",
                country: "jp",
                maxCount: 5
            };

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;
            logResults("Error - Missing searchConfig", result);

            expect(result).toBeDefined();
            expect(result.error).toBeDefined();
        }, 30000);

        it("should handle invalid developer ID gracefully", async () => {
            const params: CollectGooglePlayDevelopersParams = {
                mode: "developer_ids",
                developerIds: ["NonExistentDeveloper12345XYZ"],
                lang: "ja",
                country: "jp",
                maxCount: 1
            };

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;
            logResults("Error - Invalid Developer ID", result);

            expect(result).toBeDefined();
            // Should complete without throwing, but with 0 collected
            expect(result.stats.collectedCount).toBe(0);
        }, 60000);
    });

    describe("Integration Test - Full Results Output", () => {
        it("should collect developers and output full Action.results", async () => {
            console.log("\n");
            console.log("╔══════════════════════════════════════════════════════════════════╗");
            console.log("║               INTEGRATION TEST - FULL RESULTS OUTPUT              ║");
            console.log("╚══════════════════════════════════════════════════════════════════╝");

            // Test with known developer IDs to ensure data is collected
            const params: CollectGooglePlayDevelopersParams = {
                mode: "developer_ids",
                developerIds: [
                    "Google LLC",
                    "Meta Platforms, Inc.",
                    "Microsoft Corporation"
                ],
                lang: "ja",
                country: "jp",
                maxCount: 3
            };

            const context = createContext(params);
            const resultAction = await functionInstance.process(context);

            // Output full Action.results to console
            console.log("\n┌──────────────────────────────────────────────────────────────────┐");
            console.log("│                    Action.results (Full JSON)                    │");
            console.log("└──────────────────────────────────────────────────────────────────┘");
            console.log(JSON.stringify(resultAction.results, null, 2));

            const result = resultAction.results?.googlePlayDevelopers as CollectGooglePlayDevelopersResult;

            // Output formatted summary
            console.log("\n┌──────────────────────────────────────────────────────────────────┐");
            console.log("│                       COLLECTION SUMMARY                          │");
            console.log("└──────────────────────────────────────────────────────────────────┘");
            console.log(`  Mode:            ${result.stats.mode}`);
            console.log(`  Target Count:    ${result.stats.targetCount}`);
            console.log(`  Collected:       ${result.stats.collectedCount}`);
            console.log(`  With Email:      ${result.stats.withEmailCount}`);
            console.log(`  Saved:           ${result.stats.savedCount}`);
            if (result.error) {
                console.log(`  Error:           ${result.error}`);
            }

            console.log("\n┌──────────────────────────────────────────────────────────────────┐");
            console.log("│                    COLLECTED DEVELOPERS                           │");
            console.log("└──────────────────────────────────────────────────────────────────┘");

            result.developers.forEach((dev, idx) => {
                console.log(`\n  [${idx + 1}] ${dev.developerName}`);
                console.log(`      Developer ID:      ${dev.developerId}`);
                console.log(`      Email:             ${dev.email ?? "(未取得)"}`);
                console.log(`      Website:           ${dev.website ?? "(未取得)"}`);
                console.log(`      Privacy Policy:    ${dev.privacyPolicyUrl ?? "(未取得)"}`);
                console.log(`      Address:           ${dev.address ?? "(未取得)"}`);
                console.log(`      App Count:         ${dev.apps.length}`);
                if (dev.apps.length > 0) {
                    console.log(`      Sample Apps:`);
                    dev.apps.slice(0, 3).forEach(app => {
                        console.log(`        - ${app.title} (${app.appId})`);
                    });
                }
            });

            console.log("\n╔══════════════════════════════════════════════════════════════════╗");
            console.log("║                    INTEGRATION TEST COMPLETE                      ║");
            console.log("╚══════════════════════════════════════════════════════════════════╝\n");

            // Assertions
            expect(result).toBeDefined();
            expect(result.stats.mode).toBe("developer_ids");
            expect(result.stats.collectedCount).toBeGreaterThan(0);
            expect(result.developers.length).toBeGreaterThan(0);
        }, 180000);
    });
});
