import { webcrypto } from "crypto";
import {
    clearGoogleAccessTokenCache,
    DatabaseAdapterBase,
    DatabaseDocument,
    DatabaseQueryResult,
    DatabaseWhereCondition,
    deploy,
    NoneAuthAdapter,
} from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";
import { stringifyDataValues } from "../src/lib/fcm";

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
    ): Promise<void> {
        this.documents.set(path, data);
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

async function generateServiceAccountJson(): Promise<string> {
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
    return JSON.stringify({
        client_email: "fcm@test-project.iam.gserviceaccount.com",
        private_key: `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`,
        project_id: "test-project",
    });
}

function createFetchMock(sentMessages: { [key: string]: any }[]) {
    return jest.fn(async (url: string, init?: { body?: string }) => {
        if (url === "https://oauth2.googleapis.com/token") {
            return {
                ok: true,
                json: async () => ({ access_token: "fcm-token", expires_in: 3600 }),
            } as unknown as Response;
        }
        expect(url).toBe("https://fcm.googleapis.com/v1/projects/test-project/messages:send");
        const body = JSON.parse(init?.body ?? "{}");
        sentMessages.push(body);
        return {
            ok: true,
            json: async () => ({ name: `projects/test-project/messages/${sentMessages.length}` }),
        } as unknown as Response;
    });
}

describe("masamune_cloudflare_notification", () => {
    beforeEach(() => {
        clearGoogleAccessTokenCache();
        jest.restoreAllMocks();
    });

    test("stringifyDataValues converts all values to strings", () => {
        expect(stringifyDataValues({
            text: "abc",
            count: 5,
            flag: true,
            nested: { a: 1 },
            skipped: null,
        })).toEqual({
            text: "abc",
            count: "5",
            flag: "true",
            nested: "{\"a\":1}",
        });
    });

    test("正常系: トークン指定でFCM v1に送信", async () => {
        const serviceAccount = await generateServiceAccountJson();
        const sentMessages: { [key: string]: any }[] = [];
        (globalThis as { fetch: typeof fetch }).fetch = createFetchMock(sentMessages) as unknown as typeof fetch;
        const app = deploy([
            Functions.sendNotification({
                auth: new NoneAuthAdapter(),
                serviceAccount: serviceAccount,
            }),
        ]);
        const response = await app.request("http://localhost/send_notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "テスト通知",
                body: "本文",
                channel_id: "channel-1",
                data: { count: 5 },
                targetToken: ["token-1", "token-2"],
            }),
        });
        expect(response.status).toBe(200);
        const result = await response.json() as { success: boolean, results: any[] };
        expect(result.success).toBe(true);
        expect(sentMessages.length).toBe(2);
        const tokens = sentMessages.map((message) => message.message.token).sort();
        expect(tokens).toEqual(["token-1", "token-2"]);
        expect(sentMessages[0].message.notification).toEqual({ title: "テスト通知", body: "本文" });
        expect(sentMessages[0].message.android.notification.channel_id).toBe("channel-1");
        expect(sentMessages[0].message.data).toEqual({ count: "5" });
    });

    test("正常系: トピック指定で送信", async () => {
        const serviceAccount = await generateServiceAccountJson();
        const sentMessages: { [key: string]: any }[] = [];
        (globalThis as { fetch: typeof fetch }).fetch = createFetchMock(sentMessages) as unknown as typeof fetch;
        const app = deploy([
            Functions.sendNotification({
                auth: new NoneAuthAdapter(),
                serviceAccount: serviceAccount,
            }),
        ]);
        const response = await app.request("http://localhost/send_notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "トピック通知",
                body: "本文",
                targetTopic: "news",
            }),
        });
        expect(response.status).toBe(200);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0].message.topic).toBe("news");
    });

    test("正常系: dryRunでvalidate_onlyが付与される", async () => {
        const serviceAccount = await generateServiceAccountJson();
        const sentMessages: { [key: string]: any }[] = [];
        (globalThis as { fetch: typeof fetch }).fetch = createFetchMock(sentMessages) as unknown as typeof fetch;
        const app = deploy([
            Functions.sendNotification({
                auth: new NoneAuthAdapter(),
                serviceAccount: serviceAccount,
            }),
        ]);
        const response = await app.request("http://localhost/send_notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "検証のみ",
                body: "本文",
                targetToken: "token-1",
                dryRun: true,
            }),
        });
        expect(response.status).toBe(200);
        expect(sentMessages[0].validate_only).toBe(true);
    });

    test("正常系: コレクションターゲットでDBからトークンを解決して送信", async () => {
        const serviceAccount = await generateServiceAccountJson();
        const sentMessages: { [key: string]: any }[] = [];
        (globalThis as { fetch: typeof fetch }).fetch = createFetchMock(sentMessages) as unknown as typeof fetch;
        const database = new InMemoryDatabaseAdapter();
        database.documents.set("user/user1", {
            token: { "@type": "ModelToken", "@list": ["token-a", "token-b"] },
            notifiable: true,
        });
        database.documents.set("user/user2", {
            token: "token-c",
            notifiable: false,
        });
        const app = deploy([
            Functions.sendNotification({
                auth: new NoneAuthAdapter(),
                serviceAccount: serviceAccount,
                database: database,
            }),
        ]);
        const response = await app.request("http://localhost/send_notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "コレクション通知",
                body: "本文",
                targetCollectionPath: "user",
                targetTokenField: "token",
                targetConditions: [{ type: "equalTo", key: "notifiable", value: true }],
            }),
        });
        expect(response.status).toBe(200);
        const tokens = sentMessages.map((message) => message.message.token);
        expect(tokens.sort()).toEqual(["token-a", "token-b"]);
    });

    test("正常系: ドキュメントターゲット + responseTokenList", async () => {
        const serviceAccount = await generateServiceAccountJson();
        const sentMessages: { [key: string]: any }[] = [];
        (globalThis as { fetch: typeof fetch }).fetch = createFetchMock(sentMessages) as unknown as typeof fetch;
        const database = new InMemoryDatabaseAdapter();
        database.documents.set("user/user1", { token: "token-x" });
        const app = deploy([
            Functions.sendNotification({
                auth: new NoneAuthAdapter(),
                serviceAccount: serviceAccount,
                database: database,
            }),
        ]);
        const response = await app.request("http://localhost/send_notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "ドキュメント通知",
                body: "本文",
                targetDocumentPath: "user/user1",
                targetTokenField: "token",
                responseTokenList: true,
            }),
        });
        expect(response.status).toBe(200);
        const result = await response.json() as { results: any[] };
        expect(result.results.flat(2)).toContain("token-x");
        expect(sentMessages.length).toBe(0);
    });

    test("エラー: title/body未指定", async () => {
        const app = deploy([
            Functions.sendNotification({
                auth: new NoneAuthAdapter(),
                serviceAccount: "{}",
            }),
        ]);
        const response = await app.request("http://localhost/send_notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetToken: "token-1" }),
        });
        expect(response.status).toBe(400);
    });

    test("エラー: ターゲット未指定", async () => {
        const serviceAccount = await generateServiceAccountJson();
        const app = deploy([
            Functions.sendNotification({
                auth: new NoneAuthAdapter(),
                serviceAccount: serviceAccount,
            }),
        ]);
        const response = await app.request("http://localhost/send_notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "t", body: "b" }),
        });
        expect(response.status).toBe(400);
    });
});
