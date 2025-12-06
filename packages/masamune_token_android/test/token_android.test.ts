import * as admin from "firebase-admin";
import "@mathrunet/masamune";
import * as dotenv from "dotenv";
import * as path from "path";

// .envファイルを読み込み
dotenv.config({ path: path.resolve(__dirname, ".env") });

// firebase-functions-testは初期化のみ（onRequest関数には使用しない）
require("firebase-functions-test")({
    storageBucket: "development-for-mathrunet.appspot.com",
    projectId: "development-for-mathrunet",
}, "test/development-for-mathrunet-e2c2c84b2167.json");

describe("Android Token", () => {
    beforeAll(() => {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
    });

    const hasCredentials = () => {
        return process.env.PURCHASE_ANDROID_CLIENTID &&
               process.env.PURCHASE_ANDROID_CLIENTSECRET &&
               process.env.PURCHASE_ANDROID_REDIRECTURI;
    };

    // onRequest関数のハンドラを取得するヘルパー
    const getRequestHandler = (cloudFunction: any) => {
        // firebase-functions v2のonRequestはCloudFunctionオブジェクトを返す
        // __trigger.httpsTriggerにハンドラ情報がある
        // 実際のハンドラはrun()メソッドで取得できる
        if (typeof cloudFunction === "function") {
            return cloudFunction;
        }
        if (cloudFunction.run) {
            return cloudFunction.run;
        }
        // v2の場合、関数自体がハンドラとして動作
        return cloudFunction;
    };

    describe("android_auth_code", () => {
        test("エラー: id パラメータ未指定", async () => {
            const func = require("../src/functions/android_auth_code");
            const cloudFunc = func([], {}, {});
            const handler = getRequestHandler(cloudFunc);

            const mockReq = {
                query: {},
            } as any;

            let endCalled = false;
            let redirectCalled = false;

            const mockRes = {
                redirect: jest.fn(() => { redirectCalled = true; }),
                end: jest.fn(() => { endCalled = true; }),
            } as any;

            // 環境変数を一時的に設定
            const originalRedirectUri = process.env.PURCHASE_ANDROID_REDIRECTURI;
            process.env.PURCHASE_ANDROID_REDIRECTURI = "https://example.com/callback";

            try {
                await handler(mockReq, mockRes);
                // エラー時は res.end() が呼ばれる
                expect(endCalled).toBe(true);
                expect(redirectCalled).toBe(false);
            } finally {
                process.env.PURCHASE_ANDROID_REDIRECTURI = originalRedirectUri;
            }
        }, 30000);

        test("エラー: REDIRECTURI 環境変数未設定", async () => {
            jest.resetModules();
            const func = require("../src/functions/android_auth_code");
            const cloudFunc = func([], {}, {});
            const handler = getRequestHandler(cloudFunc);

            const mockReq = {
                query: { id: "test-client-id" },
            } as any;

            let endCalled = false;
            let redirectCalled = false;

            const mockRes = {
                redirect: jest.fn(() => { redirectCalled = true; }),
                end: jest.fn(() => { endCalled = true; }),
            } as any;

            // 環境変数をクリア
            const originalRedirectUri = process.env.PURCHASE_ANDROID_REDIRECTURI;
            process.env.PURCHASE_ANDROID_REDIRECTURI = "";

            try {
                await handler(mockReq, mockRes);
                expect(endCalled).toBe(true);
                expect(redirectCalled).toBe(false);
            } finally {
                process.env.PURCHASE_ANDROID_REDIRECTURI = originalRedirectUri;
            }
        }, 30000);

        test("正常系: OAuth認証画面へリダイレクト", async () => {
            if (!process.env.PURCHASE_ANDROID_REDIRECTURI) {
                console.log("Skipping: PURCHASE_ANDROID_REDIRECTURI not configured");
                return;
            }

            jest.resetModules();
            const func = require("../src/functions/android_auth_code");
            const cloudFunc = func([], {}, {});
            const handler = getRequestHandler(cloudFunc);

            const testClientId = "test-client-id-12345";
            const mockReq = {
                query: { id: testClientId },
            } as any;

            let redirectUrl = "";
            const mockRes = {
                redirect: jest.fn((url: string) => { redirectUrl = url; }),
                end: jest.fn(),
            } as any;

            await handler(mockReq, mockRes);

            expect(mockRes.redirect).toHaveBeenCalledTimes(1);

            // リダイレクトURLの検証
            expect(redirectUrl).toContain("https://accounts.google.com/o/oauth2/auth");
            expect(redirectUrl).toContain(`client_id=${testClientId}`);
            expect(redirectUrl).toContain(`redirect_uri=${process.env.PURCHASE_ANDROID_REDIRECTURI}`);
            expect(redirectUrl).toContain("scope=https://www.googleapis.com/auth/androidpublisher");
            expect(redirectUrl).toContain("access_type=offline");

            console.log("Redirect URL:", redirectUrl);
        }, 30000);
    });

    describe("android_token", () => {
        test("エラー: code パラメータ未指定", async () => {
            if (!hasCredentials()) {
                console.log("Skipping: Credentials not configured");
                return;
            }

            jest.resetModules();
            const func = require("../src/functions/android_token");
            const cloudFunc = func([], {}, {});
            const handler = getRequestHandler(cloudFunc);

            const mockReq = {
                query: {},
            } as any;

            let endCalled = false;
            let sendCalled = false;

            const mockRes = {
                send: jest.fn(() => { sendCalled = true; }),
                end: jest.fn(() => { endCalled = true; }),
            } as any;

            await handler(mockReq, mockRes);
            expect(endCalled).toBe(true);
            expect(sendCalled).toBe(false);
        }, 30000);

        test("エラー: 環境変数未設定", async () => {
            jest.resetModules();
            const func = require("../src/functions/android_token");
            const cloudFunc = func([], {}, {});
            const handler = getRequestHandler(cloudFunc);

            // 環境変数を一時的にクリア
            const originalClientId = process.env.PURCHASE_ANDROID_CLIENTID;
            const originalClientSecret = process.env.PURCHASE_ANDROID_CLIENTSECRET;
            const originalRedirectUri = process.env.PURCHASE_ANDROID_REDIRECTURI;

            process.env.PURCHASE_ANDROID_CLIENTID = "";
            process.env.PURCHASE_ANDROID_CLIENTSECRET = "";
            process.env.PURCHASE_ANDROID_REDIRECTURI = "";

            try {
                const mockReq = {
                    query: { code: "test-auth-code" },
                } as any;

                let endCalled = false;
                let sendCalled = false;

                const mockRes = {
                    send: jest.fn(() => { sendCalled = true; }),
                    end: jest.fn(() => { endCalled = true; }),
                } as any;

                await handler(mockReq, mockRes);
                expect(endCalled).toBe(true);
                expect(sendCalled).toBe(false);
            } finally {
                process.env.PURCHASE_ANDROID_CLIENTID = originalClientId;
                process.env.PURCHASE_ANDROID_CLIENTSECRET = originalClientSecret;
                process.env.PURCHASE_ANDROID_REDIRECTURI = originalRedirectUri;
            }
        }, 30000);

        test("エラー: 無効な認証コード", async () => {
            if (!hasCredentials()) {
                console.log("Skipping: Credentials not configured");
                return;
            }

            jest.resetModules();
            const func = require("../src/functions/android_token");
            const cloudFunc = func([], {}, {});
            const handler = getRequestHandler(cloudFunc);

            const mockReq = {
                query: { code: "invalid_auth_code_for_test" },
            } as any;

            let sendCalled = false;
            let sendBody = "";

            const mockRes = {
                send: jest.fn((body: string) => { sendCalled = true; sendBody = body; }),
                end: jest.fn(),
            } as any;

            await handler(mockReq, mockRes);

            // Google OAuth APIにリクエストが送信され、エラーレスポンスでも res.send() が呼ばれる
            // (refresh_tokenがundefinedになる)
            expect(sendCalled).toBe(true);
            expect(sendBody).toContain("RefreshToken:");
            console.log("Response for invalid code:", sendBody);
        }, 30000);
    });

    describe("OAuth フロー統合テスト（手動実行用）", () => {
        test.skip("手動: ブラウザでOAuth認証後、取得したコードでトークン取得", async () => {
            // このテストは手動で実行する必要があります
            // 1. android_auth_code を実行してOAuth認証画面にリダイレクト
            // 2. ブラウザで認証を完了
            // 3. リダイレクトされたURLから code パラメータを取得
            // 4. 以下のテストを実行

            const authCode = "YOUR_AUTH_CODE_HERE"; // 手動で取得したコードを入れる

            if (!hasCredentials() || authCode === "YOUR_AUTH_CODE_HERE") {
                console.log("Skipping: Manual test - set authCode first");
                return;
            }

            jest.resetModules();
            const func = require("../src/functions/android_token");
            const cloudFunc = func([], {}, {});
            const handler = getRequestHandler(cloudFunc);

            const mockReq = {
                query: { code: authCode },
            } as any;

            let responseBody = "";
            const mockRes = {
                send: jest.fn((body: string) => { responseBody = body; }),
                end: jest.fn(),
            } as any;

            await handler(mockReq, mockRes);

            expect(mockRes.send).toHaveBeenCalled();
            expect(responseBody).toContain("RefreshToken:");
            console.log("Response:", responseBody);
        }, 60000);
    });
});
