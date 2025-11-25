import * as functions from "firebase-functions/v2";
import { HttpFunctionsOptions, firestoreLoader } from "@mathrunet/masamune";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { MarketingAppConfig, MarketingReportRequest } from "../models/app_config";
import { CombinedMarketingData } from "../models/marketing_data";
import { logError, MarketingPipelineError, ErrorCategory } from "../utils/error_handler";

/**
 * Collect marketing data from all configured sources.
 *
 * マーケティングデータをすべての設定されたソースから収集します。
 *
 * This function:
 * 1. Receives a request ID
 * 2. Loads the app configuration
 * 3. Collects data from Google Play, Firebase Analytics, GitHub, App Store
 * 4. Saves the combined data and triggers report generation
 */
module.exports = (
    regions: string[],
    options: HttpFunctionsOptions,
    data: { [key: string]: any }
) => {
    return functions.https.onCall(
        {
            region: options.region ?? regions,
            timeoutSeconds: options.timeoutSeconds ?? 540, // 9 minutes
            memory: options.memory ?? "1GiB",
            minInstances: options.minInstances,
            concurrency: options.concurrency,
            maxInstances: options.maxInstances,
            serviceAccount: options.serviceAccount ?? undefined,
            enforceAppCheck: options.enforceAppCheck ?? undefined,
            consumeAppCheckToken: options.consumeAppCheckToken ?? undefined,
        },
        async (query) => {
            const requestData = query.data;
            const requestId = requestData?.requestId;
            const databaseId = requestData?.databaseId ?? "(default)";

            if (!requestId) {
                throw new functions.https.HttpsError(
                    "invalid-argument",
                    "The function must be called with a requestId."
                );
            }

            const firestore = firestoreLoader(databaseId);

            try {
                // Load request
                const requestDoc = await firestore
                    .doc(`plugins/marketing/requests/${requestId}`)
                    .get();

                if (!requestDoc.exists) {
                    throw new functions.https.HttpsError(
                        "not-found",
                        "Request not found."
                    );
                }

                const request = requestDoc.data() as MarketingReportRequest;

                // Load app config
                const appDoc = await firestore
                    .doc(`plugins/marketing/apps/${request.appId}`)
                    .get();

                if (!appDoc.exists) {
                    throw new functions.https.HttpsError(
                        "not-found",
                        "App configuration not found."
                    );
                }

                const appConfig = appDoc.data() as MarketingAppConfig;

                // Collect data from all sources
                const combinedData = await collectAllData(
                    firestore,
                    requestDoc.ref,
                    appConfig,
                    request
                );

                // Save combined data to the request
                await requestDoc.ref.update({
                    rawData: combinedData,
                    status: "analyzing",
                    currentStep: "Data collection complete. Starting analysis.",
                    progress: 50,
                    updatedAt: Timestamp.now(),
                });

                return {
                    success: true,
                    requestId,
                    dataCollected: {
                        googlePlay: !!combinedData.googlePlay,
                        firebaseAnalytics: !!combinedData.firebaseAnalytics,
                        github: !!combinedData.github,
                        appStore: !!combinedData.appStore,
                    },
                };

            } catch (error: any) {
                logError("CollectMarketingData", error, { requestId });

                // Update request status to failed
                await firestore.doc(`plugins/marketing/requests/${requestId}`).update({
                    status: "failed",
                    error: error.message,
                    updatedAt: Timestamp.now(),
                });

                if (error instanceof functions.https.HttpsError) {
                    throw error;
                }

                throw new functions.https.HttpsError(
                    "internal",
                    `Failed to collect marketing data: ${error.message}`
                );
            }
        }
    );
};

/**
 * Collect data from all configured sources.
 */
async function collectAllData(
    firestore: FirebaseFirestore.Firestore,
    requestRef: FirebaseFirestore.DocumentReference,
    appConfig: MarketingAppConfig,
    request: MarketingReportRequest
): Promise<CombinedMarketingData> {
    const combinedData: CombinedMarketingData = {
        appId: appConfig.appId,
        dateRange: request.dateRange,
        collectedAt: new Date(),
    };

    // Collect Google Play data
    if (appConfig.googlePlayPackageId) {
        await updateRequestStatus(requestRef, "collecting_google_play", "Collecting Google Play data...", 10);
        try {
            // TODO: Implement Google Play client
            console.log(`Collecting Google Play data for ${appConfig.googlePlayPackageId}`);
            // combinedData.googlePlay = await googlePlayClient.collectData(...);
        } catch (error: any) {
            logError("CollectGooglePlay", error, { appId: appConfig.appId });
            // Continue with other sources
        }
    }

    // Collect Firebase Analytics data
    if (appConfig.firebaseAnalyticsPropertyId) {
        await updateRequestStatus(requestRef, "collecting_firebase_analytics", "Collecting Firebase Analytics data...", 20);
        try {
            // TODO: Implement Firebase Analytics client
            console.log(`Collecting Firebase Analytics data for ${appConfig.firebaseAnalyticsPropertyId}`);
            // combinedData.firebaseAnalytics = await firebaseAnalyticsClient.collectData(...);
        } catch (error: any) {
            logError("CollectFirebaseAnalytics", error, { appId: appConfig.appId });
            // Continue with other sources
        }
    }

    // Collect GitHub data
    if (appConfig.githubRepo) {
        await updateRequestStatus(requestRef, "collecting_github", "Collecting GitHub data...", 30);
        try {
            // TODO: Implement GitHub client
            console.log(`Collecting GitHub data for ${appConfig.githubRepo}`);
            // combinedData.github = await githubClient.collectData(...);
        } catch (error: any) {
            logError("CollectGitHub", error, { appId: appConfig.appId });
            // Continue with other sources
        }
    }

    // Collect App Store data
    if (appConfig.appStoreAppId) {
        await updateRequestStatus(requestRef, "collecting_app_store", "Collecting App Store data...", 40);
        try {
            // TODO: Implement App Store client
            console.log(`Collecting App Store data for ${appConfig.appStoreAppId}`);
            // combinedData.appStore = await appStoreClient.collectData(...);
        } catch (error: any) {
            logError("CollectAppStore", error, { appId: appConfig.appId });
            // Continue with other sources
        }
    }

    return combinedData;
}

/**
 * Update request status in Firestore.
 */
async function updateRequestStatus(
    requestRef: FirebaseFirestore.DocumentReference,
    status: string,
    currentStep: string,
    progress: number
): Promise<void> {
    await requestRef.update({
        status,
        currentStep,
        progress,
        updatedAt: Timestamp.now(),
    });
}
