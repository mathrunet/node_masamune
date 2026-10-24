import { webcrypto } from "crypto";
import {
    clearGoogleAccessTokenCache,
    DatabaseAdapterBase,
    DatabaseDocument,
    DatabaseIncrement,
    DatabaseQueryResult,
    DatabaseWhereCondition,
    deploy,
    NoneAuthAdapter,
} from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";
import { createForgedChain, createSignedJws, createTestChain, StaticAuthAdapter, TestChain } from "./test_certificates";

if (!(globalThis as { crypto?: Crypto }).crypto) {
    (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
}

class InMemoryDatabaseAdapter extends DatabaseAdapterBase {
    documents = new Map<string, { [key: string]: any }>();

    async getDocument(path: string): Promise<DatabaseDocument | null> {
        const data = this.documents.get(path);
        return data ? { path, data } : null;
    }

    async saveDocument(
        path: string,
        data: { [key: string]: any },
        options?: { merge?: boolean | undefined },
    ): Promise<void> {
        const existing = this.documents.get(path) ?? {};
        const next: { [key: string]: any } = options?.merge ? { ...existing } : {};
        for (const [key, value] of Object.entries(data)) {
            if (value instanceof DatabaseIncrement) {
                const current = existing[key];
                next[key] = (typeof current === "number" ? current : 0) + value.value;
            } else {
                next[key] = value;
            }
        }
        this.documents.set(path, next);
    }

    async query(
        collectionPath: string,
        options?: {
            wheres?: DatabaseWhereCondition[] | undefined,
            limit?: number | undefined,
            cursor?: string | null | undefined,
        },
    ): Promise<DatabaseQueryResult> {
        const docs: DatabaseDocument[] = [];
        for (const [path, data] of this.documents.entries()) {
            if (!path.startsWith(`${collectionPath}/`)) {
                continue;
            }
            const matched = (options?.wheres ?? []).every((where) => {
                if (where.type === "equalTo") {
                    return data[where.key] === where.value;
                }
                return true;
            });
            if (matched) {
                docs.push({ path, data });
            }
        }
        return { docs: options?.limit ? docs.slice(0, options.limit) : docs, cursor: null };
    }
}

const googleTokenResponse = {
    ok: true,
    json: async () => ({ access_token: "google-access-token", expires_in: 3600 }),
} as unknown as Response;

async function generatePrivateKeyPem(): Promise<string> {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: "RSASSA-PKCS1-v1_5",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
    );
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const base64 = Buffer.from(pkcs8).toString("base64");
    const lines = base64.match(/.{1,64}/g) ?? [];
    return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

function jsonRequest(body: unknown): RequestInit {
    return {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    };
}

function androidFetch(verifyResponse: { [key: string]: any }): jest.Mock {
    return jest.fn(async (url: string) => {
        if (url === "https://oauth2.googleapis.com/token") {
            return googleTokenResponse;
        }
        return {
            ok: true,
            status: 200,
            json: async () => verifyResponse,
        } as unknown as Response;
    });
}

describe("masamune_cloudflare_purchase", () => {
    let chain: TestChain;

    beforeAll(async () => {
        chain = await createTestChain();
    });

    beforeEach(() => {
        clearGoogleAccessTokenCache();
        jest.restoreAllMocks();
    });

    describe("consumable_verify_android", () => {
        const options = async (database: InMemoryDatabaseAdapter, uid: string = "user1") => ({
            auth: new StaticAuthAdapter(uid),
            androidServiceAccountEmail: "sa@example.iam.gserviceaccount.com",
            androidServiceAccountPrivateKey: await generatePrivateKeyPem(),
            userDocumentPath: "user/{userId}",
            database: database,
        });
        const request = (overrides: { [key: string]: any } = {}) => jsonRequest({
            packageName: "net.mathru.app",
            productId: "item_100",
            purchaseToken: "purchase-token-1",
            path: "user/user1/wallet",
            value: 120,
            ...overrides,
        });

        test("正常系: 検証成功でウォレットが加算される", async () => {
            const database = new InMemoryDatabaseAdapter();
            database.documents.set("user/user1", { wallet: 100 });
            const fetchMock = androidFetch({ purchaseState: 0, orderId: "order-1" });
            (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
            const app = deploy([Functions.consumableVerifyAndroid(await options(database))]);
            const response = await app.request("http://localhost/consumable_verify_android", request());
            expect(response.status).toBe(200);
            const body = await response.json() as { purchaseState: number };
            expect(body.purchaseState).toBe(0);
            expect(database.documents.get("user/user1")?.wallet).toBe(220);
            expect(database.documents.get("user/user1")?.["@uid"]).toBe("user1");
            expect(database.documents.has("user/user1/transaction/purchase-token-1")).toBe(true);
            const verifyCall = (fetchMock.mock.calls as unknown as [string][]).find(([url]) =>
                url.includes("androidpublisher.googleapis.com"));
            expect(verifyCall?.[0]).toContain(
                "/applications/net.mathru.app/purchases/products/item_100/tokens/purchase-token-1",
            );
        });

        test("エラー: purchaseStateが0以外", async () => {
            (globalThis as { fetch: typeof fetch }).fetch = androidFetch({ purchaseState: 1 }) as unknown as typeof fetch;
            const app = deploy([Functions.consumableVerifyAndroid(await options(new InMemoryDatabaseAdapter()))]);
            const response = await app.request("http://localhost/consumable_verify_android", request());
            expect(response.status).toBe(401);
        });

        test("エラー: 認証が無い場合は401でストアにも問い合わせない", async () => {
            const fetchMock = androidFetch({ purchaseState: 0 });
            (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
            const database = new InMemoryDatabaseAdapter();
            const app = deploy([Functions.consumableVerifyAndroid({
                ...(await options(database)),
                auth: new NoneAuthAdapter(),
            })]);
            const response = await app.request("http://localhost/consumable_verify_android", request());
            expect(response.status).toBe(401);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(database.documents.size).toBe(0);
        });

        test("エラー: 他ユーザーのウォレットパスは403", async () => {
            const database = new InMemoryDatabaseAdapter();
            database.documents.set("user/user2", { wallet: 100 });
            const fetchMock = androidFetch({ purchaseState: 0 });
            (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
            const app = deploy([Functions.consumableVerifyAndroid(await options(database))]);
            const response = await app.request(
                "http://localhost/consumable_verify_android",
                request({ path: "user/user2/wallet" }),
            );
            expect(response.status).toBe(403);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(database.documents.get("user/user2")?.wallet).toBe(100);
        });

        test("エラー: 深いパス・transaction・@始まりは403", async () => {
            (globalThis as { fetch: typeof fetch }).fetch = androidFetch({ purchaseState: 0 }) as unknown as typeof fetch;
            const app = deploy([Functions.consumableVerifyAndroid(await options(new InMemoryDatabaseAdapter()))]);
            for (const path of ["user/user1/wallet/extra", "user/user1/transaction", "user/user1/@uid", "other/user1/wallet", "user/user1"]) {
                const response = await app.request("http://localhost/consumable_verify_android", request({ path }));
                expect([403, 400]).toContain(response.status);
            }
        });

        test("エラー: 同じレシートの再送は409で二重加算しない", async () => {
            const database = new InMemoryDatabaseAdapter();
            database.documents.set("user/user1", { wallet: 100 });
            (globalThis as { fetch: typeof fetch }).fetch = androidFetch({ purchaseState: 0 }) as unknown as typeof fetch;
            const app = deploy([Functions.consumableVerifyAndroid(await options(database))]);
            const first = await app.request("http://localhost/consumable_verify_android", request());
            expect(first.status).toBe(200);
            const second = await app.request("http://localhost/consumable_verify_android", request());
            expect(second.status).toBe(409);
            expect(database.documents.get("user/user1")?.wallet).toBe(220);
        });

        test("エラー: PURCHASE_ANDROID_PACKAGENAME と異なるパッケージは403", async () => {
            const fetchMock = androidFetch({ purchaseState: 0 });
            (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
            const app = deploy([Functions.consumableVerifyAndroid({
                ...(await options(new InMemoryDatabaseAdapter())),
                androidPackageName: "net.mathru.app",
            })]);
            const response = await app.request(
                "http://localhost/consumable_verify_android",
                request({ packageName: "net.mathru.other" }),
            );
            expect(response.status).toBe(403);
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe("nonconsumable_verify_ios", () => {
        test("正常系: StoreKit1レシート検証でアンロックされる", async () => {
            const database = new InMemoryDatabaseAdapter();
            (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async (url: string) => {
                expect(url).toBe("https://buy.itunes.apple.com/verifyReceipt");
                return {
                    ok: true,
                    json: async () => ({
                        status: 0,
                        receipt: { bundle_id: "net.mathru.app" },
                        latest_receipt_info: [
                            {
                                product_id: "unlock_premium",
                                original_transaction_id: "tx-1",
                            },
                        ],
                    }),
                } as unknown as Response;
            }) as unknown as typeof fetch;
            const app = deploy([
                Functions.nonconsumableVerifyIOS({
                    auth: new StaticAuthAdapter("user1"),
                    iosSharedSecret: "shared-secret",
                    iosBundleId: "net.mathru.app",
                    userDocumentPath: "user/{userId}",
                    database: database,
                }),
            ]);
            const response = await app.request("http://localhost/nonconsumable_verify_ios", jsonRequest({
                receiptData: "receipt-data",
                path: "user/user1/premium",
            }));
            expect(response.status).toBe(200);
            expect(database.documents.get("user/user1")?.premium).toBe(true);
            expect(database.documents.has("user/user1/transaction/tx-1")).toBe(true);
            // 再送は冪等。
            const again = await app.request("http://localhost/nonconsumable_verify_ios", jsonRequest({
                receiptData: "receipt-data",
                path: "user/user1/premium",
            }));
            expect(again.status).toBe(200);
        });

        test("正常系: 21007でsandboxにフォールバック", async () => {
            const database = new InMemoryDatabaseAdapter();
            const fetchMock = jest.fn(async (url: string) => {
                if (url === "https://buy.itunes.apple.com/verifyReceipt") {
                    return {
                        ok: true,
                        json: async () => ({ status: 21007 }),
                    } as unknown as Response;
                }
                expect(url).toBe("https://sandbox.itunes.apple.com/verifyReceipt");
                return {
                    ok: true,
                    json: async () => ({
                        status: 0,
                        latest_receipt_info: [
                            { original_transaction_id: "tx-sandbox" },
                        ],
                    }),
                } as unknown as Response;
            });
            (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
            const app = deploy([
                Functions.nonconsumableVerifyIOS({
                    auth: new StaticAuthAdapter("user1"),
                    iosSharedSecret: "shared-secret",
                    userDocumentPath: "user/{userId}",
                    database: database,
                }),
            ]);
            const response = await app.request("http://localhost/nonconsumable_verify_ios", jsonRequest({
                receiptData: "receipt-data",
                path: "user/user1/premium",
            }));
            expect(response.status).toBe(200);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        test("エラー: StoreKit1レシートのbundle_idが異なる場合は403", async () => {
            (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async () => ({
                ok: true,
                json: async () => ({
                    status: 0,
                    receipt: { bundle_id: "net.mathru.other" },
                    latest_receipt_info: [{ original_transaction_id: "tx-1" }],
                }),
            }) as unknown as Response) as unknown as typeof fetch;
            const database = new InMemoryDatabaseAdapter();
            const app = deploy([
                Functions.nonconsumableVerifyIOS({
                    auth: new StaticAuthAdapter("user1"),
                    iosSharedSecret: "shared-secret",
                    iosBundleId: "net.mathru.app",
                    userDocumentPath: "user/{userId}",
                    database: database,
                }),
            ]);
            const response = await app.request("http://localhost/nonconsumable_verify_ios", jsonRequest({
                receiptData: "receipt-data",
                path: "user/user1/premium",
            }));
            expect(response.status).toBe(403);
            expect(database.documents.size).toBe(0);
        });
    });

    describe("subscription_verify_android", () => {
        const options = async (database: InMemoryDatabaseAdapter, uid: string = "user1") => ({
            auth: new StaticAuthAdapter(uid),
            androidServiceAccountEmail: "sa@example.iam.gserviceaccount.com",
            androidServiceAccountPrivateKey: await generatePrivateKeyPem(),
            subscriptionPath: "subscription",
            database: database,
        });
        const request = (overrides: { [key: string]: any } = {}) => jsonRequest({
            packageName: "net.mathru.app",
            productId: "sub_monthly",
            purchaseToken: "sub-token-1",
            purchaseId: "purchase-1",
            userId: "user1",
            ...overrides,
        });
        const expiry = Date.now() + 24 * 60 * 60 * 1000;
        const verifyResponse = () => ({
            startTimeMillis: `${Date.now() - 1000}`,
            expiryTimeMillis: `${expiry}`,
            orderId: "order-sub-1",
        });

        test("正常系: サブスクリプションデータが保存される", async () => {
            const database = new InMemoryDatabaseAdapter();
            (globalThis as { fetch: typeof fetch }).fetch = androidFetch(verifyResponse()) as unknown as typeof fetch;
            const app = deploy([Functions.subscriptionVerifyAndroid(await options(database))]);
            const response = await app.request("http://localhost/subscription_verify_android", request());
            expect(response.status).toBe(200);
            const saved = database.documents.get("subscription/sub-token-1");
            expect(saved).toBeDefined();
            expect(saved?.token).toBe("sub-token-1");
            expect(saved?.platform).toBe("Android");
            expect(saved?.expired).toBe(false);
            expect(saved?.expiredTime).toBe(expiry);
            expect(saved?.userId).toBe("user1");
        });

        test("正常系: userId省略時は認証ユーザーが所有者になる", async () => {
            const database = new InMemoryDatabaseAdapter();
            (globalThis as { fetch: typeof fetch }).fetch = androidFetch(verifyResponse()) as unknown as typeof fetch;
            const app = deploy([Functions.subscriptionVerifyAndroid(await options(database))]);
            const response = await app.request("http://localhost/subscription_verify_android", request({ userId: undefined }));
            expect(response.status).toBe(200);
            expect(database.documents.get("subscription/sub-token-1")?.userId).toBe("user1");
        });

        test("エラー: userIdが認証ユーザーと異なる場合は403", async () => {
            const database = new InMemoryDatabaseAdapter();
            const fetchMock = androidFetch(verifyResponse());
            (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
            const app = deploy([Functions.subscriptionVerifyAndroid(await options(database))]);
            const response = await app.request("http://localhost/subscription_verify_android", request({ userId: "user2" }));
            expect(response.status).toBe(403);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(database.documents.size).toBe(0);
        });

        test("エラー: 認証が無い場合は401", async () => {
            const app = deploy([Functions.subscriptionVerifyAndroid({
                ...(await options(new InMemoryDatabaseAdapter())),
                auth: new NoneAuthAdapter(),
            })]);
            const response = await app.request("http://localhost/subscription_verify_android", request());
            expect(response.status).toBe(401);
        });

        test("正常系: body.pathは無視されdataはサニタイズされる", async () => {
            const database = new InMemoryDatabaseAdapter();
            (globalThis as { fetch: typeof fetch }).fetch = androidFetch(verifyResponse()) as unknown as typeof fetch;
            const app = deploy([Functions.subscriptionVerifyAndroid(await options(database))]);
            const response = await app.request("http://localhost/subscription_verify_android", request({
                path: "other/collection",
                data: { note: "hello", userId: "evil", expired: true, "@uid": "z", token: "stolen" },
                extra: "ignored",
            }));
            expect(response.status).toBe(200);
            expect(database.documents.has("other/collection/sub-token-1")).toBe(false);
            const saved = database.documents.get("subscription/sub-token-1");
            expect(saved?.note).toBe("hello");
            expect(saved?.userId).toBe("user1");
            expect(saved?.expired).toBe(false);
            expect(saved?.token).toBe("sub-token-1");
            expect(saved?.["@uid"]).toBe("sub-token-1");
            expect(saved?.extra).toBeUndefined();
            expect(saved?.purchaseToken).toBeUndefined();
        });

        test("エラー: 他ユーザーが所有するトランザクションは403", async () => {
            const database = new InMemoryDatabaseAdapter();
            database.documents.set("subscription/sub-token-1", { userId: "user2", expired: false, token: "sub-token-1" });
            (globalThis as { fetch: typeof fetch }).fetch = androidFetch(verifyResponse()) as unknown as typeof fetch;
            const app = deploy([Functions.subscriptionVerifyAndroid(await options(database))]);
            const response = await app.request("http://localhost/subscription_verify_android", request());
            expect(response.status).toBe(403);
            expect(database.documents.get("subscription/sub-token-1")?.userId).toBe("user2");
        });
    });

    describe("subscription_verify_ios (StoreKit 2)", () => {
        const options = (database: InMemoryDatabaseAdapter, overrides: { [key: string]: any } = {}) => ({
            auth: new StaticAuthAdapter("user1"),
            iosSharedSecret: "",
            iosBundleId: "net.mathru.app",
            iosRootCertificates: [chain.root.base64],
            subscriptionPath: "subscription",
            database: database,
            ...overrides,
        });
        const transaction = () => ({
            transactionId: "tx-2",
            originalTransactionId: "original-tx-1",
            bundleId: "net.mathru.app",
            productId: "sub_monthly",
            environment: "Sandbox",
            purchaseDate: Date.now() - 1000,
            originalPurchaseDate: Date.now() - 1000,
            expiresDate: Date.now() + 24 * 60 * 60 * 1000,
        });

        test("正常系: Apple形式のチェーンで署名されたJWSが検証され保存される", async () => {
            const database = new InMemoryDatabaseAdapter();
            const fetchMock = jest.fn();
            (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
            const token = await createSignedJws(transaction(), chain);
            const app = deploy([Functions.subscriptionVerifyIOS(options(database))]);
            const response = await app.request("http://localhost/subscription_verify_ios", jsonRequest({
                receiptData: token,
                transactionId: "tx-2",
                storeKitVersion: 2,
                productId: "sub_monthly",
                purchaseId: "purchase-1",
                userId: "user1",
            }));
            expect(response.status).toBe(200);
            expect(fetchMock).not.toHaveBeenCalled();
            const saved = database.documents.get("subscription/original-tx-1");
            expect(saved?.userId).toBe("user1");
            expect(saved?.platform).toBe("IOS");
            expect(saved?.productId).toBe("sub_monthly");
            expect(saved?.packageName).toBe("net.mathru.app");
            expect(saved?.expired).toBe(false);
        });

        test("エラー: 自己署名の偽JWSは401", async () => {
            const database = new InMemoryDatabaseAdapter();
            const forged = await createForgedChain();
            const token = await createSignedJws(transaction(), forged);
            const app = deploy([Functions.subscriptionVerifyIOS(options(database))]);
            const response = await app.request("http://localhost/subscription_verify_ios", jsonRequest({
                receiptData: token,
                transactionId: "tx-2",
                storeKitVersion: 2,
                userId: "user1",
            }));
            expect(response.status).toBe(401);
            expect(database.documents.size).toBe(0);
        });

        test("エラー: bundleIdが異なるJWSは403", async () => {
            const database = new InMemoryDatabaseAdapter();
            const token = await createSignedJws({ ...transaction(), bundleId: "net.mathru.other" }, chain);
            const app = deploy([Functions.subscriptionVerifyIOS(options(database))]);
            const response = await app.request("http://localhost/subscription_verify_ios", jsonRequest({
                receiptData: token,
                transactionId: "tx-2",
                storeKitVersion: 2,
            }));
            expect(response.status).toBe(403);
            expect(database.documents.size).toBe(0);
        });

        test("エラー: environmentが制限されている場合Sandboxは403", async () => {
            const token = await createSignedJws(transaction(), chain);
            const app = deploy([Functions.subscriptionVerifyIOS(options(new InMemoryDatabaseAdapter(), { iosEnvironment: "Production" }))]);
            const response = await app.request("http://localhost/subscription_verify_ios", jsonRequest({
                receiptData: token,
                transactionId: "tx-2",
                storeKitVersion: 2,
            }));
            expect(response.status).toBe(403);
        });

        test("エラー: PURCHASE_IOS_BUNDLEID未設定は500", async () => {
            const token = await createSignedJws(transaction(), chain);
            const app = deploy([Functions.subscriptionVerifyIOS(options(new InMemoryDatabaseAdapter(), { iosBundleId: undefined }))]);
            const response = await app.request("http://localhost/subscription_verify_ios", jsonRequest({
                receiptData: token,
                transactionId: "tx-2",
                storeKitVersion: 2,
            }));
            expect(response.status).toBe(500);
        });

        test("エラー: transactionIdが一致しない場合は403", async () => {
            const token = await createSignedJws(transaction(), chain);
            const app = deploy([Functions.subscriptionVerifyIOS(options(new InMemoryDatabaseAdapter()))]);
            const response = await app.request("http://localhost/subscription_verify_ios", jsonRequest({
                receiptData: token,
                transactionId: "tx-9",
                storeKitVersion: 2,
            }));
            expect(response.status).toBe(403);
        });
    });

    describe("purchase_webhook_android", () => {
        test("正常系: SUBSCRIPTION_RENEWEDでサブスクリプションが更新される", async () => {
            const privateKeyPem = await generatePrivateKeyPem();
            const database = new InMemoryDatabaseAdapter();
            const expiry = Date.now() + 24 * 60 * 60 * 1000;
            database.documents.set("subscription/doc1", {
                token: "sub-token-1",
                userId: "user1",
                productId: "sub_monthly",
                expired: true,
            });
            (globalThis as { fetch: typeof fetch }).fetch = androidFetch({
                expiryTimeMillis: `${expiry}`,
                orderId: "order-renewed",
            }) as unknown as typeof fetch;
            const app = deploy([
                Functions.purchaseWebhookAndroid({
                    androidServiceAccountEmail: "sa@example.iam.gserviceaccount.com",
                    androidServiceAccountPrivateKey: privateKeyPem,
                    subscriptionPath: "subscription",
                    database: database,
                }),
            ]);
            const notification = {
                packageName: "net.mathru.app",
                subscriptionNotification: {
                    notificationType: 2,
                    purchaseToken: "sub-token-1",
                    subscriptionId: "sub_monthly",
                },
            };
            const response = await app.request("http://localhost/purchase_webhook_android", jsonRequest({
                message: {
                    data: Buffer.from(JSON.stringify(notification)).toString("base64"),
                },
                subscription: "projects/test/subscriptions/purchasing",
            }));
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ status: 1 });
            const saved = database.documents.get("subscription/doc1");
            expect(saved?.expired).toBe(false);
            expect(saved?.paused).toBe(false);
            expect(saved?.expiredTime).toBe(expiry);
            expect(saved?.orderId).toBe("order-renewed");
        });

        test("正常系: 該当データがなくても200を返す（再送ループ防止）", async () => {
            const privateKeyPem = await generatePrivateKeyPem();
            (globalThis as { fetch: typeof fetch }).fetch = androidFetch({ expiryTimeMillis: "0" }) as unknown as typeof fetch;
            const app = deploy([
                Functions.purchaseWebhookAndroid({
                    androidServiceAccountEmail: "sa@example.iam.gserviceaccount.com",
                    androidServiceAccountPrivateKey: privateKeyPem,
                    subscriptionPath: "subscription",
                    database: new InMemoryDatabaseAdapter(),
                }),
            ]);
            const notification = {
                packageName: "net.mathru.app",
                subscriptionNotification: {
                    notificationType: 2,
                    purchaseToken: "unknown-token",
                    subscriptionId: "sub_monthly",
                },
            };
            const response = await app.request("http://localhost/purchase_webhook_android", jsonRequest({
                message: {
                    data: Buffer.from(JSON.stringify(notification)).toString("base64"),
                },
            }));
            expect(response.status).toBe(200);
        });
    });

    describe("purchase_webhook_ios", () => {
        const options = (database: InMemoryDatabaseAdapter, overrides: { [key: string]: any } = {}) => ({
            subscriptionPath: "subscription",
            iosBundleId: "net.mathru.app",
            iosRootCertificates: [chain.root.base64],
            database: database,
            ...overrides,
        });
        const seed = (database: InMemoryDatabaseAdapter) => database.documents.set("subscription/original-tx-1", {
            token: "receipt-data",
            userId: "user1",
            productId: "sub_monthly",
            expired: false,
        });
        const transactionInfo = () => ({
            originalTransactionId: "original-tx-1",
            transactionId: "tx-2",
            productId: "sub_monthly",
            bundleId: "net.mathru.app",
            environment: "Sandbox",
            expiresDate: `${Date.now() - 1000}`,
        });
        const signedNotification = async (
            notificationType: string,
            transaction: { [key: string]: any },
            signer: TestChain,
            data: { [key: string]: any } = {},
        ) => {
            const signedTransactionInfo = await createSignedJws(transaction, signer);
            return await createSignedJws({
                notificationType,
                data: {
                    bundleId: "net.mathru.app",
                    environment: "Sandbox",
                    signedTransactionInfo,
                    ...data,
                },
            }, signer);
        };

        test("正常系: 正規署名のEXPIREDでサブスクリプションが失効する", async () => {
            const database = new InMemoryDatabaseAdapter();
            seed(database);
            const app = deploy([Functions.purchaseWebhookIOS(options(database))]);
            const signedPayload = await signedNotification("EXPIRED", transactionInfo(), chain);
            const response = await app.request("http://localhost/purchase_webhook_ios", jsonRequest({ signedPayload }));
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ status: 1 });
            const saved = database.documents.get("subscription/original-tx-1");
            expect(saved?.expired).toBe(true);
            expect(saved?.paused).toBe(false);
            expect(saved?.orderId).toBe("tx-2");
        });

        test("エラー: 未署名のペイロードは4xxで何も変更しない", async () => {
            const database = new InMemoryDatabaseAdapter();
            seed(database);
            const app = deploy([Functions.purchaseWebhookIOS(options(database))]);
            const payload = {
                notificationType: "EXPIRED",
                data: {
                    bundleId: "net.mathru.app",
                    signedTransactionInfo: `header.${Buffer.from(JSON.stringify(transactionInfo())).toString("base64url")}.signature`,
                },
            };
            const signedPayload = `${Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
            const response = await app.request("http://localhost/purchase_webhook_ios", jsonRequest({ signedPayload }));
            expect(response.status).toBe(400);
            expect(database.documents.get("subscription/original-tx-1")?.expired).toBe(false);
        });

        test("エラー: 偽チェーンで署名されたペイロードは401で何も変更しない", async () => {
            const database = new InMemoryDatabaseAdapter();
            seed(database);
            const forged = await createForgedChain();
            const app = deploy([Functions.purchaseWebhookIOS(options(database))]);
            const signedPayload = await signedNotification("EXPIRED", transactionInfo(), forged);
            const response = await app.request("http://localhost/purchase_webhook_ios", jsonRequest({ signedPayload }));
            expect(response.status).toBe(401);
            expect(database.documents.get("subscription/original-tx-1")?.expired).toBe(false);
        });

        test("エラー: bundleIdが異なる通知は403で何も変更しない", async () => {
            const database = new InMemoryDatabaseAdapter();
            seed(database);
            const app = deploy([Functions.purchaseWebhookIOS(options(database))]);
            const signedPayload = await signedNotification("EXPIRED", transactionInfo(), chain, { bundleId: "net.mathru.other" });
            const response = await app.request("http://localhost/purchase_webhook_ios", jsonRequest({ signedPayload }));
            expect(response.status).toBe(403);
            expect(database.documents.get("subscription/original-tx-1")?.expired).toBe(false);
        });

        test("エラー: 正規の外側署名でも内側のトランザクションが偽署名なら401", async () => {
            const database = new InMemoryDatabaseAdapter();
            seed(database);
            const forged = await createForgedChain();
            const app = deploy([Functions.purchaseWebhookIOS(options(database))]);
            const signedTransactionInfo = await createSignedJws(transactionInfo(), forged);
            const signedPayload = await createSignedJws({
                notificationType: "EXPIRED",
                data: { bundleId: "net.mathru.app", environment: "Sandbox", signedTransactionInfo },
            }, chain);
            const response = await app.request("http://localhost/purchase_webhook_ios", jsonRequest({ signedPayload }));
            expect(response.status).toBe(401);
            expect(database.documents.get("subscription/original-tx-1")?.expired).toBe(false);
        });

        test("正常系: TEST通知はDBに触れず200", async () => {
            const database = new InMemoryDatabaseAdapter();
            const app = deploy([Functions.purchaseWebhookIOS(options(database))]);
            const signedPayload = await createSignedJws({ notificationType: "TEST" }, chain);
            const response = await app.request("http://localhost/purchase_webhook_ios", jsonRequest({ signedPayload }));
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ status: 1 });
        });

        test("正常系: 該当データがなくても200を返す（再送ループ防止）", async () => {
            const app = deploy([Functions.purchaseWebhookIOS(options(new InMemoryDatabaseAdapter()))]);
            const signedPayload = await signedNotification("EXPIRED", transactionInfo(), chain);
            const response = await app.request("http://localhost/purchase_webhook_ios", jsonRequest({ signedPayload }));
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ status: 0 });
        });
    });
});
