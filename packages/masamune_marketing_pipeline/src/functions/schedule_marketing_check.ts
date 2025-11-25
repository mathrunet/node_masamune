import * as functions from "firebase-functions/v2";
import { SchedulerFunctionsOptions, firestoreLoader } from "@mathrunet/masamune";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { MarketingAppConfig, MarketingReportRequest } from "../models/app_config";
import { isReportDue, getReportDateRange } from "../utils/date_utils";
import { logError } from "../utils/error_handler";

/**
 * Periodically check for apps that need marketing reports generated.
 *
 * マーケティングレポートの生成が必要なアプリを定期的にチェックします。
 *
 * This function runs every 1 minute (configurable) and:
 * 1. Queries all active marketing apps
 * 2. Checks if each app is due for a report based on its schedule
 * 3. Creates a report request for apps that are due
 */
module.exports = (
    regions: string[],
    options: SchedulerFunctionsOptions,
    data: { [key: string]: any }
) => functions.scheduler.onSchedule(
    {
        schedule: options.schedule ?? "every 1 minutes",
        region: options.region ?? regions[0],
        timeoutSeconds: options.timeoutSeconds ?? 60,
        memory: options.memory ?? "256MiB",
        minInstances: options.minInstances,
        concurrency: options.concurrency,
        maxInstances: options.maxInstances,
        serviceAccount: options.serviceAccount ?? undefined,
    },
    async (event) => {
        try {
            const firestoreDatabaseIds = options.firestoreDatabaseIds ?? ["(default)"];

            for (const databaseId of firestoreDatabaseIds) {
                try {
                    await processDatabase(databaseId);
                } catch (err) {
                    logError("ScheduleMarketingCheck", err as Error, { databaseId });
                }
            }
        } catch (err) {
            console.error("Fatal error in schedule_marketing_check:", err);
            throw err;
        }
    }
);

/**
 * Process a single database for marketing report checks.
 */
async function processDatabase(databaseId: string): Promise<void> {
    const firestoreInstance = firestoreLoader(databaseId);

    console.log(`Checking for marketing report tasks in database: ${databaseId || "(default)"}`);

    // Query active apps
    const appsRef = firestoreInstance.collection("plugins/marketing/apps");
    const activeAppsSnapshot = await appsRef
        .where("status", "==", "active")
        .get();

    if (activeAppsSnapshot.empty) {
        console.log("No active marketing apps found.");
        return;
    }

    console.log(`Found ${activeAppsSnapshot.size} active apps to check.`);

    const now = new Date();

    for (const appDoc of activeAppsSnapshot.docs) {
        try {
            const appConfig = appDoc.data() as MarketingAppConfig;
            const lastGeneratedAt = appConfig.lastReportGeneratedAt?.toDate();

            // Check if report is due
            if (!isReportDue(appConfig.reportSchedule, lastGeneratedAt, now)) {
                continue;
            }

            // Check if there's already a pending or in-progress request
            const existingRequest = await checkExistingRequest(
                firestoreInstance,
                appConfig.appId
            );

            if (existingRequest) {
                console.log(`Skipping ${appConfig.appName}: request already in progress`);
                continue;
            }

            // Create new report request
            await createReportRequest(firestoreInstance, appConfig, now);

        } catch (err) {
            logError("ProcessApp", err as Error, { appId: appDoc.id });
        }
    }
}

/**
 * Check if there's an existing pending or in-progress request for the app.
 */
async function checkExistingRequest(
    firestore: FirebaseFirestore.Firestore,
    appId: string
): Promise<boolean> {
    const requestsRef = firestore.collection("plugins/marketing/requests");
    const existingSnapshot = await requestsRef
        .where("appId", "==", appId)
        .where("status", "in", [
            "pending",
            "collecting_google_play",
            "collecting_firebase_analytics",
            "collecting_github",
            "collecting_app_store",
            "analyzing",
            "generating_report",
            "generating_pdf",
        ])
        .limit(1)
        .get();

    return !existingSnapshot.empty;
}

/**
 * Create a new report request for the app.
 */
async function createReportRequest(
    firestore: FirebaseFirestore.Firestore,
    appConfig: MarketingAppConfig,
    referenceDate: Date
): Promise<void> {
    const requestsRef = firestore.collection("plugins/marketing/requests");
    const requestId = requestsRef.doc().id;

    const dateRange = getReportDateRange(appConfig.reportSchedule, referenceDate);

    const request: MarketingReportRequest = {
        requestId,
        appId: appConfig.appId,
        reportType: appConfig.reportSchedule,
        dateRange,
        status: "pending",
        currentStep: "Waiting to start",
        progress: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    };

    await requestsRef.doc(requestId).set(request);

    // Update the app's lastReportGeneratedAt to prevent duplicate requests
    // This is set at the start to prevent race conditions
    // If the report fails, this should be reverted
    await firestore.doc(`plugins/marketing/apps/${appConfig.appId}`).update({
        lastReportGeneratedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    });

    console.log(
        `Created report request ${requestId} for app ${appConfig.appName} ` +
        `(${appConfig.reportSchedule}, ${dateRange.startDate} to ${dateRange.endDate})`
    );
}
