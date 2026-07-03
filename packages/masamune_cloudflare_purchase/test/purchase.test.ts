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

describe("masamune_cloudflare_purchase", () => {
    beforeEach(() => {
        clearGoogleAccessTokenCache();
        jest.restoreAllMocks();
    });

    describe("consumable_verify_android", () => {
        test("正常系: 検証成功でウォレットが加算される", async () => {
            const privateKeyPem = await generatePrivateKeyPem();
            const database = new InMemoryDatabaseAdapter();
            database.documents.set("user/user1", { wallet: 100 });
            const fetchMock = jest.fn(async (url: string) => {
                if (url === "https://oauth2.googleapis.com/token") {
                    return googleTokenResponse;
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        purchaseState: 0,
                        orderId: "order-1",
                    }),
                } as unknown as Response;
            });
            (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
            const app = deploy([
                Functions.consumableVerifyAndroid({
                    auth: new NoneAuthAdapter(),
                    androidServiceAccountEmail: "sa@example.iam.gserviceaccount.com",
                    androidServiceAccountPrivateKey: privateKeyPem,
                    database: database,
                }),
            ]);
            const response = await app.request("http://localhost/consumable_verify_android", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    packageName: "net.mathru.app",
                    productId: "item_100",
                    purchaseToken: "purchase-token-1",
                    path: "user/user1/wallet",
                    value: 120,
                }),
            });
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
            const privateKeyPem = await generatePrivateKeyPem();
            (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async (url: string) => {
                if (url === "https://oauth2.googleapis.com/token") {
                    return googleTokenResponse;
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ purchaseState: 1 }),
                } as unknown as Response;
            }) as unknown as typeof fetch;
            const app = deploy([
                Functions.consumableVerifyAndroid({
                    auth: new NoneAuthAdapter(),
                    androidServiceAccountEmail: "sa@example.iam.gserviceaccount.com",
                    androidServiceAccountPrivateKey: privateKeyPem,
                    database: new InMemoryDatabaseAdapter(),
                }),
            ]);
            const response = await app.request("http://localhost/consumable_verify_android", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    packageName: "net.mathru.app",
                    productId: "item_100",
                    purchaseToken: "purchase-token-1",
                    path: "user/user1/wallet",
                    value: 120,
                }),
            });
            expect(response.status).toBe(401);
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
                    auth: new NoneAuthAdapter(),
                    iosSharedSecret: "shared-secret",
                    database: database,
                }),
            ]);
            const response = await app.request("http://localhost/nonconsumable_verify_ios", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    receiptData: "receipt-data",
                    path: "user/user1/premium",
                }),
            });
            expect(response.status).toBe(200);
            expect(database.documents.get("user/user1")?.premium).toBe(true);
            expect(database.documents.has("user/user1/transaction/tx-1")).toBe(true);
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
                    auth: new NoneAuthAdapter(),
                    iosSharedSecret: "shared-secret",
                    database: database,
                }),
            ]);
            const response = await app.request("http://localhost/nonconsumable_verify_ios", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    receiptData: "receipt-data",
                    path: "user/user1/premium",
                }),
            });
            expect(response.status).toBe(200);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });
    });

    describe("subscription_verify_android", () => {
        test("正常系: サブスクリプションデータが保存される", async () => {
            const privateKeyPem = await generatePrivateKeyPem();
            const database = new InMemoryDatabaseAdapter();
            const expiry = Date.now() + 24 * 60 * 60 * 1000;
            (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async (url: string) => {
                if (url === "https://oauth2.googleapis.com/token") {
                    return googleTokenResponse;
                }
                expect(url).toContain("/purchases/subscriptions/");
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        startTimeMillis: `${Date.now() - 1000}`,
                        expiryTimeMillis: `${expiry}`,
                        orderId: "order-sub-1",
                    }),
                } as unknown as Response;
            }) as unknown as typeof fetch;
            const app = deploy([
                Functions.subscriptionVerifyAndroid({
                    auth: new NoneAuthAdapter(),
                    androidServiceAccountEmail: "sa@example.iam.gserviceaccount.com",
                    androidServiceAccountPrivateKey: privateKeyPem,
                    subscriptionPath: "subscription",
                    database: database,
                }),
            ]);
            const response = await app.request("http://localhost/subscription_verify_android", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    packageName: "net.mathru.app",
                    productId: "sub_monthly",
                    purchaseToken: "sub-token-1",
                    purchaseId: "purchase-1",
                    userId: "user1",
                }),
            });
            expect(response.status).toBe(200);
            const saved = database.documents.get("subscription/sub-token-1");
            expect(saved).toBeDefined();
            expect(saved?.token).toBe("sub-token-1");
            expect(saved?.platform).toBe("Android");
            expect(saved?.expired).toBe(false);
            expect(saved?.expiredTime).toBe(expiry);
            expect(saved?.userId).toBe("user1");
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
            (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async (url: string) => {
                if (url === "https://oauth2.googleapis.com/token") {
                    return googleTokenResponse;
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        expiryTimeMillis: `${expiry}`,
                        orderId: "order-renewed",
                    }),
                } as unknown as Response;
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
            const response = await app.request("http://localhost/purchase_webhook_android", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: {
                        data: Buffer.from(JSON.stringify(notification)).toString("base64"),
                    },
                    subscription: "projects/test/subscriptions/purchasing",
                }),
            });
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
            (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async (url: string) => {
                if (url === "https://oauth2.googleapis.com/token") {
                    return googleTokenResponse;
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ expiryTimeMillis: "0" }),
                } as unknown as Response;
            }) as unknown as typeof fetch;
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
            const response = await app.request("http://localhost/purchase_webhook_android", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: {
                        data: Buffer.from(JSON.stringify(notification)).toString("base64"),
                    },
                }),
            });
            expect(response.status).toBe(200);
        });
    });

    describe("purchase_webhook_ios", () => {
        test("正常系: EXPIREDでサブスクリプションが失効する", async () => {
            const database = new InMemoryDatabaseAdapter();
            database.documents.set("subscription/original-tx-1", {
                token: "receipt-data",
                userId: "user1",
                productId: "sub_monthly",
                expired: false,
            });
            const app = deploy([
                Functions.purchaseWebhookIOS({
                    subscriptionPath: "subscription",
                    database: database,
                }),
            ]);
            const transactionInfo = {
                originalTransactionId: "original-tx-1",
                transactionId: "tx-2",
                productId: "sub_monthly",
                expiresDate: `${Date.now() - 1000}`,
            };
            const payload = {
                notificationType: "EXPIRED",
                data: {
                    signedTransactionInfo: `header.${Buffer.from(JSON.stringify(transactionInfo)).toString("base64url")}.signature`,
                },
            };
            const signedPayload = `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
            const response = await app.request("http://localhost/purchase_webhook_ios", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ signedPayload }),
            });
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ status: 1 });
            const saved = database.documents.get("subscription/original-tx-1");
            expect(saved?.expired).toBe(true);
            expect(saved?.paused).toBe(false);
            expect(saved?.orderId).toBe("tx-2");
        });
    });
});
