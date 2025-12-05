import * as admin from "firebase-admin";
import "@mathrunet/masamune";
import * as dotenv from "dotenv";
import * as path from "path";

// .envファイルを読み込み
dotenv.config({ path: path.resolve(__dirname, ".env") });

const config = require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

describe("Subscription Verify", () => {
    const testUserId = `test-user-${Date.now()}`;
    const subscriptionPath = process.env.PURCHASE_SUBSCRIPTIONPATH || "unit/test/subscriptions";
    let createdDocIds: string[] = [];

    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
    });

    afterAll(async () => {
        // クリーンアップ: テストで作成されたサブスクリプションドキュメントを削除
        const firestore = admin.firestore();
        for (const docId of createdDocIds) {
            try {
                await firestore.collection(subscriptionPath).doc(docId).delete();
                console.log(`Deleted subscription doc: ${subscriptionPath}/${docId}`);
            } catch (e) {
                // 既に削除済みの場合は無視
            }
        }
    });

    describe("Android (Google Play)", () => {
        const hasAndroidCredentials = () => {
            return process.env.PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL &&
                   process.env.PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY &&
                   process.env.PURCHASE_ANDROID_PACKAGE_NAME &&
                   process.env.PURCHASE_ANDROID_SUBSCRIPTION_PRODUCT_ID;
        };

        const hasAndroidTestToken = () => {
            return process.env.PURCHASE_ANDROID_TEST_TOKEN;
        };

        test("エラー: userId未指定", async () => {
            if (!hasAndroidCredentials()) {
                console.log("Skipping: Android credentials not configured");
                return;
            }

            const func = require("../src/functions/subscription_verify_android");
            const wrapped = config.wrap(func([], {}, {}));

            // userId未指定の場合はエラーがスローされる
            await expect(wrapped({
                data: {
                    packageName: process.env.PURCHASE_ANDROID_PACKAGE_NAME,
                    productId: process.env.PURCHASE_ANDROID_SUBSCRIPTION_PRODUCT_ID,
                    purchaseToken: "dummy_token",
                },
                params: {},
            })).rejects.toThrow();
        }, 50000);

        test("エラー: 無効な購入トークン", async () => {
            if (!hasAndroidCredentials()) {
                console.log("Skipping: Android credentials not configured");
                return;
            }

            const func = require("../src/functions/subscription_verify_android");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    userId: testUserId,
                    packageName: process.env.PURCHASE_ANDROID_PACKAGE_NAME,
                    productId: process.env.PURCHASE_ANDROID_SUBSCRIPTION_PRODUCT_ID,
                    purchaseToken: "invalid_token_for_test",
                    purchaseId: "test-purchase-id",
                },
                params: {},
            })).rejects.toThrow();
        }, 50000);

        test("正常系: 有効な購入トークンで検証成功", async () => {
            if (!hasAndroidCredentials() || !hasAndroidTestToken()) {
                console.log("Skipping: Android test token not configured");
                console.log("To run this test, set PURCHASE_ANDROID_TEST_TOKEN in .env");
                return;
            }

            const func = require("../src/functions/subscription_verify_android");
            const wrapped = config.wrap(func([], {}, {}));

            const res = await wrapped({
                data: {
                    userId: testUserId,
                    packageName: process.env.PURCHASE_ANDROID_PACKAGE_NAME,
                    productId: process.env.PURCHASE_ANDROID_SUBSCRIPTION_PRODUCT_ID,
                    purchaseToken: process.env.PURCHASE_ANDROID_TEST_TOKEN,
                    purchaseId: `test-purchase-${Date.now()}`,
                    path: subscriptionPath,
                },
                params: {},
            });

            expect(res).toBeDefined();
            expect(res.startTimeMillis).toBeDefined();
            expect(res.expiryTimeMillis).toBeDefined();
            console.log("Android subscription verified:", JSON.stringify(res, null, 2));

            // Firestoreに保存されたことを確認
            const firestore = admin.firestore();
            const docs = await firestore.collection(subscriptionPath)
                .where("userId", "==", testUserId)
                .get();

            expect(docs.empty).toBe(false);
            console.log(`Found ${docs.size} subscription document(s)`);

            // クリーンアップ用にドキュメントIDを保存
            docs.forEach(doc => createdDocIds.push(doc.id));
        }, 60000);
    });

    describe("iOS (App Store)", () => {
        const hasIOSCredentials = () => {
            return process.env.PURCHASE_IOS_SHAREDSECRET &&
                   process.env.PURCHASE_IOS_SUBSCRIPTION_PRODUCT_ID;
        };

        const hasIOSTestReceipt = () => {
            return process.env.PURCHASE_IOS_TEST_RECEIPT;
        };

        test("エラー: userId未指定", async () => {
            if (!hasIOSCredentials()) {
                console.log("Skipping: iOS credentials not configured");
                return;
            }

            const func = require("../src/functions/subscription_verify_ios");
            const wrapped = config.wrap(func([], {}, {}));

            // userId未指定の場合はエラーがスローされる
            await expect(wrapped({
                data: {
                    receiptData: "dummy_receipt",
                    productId: process.env.PURCHASE_IOS_SUBSCRIPTION_PRODUCT_ID,
                },
                params: {},
            })).rejects.toThrow();
        }, 50000);

        test("エラー: 無効なレシートデータ", async () => {
            if (!hasIOSCredentials()) {
                console.log("Skipping: iOS credentials not configured");
                return;
            }

            const func = require("../src/functions/subscription_verify_ios");
            const wrapped = config.wrap(func([], {}, {}));

            await expect(wrapped({
                data: {
                    userId: testUserId,
                    receiptData: "invalid_receipt_for_test",
                    productId: process.env.PURCHASE_IOS_SUBSCRIPTION_PRODUCT_ID,
                    purchaseId: "test-purchase-id",
                },
                params: {},
            })).rejects.toThrow();
        }, 50000);

        test("正常系: 有効なレシートで検証成功", async () => {
            if (!hasIOSCredentials() || !hasIOSTestReceipt()) {
                console.log("Skipping: iOS test receipt not configured");
                console.log("To run this test, set PURCHASE_IOS_TEST_RECEIPT in .env");
                return;
            }

            const func = require("../src/functions/subscription_verify_ios");
            const wrapped = config.wrap(func([], {}, {}));

            const res = await wrapped({
                data: {
                    userId: testUserId,
                    receiptData: process.env.PURCHASE_IOS_TEST_RECEIPT,
                    transactionId: process.env.PURCHASE_IOS_TEST_TRANSACTION_ID,
                    productId: process.env.PURCHASE_IOS_SUBSCRIPTION_PRODUCT_ID,
                    purchaseId: `test-purchase-${Date.now()}`,
                    path: subscriptionPath,
                },
                params: {},
            });

            expect(res).toBeDefined();
            expect(res.status).toBe(0);
            expect(res.latest_receipt_info).toBeDefined();
            console.log("iOS subscription verified:", JSON.stringify(res, null, 2));

            // Firestoreに保存されたことを確認
            const firestore = admin.firestore();
            const docs = await firestore.collection(subscriptionPath)
                .where("userId", "==", testUserId)
                .get();

            expect(docs.empty).toBe(false);
            console.log(`Found ${docs.size} subscription document(s)`);

            // クリーンアップ用にドキュメントIDを保存
            docs.forEach(doc => createdDocIds.push(doc.id));
        }, 60000);
    });

    describe("バリデーションのみ（認証情報不要）", () => {
        test("Android: 環境変数未設定でもエラーハンドリングが動作", async () => {
            // 一時的に環境変数をクリア
            const originalEmail = process.env.PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL;
            const originalKey = process.env.PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY;
            process.env.PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL = "";
            process.env.PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY = "";

            try {
                jest.resetModules();
                const func = require("../src/functions/subscription_verify_android");
                const wrapped = config.wrap(func([], {}, {}));

                // userId未指定の場合はエラーがスローされる
                await expect(wrapped({
                    data: {
                        packageName: "com.example.app",
                        productId: "test_product",
                        purchaseToken: "test_token",
                    },
                    params: {},
                })).rejects.toThrow();
            } finally {
                process.env.PURCHASE_ANDROID_SERVICEACCOUNT_EMAIL = originalEmail;
                process.env.PURCHASE_ANDROID_SERVICEACCOUNT_PRIVATE_KEY = originalKey;
            }
        }, 50000);

        test("iOS: 環境変数未設定でもエラーハンドリングが動作", async () => {
            // 一時的に環境変数をクリア
            const originalSecret = process.env.PURCHASE_IOS_SHAREDSECRET;
            process.env.PURCHASE_IOS_SHAREDSECRET = "";

            try {
                jest.resetModules();
                const func = require("../src/functions/subscription_verify_ios");
                const wrapped = config.wrap(func([], {}, {}));

                // userId未指定の場合はエラーがスローされる
                await expect(wrapped({
                    data: {
                        receiptData: "test_receipt",
                        productId: "test_product",
                    },
                    params: {},
                })).rejects.toThrow();
            } finally {
                process.env.PURCHASE_IOS_SHAREDSECRET = originalSecret;
            }
        }, 50000);
    });
});
