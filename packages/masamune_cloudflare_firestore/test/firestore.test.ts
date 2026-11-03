import { webcrypto } from "crypto";
import {
    clearGoogleAccessTokenCache,
    DatabaseIncrement,
} from "@mathrunet/masamune_cloudflare";
import {
    createFirestoreClient,
    createFirestoreDatabaseAdapter,
    databaseWhereToFirestoreWhere,
    decodeFirestoreFields,
    decodeFirestoreValue,
    encodeFirestoreValue,
    encodeFirestoreWriteFields,
    FirestoreDatabaseAdapter,
    FirestoreFieldValue,
    FirestoreGeoPoint,
    FirestoreReference,
    FirestoreRestClient,
    FirestoreRestError,
    FirestoreTimestamp,
} from "../src";

if (!(globalThis as { crypto?: Crypto }).crypto) {
    (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
}

const root = "projects/test-project/databases/(default)/documents";
const base = `https://firestore.googleapis.com/v1/${root}`;

async function generateServiceAccountJson(projectId?: string): Promise<string> {
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
    const lines = Buffer.from(pkcs8).toString("base64").match(/.{1,64}/g) ?? [];
    return JSON.stringify({
        client_email: "firestore@test-project.iam.gserviceaccount.com",
        private_key: `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`,
        ...(projectId ? { project_id: projectId } : {}),
    });
}

interface Call {
    url: string;
    method: string;
    headers: { [key: string]: string };
    body: any;
}

type Handler = (call: Call) => { status?: number, json?: unknown } | undefined;

function installFetch(handler: Handler): { calls: Call[], tokenRequests: () => number } {
    const calls: Call[] = [];
    let tokenRequests = 0;
    (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async (url: string, init?: RequestInit) => {
        if (url === "https://oauth2.googleapis.com/token") {
            tokenRequests++;
            const body = String(init?.body ?? "");
            expect(body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
            return new Response(JSON.stringify({ access_token: `token-${tokenRequests}`, expires_in: 3600 }), { status: 200 });
        }
        const call: Call = {
            url,
            method: String(init?.method ?? "GET"),
            headers: (init?.headers ?? {}) as { [key: string]: string },
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
        };
        calls.push(call);
        const result = handler(call) ?? { json: {} };
        const status = result.status ?? 200;
        return new Response(result.json === undefined ? "" : JSON.stringify(result.json), { status });
    }) as unknown as typeof fetch;
    return { calls, tokenRequests: () => tokenRequests };
}

let serviceAccount = "";

beforeAll(async () => {
    serviceAccount = await generateServiceAccountJson("test-project");
});

beforeEach(() => {
    clearGoogleAccessTokenCache();
});

describe("value conversion", () => {
    test("encodes all value types", () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const fields = encodeFirestoreWriteFields({
            n: null,
            b: true,
            i: 42,
            big: BigInt("9007199254740993"),
            d: 1.5,
            nan: NaN,
            t: new Date("2026-01-02T03:04:05.678Z"),
            s: "text",
            bytes,
            ref: new FirestoreReference("user/abc"),
            geo: new FirestoreGeoPoint(35.6, 139.7),
            arr: [1, "a", { x: false }],
            map: { nested: { deep: 1 } },
            empty: {},
            skipped: undefined,
        }, root).fields;
        expect(fields).toEqual({
            n: { nullValue: null },
            b: { booleanValue: true },
            i: { integerValue: "42" },
            big: { integerValue: "9007199254740993" },
            d: { doubleValue: 1.5 },
            nan: { doubleValue: "NaN" },
            t: { timestampValue: "2026-01-02T03:04:05.678Z" },
            s: { stringValue: "text" },
            bytes: { bytesValue: "AQID" },
            ref: { referenceValue: `${root}/user/abc` },
            geo: { geoPointValue: { latitude: 35.6, longitude: 139.7 } },
            arr: {
                arrayValue: {
                    values: [
                        { integerValue: "1" },
                        { stringValue: "a" },
                        { mapValue: { fields: { x: { booleanValue: false } } } },
                    ],
                },
            },
            map: { mapValue: { fields: { nested: { mapValue: { fields: { deep: { integerValue: "1" } } } } } } },
            empty: { mapValue: { fields: {} } },
        });
    });

    test("decodes all value types", () => {
        const data = decodeFirestoreFields({
            n: { nullValue: null },
            b: { booleanValue: true },
            i: { integerValue: "42" },
            big: { integerValue: "9007199254740993" },
            d: { doubleValue: 1.5 },
            t: { timestampValue: "2026-01-02T03:04:05.678901Z" },
            s: { stringValue: "text" },
            bytes: { bytesValue: "AQID" },
            ref: { referenceValue: `${root}/user/abc` },
            geo: { geoPointValue: { latitude: 35.6, longitude: 139.7 } },
            arr: { arrayValue: { values: [{ integerValue: "1" }, { stringValue: "a" }] } },
            emptyArr: { arrayValue: {} },
            map: { mapValue: { fields: { x: { booleanValue: false } } } },
        });
        expect(data.n).toBeNull();
        expect(data.b).toBe(true);
        expect(data.i).toBe(42);
        expect(data.big).toBe(BigInt("9007199254740993"));
        expect(data.d).toBe(1.5);
        expect(data.t).toEqual(new Date("2026-01-02T03:04:05.678Z"));
        expect(data.s).toBe("text");
        expect(Array.from(data.bytes as Uint8Array)).toEqual([1, 2, 3]);
        expect(data.ref).toBeInstanceOf(FirestoreReference);
        expect((data.ref as FirestoreReference).path).toBe("user/abc");
        expect(data.geo).toEqual(new FirestoreGeoPoint(35.6, 139.7));
        expect(data.arr).toEqual([1, "a"]);
        expect(data.emptyArr).toEqual([]);
        expect(data.map).toEqual({ x: false });
    });

    test("precise timestamps keep nanoseconds", () => {
        const value = decodeFirestoreValue({ timestampValue: "2026-01-02T03:04:05.123456789Z" }, { preciseTimestamps: true });
        expect(value).toBeInstanceOf(FirestoreTimestamp);
        expect((value as FirestoreTimestamp).nanos).toBe(123456789);
        expect(encodeFirestoreValue(value)).toEqual({ timestampValue: "2026-01-02T03:04:05.123456789Z" });
    });

    test("extracts increment / serverTimestamp / delete sentinels", () => {
        const encoded = encodeFirestoreWriteFields({
            name: "a",
            count: FirestoreFieldValue.increment(2),
            legacy: new DatabaseIncrement(1.5),
            updatedAt: FirestoreFieldValue.serverTimestamp(),
            stats: { views: FirestoreFieldValue.increment(1), label: "x" },
            "odd-key": 1,
            removed: FirestoreFieldValue.delete(),
        });
        expect(encoded.fields).toEqual({
            name: { stringValue: "a" },
            stats: { mapValue: { fields: { label: { stringValue: "x" } } } },
            "odd-key": { integerValue: "1" },
        });
        expect(encoded.transforms).toEqual([
            { fieldPath: "count", increment: { integerValue: "2" } },
            { fieldPath: "legacy", increment: { doubleValue: 1.5 } },
            { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
            { fieldPath: "stats.views", increment: { integerValue: "1" } },
        ]);
        expect(encoded.leafPaths).toEqual(["name", "stats.label", "`odd-key`", "removed"]);
        expect(encoded.deletePaths).toEqual(["removed"]);
    });

    test("sentinels inside arrays are rejected", () => {
        expect(() => encodeFirestoreWriteFields({ arr: [FirestoreFieldValue.increment(1)] })).toThrow();
    });
});

describe("FirestoreRestClient", () => {
    test("resolves project ID: option -> service account -> FIREBASE_PROJECT_ID", async () => {
        const noProject = await generateServiceAccountJson();
        expect(createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount }, { projectId: "opt" }).projectId).toBe("opt");
        expect(createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount, FIREBASE_PROJECT_ID: "env" }).projectId).toBe("test-project");
        expect(createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: noProject, FIREBASE_PROJECT_ID: "env" }).projectId).toBe("env");
        expect(() => createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: noProject })).toThrow(/project ID/);
        expect(() => createFirestoreClient({})).toThrow(/GOOGLE_SERVICE_ACCOUNT/);
        const client = createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        expect(client.databaseId).toBe("(default)");
        expect(createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount, FIRESTORE_DATABASE_ID: "shared" }).databaseId).toBe("shared");
    });

    test("caches access tokens across requests with the datastore scope", async () => {
        const { calls, tokenRequests } = installFetch((call) => {
            if (call.method === "GET") {
                return { status: 404, json: { error: { code: 404, status: "NOT_FOUND", message: "missing" } } };
            }
            return undefined;
        });
        const client = createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        expect(await client.getDocument("user/a")).toBeNull();
        expect(await client.getDocument("user/b")).toBeNull();
        expect(tokenRequests()).toBe(1);
        expect(calls[0].headers["Authorization"]).toBe("Bearer token-1");
        expect(calls[1].headers["Authorization"]).toBe("Bearer token-1");
        expect(calls[0].url).toBe(`${base}/user/a`);
        clearGoogleAccessTokenCache();
        await client.getDocument("user/c");
        expect(tokenRequests()).toBe(2);
        const jwt = (globalThis.fetch as jest.Mock).mock.calls
            .find((args: unknown[]) => args[0] === "https://oauth2.googleapis.com/token")[1].body as URLSearchParams;
        const assertion = String(jwt.get("assertion"));
        const payload = JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString());
        expect(payload.scope).toBe("https://www.googleapis.com/auth/datastore");
    });

    test("getDocument decodes the document", async () => {
        installFetch(() => ({
            json: {
                name: `${root}/user/a`,
                fields: { name: { stringValue: "Alice" }, age: { integerValue: "20" } },
                createTime: "2026-01-01T00:00:00Z",
                updateTime: "2026-01-02T00:00:00Z",
            },
        }));
        const client = createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        expect(await client.getDocument("/user/a/")).toEqual({
            path: "user/a",
            id: "a",
            data: { name: "Alice", age: 20 },
            createTime: "2026-01-01T00:00:00Z",
            updateTime: "2026-01-02T00:00:00Z",
        });
        expect(() => client.documentName("user")).toThrow(/Invalid document path/);
    });

    test("batchGet keeps the requested order", async () => {
        const { calls } = installFetch(() => ({
            json: [
                { missing: `${root}/user/b`, readTime: "x" },
                { found: { name: `${root}/user/a`, fields: { v: { integerValue: "1" } } }, readTime: "x" },
            ],
        }));
        const client = createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        const docs = await client.batchGet(["user/a", "user/b"]);
        expect(calls[0].url).toBe(`${base}:batchGet`);
        expect(calls[0].body).toEqual({ documents: [`${root}/user/a`, `${root}/user/b`] });
        expect(docs[0]?.data).toEqual({ v: 1 });
        expect(docs[1]).toBeNull();
    });

    test("setDocument / createDocument / updateDocument / deleteDocument build commit writes", async () => {
        const { calls } = installFetch(() => ({ json: { commitTime: "t", writeResults: [{ updateTime: "u" }] } }));
        const client = createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        await client.setDocument("user/a", { name: "A", count: FirestoreFieldValue.increment(1) });
        await client.setDocument("user/a", { profile: { name: "A" }, at: FirestoreFieldValue.serverTimestamp() }, { merge: true });
        await client.setDocument("user/a", { name: "A" }, { updateMask: ["name", "profile.age"] });
        const created = await client.createDocument("user", { name: "B" });
        await client.createDocument("user", { name: "C" }, { documentId: "fixed" });
        await client.updateDocument("user/a", { "profile.age": 3, gone: FirestoreFieldValue.delete() });
        await client.deleteDocument("user/a", { exists: true });
        for (const call of calls) {
            expect(call.url).toBe(`${base}:commit`);
        }
        expect(calls[0].body.writes[0]).toEqual({
            update: { name: `${root}/user/a`, fields: { name: { stringValue: "A" } } },
            updateTransforms: [{ fieldPath: "count", increment: { integerValue: "1" } }],
        });
        expect(calls[1].body.writes[0]).toEqual({
            update: {
                name: `${root}/user/a`,
                fields: { profile: { mapValue: { fields: { name: { stringValue: "A" } } } } },
            },
            updateMask: { fieldPaths: ["profile.name"] },
            updateTransforms: [{ fieldPath: "at", setToServerValue: "REQUEST_TIME" }],
        });
        expect(calls[2].body.writes[0].updateMask).toEqual({ fieldPaths: ["name", "profile.age"] });
        expect(created.id).toMatch(/^[A-Za-z0-9]{20}$/);
        expect(calls[3].body.writes[0].currentDocument).toEqual({ exists: false });
        expect(calls[3].body.writes[0].update.name).toBe(`${root}/user/${created.id}`);
        expect(calls[4].body.writes[0].update.name).toBe(`${root}/user/fixed`);
        expect(calls[5].body.writes[0]).toEqual({
            update: {
                name: `${root}/user/a`,
                fields: { profile: { mapValue: { fields: { age: { integerValue: "3" } } } } },
            },
            updateMask: { fieldPaths: ["profile.age", "gone"] },
            currentDocument: { exists: true },
        });
        expect(calls[6].body.writes[0]).toEqual({ delete: `${root}/user/a`, currentDocument: { exists: true } });
        await expect(client.setDocument("user/a", { x: FirestoreFieldValue.delete() })).rejects.toThrow(/merge/);
    });

    test("runQuery builds structured queries with filters, orders and cursors", async () => {
        const { calls } = installFetch(() => ({
            json: [
                { document: { name: `${root}/user/a/post/p1`, fields: { score: { integerValue: "5" } } }, readTime: "x" },
                { readTime: "x" },
            ],
        }));
        const client = createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        const docs = await client.runQuery("user/a/post", {
            where: [
                { field: "score", op: ">=", value: 3 },
                { field: "tags", op: "array-contains-any", value: ["x", "y"] },
                { field: "deletedAt", op: "==", value: null },
                { field: "meta.kind", op: "in", value: ["a"] },
            ],
            orderBy: [{ field: "score", direction: "desc" }, { field: "__name__" }],
            limit: 10,
            startAfter: [5, "p0"],
            endBefore: [1, "p9"],
            select: ["score"],
        });
        expect(docs).toEqual([{ path: "user/a/post/p1", id: "p1", data: { score: 5 }, createTime: undefined, updateTime: undefined }]);
        expect(calls[0].url).toBe(`${base}/user/a:runQuery`);
        expect(calls[0].body.structuredQuery).toEqual({
            from: [{ collectionId: "post", allDescendants: false }],
            where: {
                compositeFilter: {
                    op: "AND",
                    filters: [
                        { fieldFilter: { field: { fieldPath: "score" }, op: "GREATER_THAN_OR_EQUAL", value: { integerValue: "3" } } },
                        {
                            fieldFilter: {
                                field: { fieldPath: "tags" },
                                op: "ARRAY_CONTAINS_ANY",
                                value: { arrayValue: { values: [{ stringValue: "x" }, { stringValue: "y" }] } },
                            },
                        },
                        { unaryFilter: { op: "IS_NULL", field: { fieldPath: "deletedAt" } } },
                        {
                            fieldFilter: {
                                field: { fieldPath: "meta.kind" },
                                op: "IN",
                                value: { arrayValue: { values: [{ stringValue: "a" }] } },
                            },
                        },
                    ],
                },
            },
            orderBy: [
                { field: { fieldPath: "score" }, direction: "DESCENDING" },
                { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
            ],
            select: { fields: [{ fieldPath: "score" }] },
            startAt: { values: [{ integerValue: "5" }, { referenceValue: `${root}/user/a/post/p0` }], before: false },
            endAt: { values: [{ integerValue: "1" }, { referenceValue: `${root}/user/a/post/p9` }], before: true },
            limit: 10,
        });
    });

    test("runQuery on a top-level collection posts to the documents root", async () => {
        const { calls } = installFetch(() => ({ json: [] }));
        const client = createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        await client.runQuery("user", { where: [{ field: "a", op: "==", value: 1 }] });
        expect(calls[0].url).toBe(`${base}:runQuery`);
        expect(calls[0].body.structuredQuery.where).toEqual({
            fieldFilter: { field: { fieldPath: "a" }, op: "EQUAL", value: { integerValue: "1" } },
        });
        await expect(client.runQuery("user", { where: [{ field: "a", op: "in", value: [] }] })).rejects.toThrow(/non-empty/);
    });

    test("runQuery surfaces errors returned inside the stream", async () => {
        installFetch(() => ({ json: [{ error: { code: 9, status: "FAILED_PRECONDITION", message: "index required" } }] }));
        const client = createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        await expect(client.runQuery("user")).rejects.toThrow(/index required/);
    });
});

describe("transactions", () => {
    test("begin -> read -> commit with the transaction ID", async () => {
        const { calls } = installFetch((call) => {
            if (call.url.endsWith(":beginTransaction")) {
                return { json: { transaction: "tx-1" } };
            }
            if (call.method === "GET") {
                return { json: { name: `${root}/wallet/a`, fields: { balance: { integerValue: "100" } } } };
            }
            return { json: { commitTime: "t", writeResults: [{ updateTime: "u" }, { updateTime: "u" }] } };
        });
        const client = createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        const result = await client.runTransaction(async (tx) => {
            const wallet = await tx.get("wallet/a");
            const balance = (wallet?.data["balance"] as number) - 30;
            tx.update("wallet/a", { balance });
            tx.create("wallet/a/history/h1", { amount: -30, at: FirestoreFieldValue.serverTimestamp() });
            return balance;
        });
        expect(result).toBe(70);
        expect(calls.map((call) => `${call.method} ${call.url.replace(base, "")}`)).toEqual([
            "POST :beginTransaction",
            "GET /wallet/a?transaction=tx-1",
            "POST :commit",
        ]);
        expect(calls[0].body).toEqual({ options: { readWrite: {} } });
        expect(calls[2].body.transaction).toBe("tx-1");
        expect(calls[2].body.writes).toHaveLength(2);
        expect(calls[2].body.writes[0].currentDocument).toEqual({ exists: true });
    });

    test("rolls back when the callback throws", async () => {
        const { calls } = installFetch((call) => {
            if (call.url.endsWith(":beginTransaction")) {
                return { json: { transaction: "tx-1" } };
            }
            return { json: {} };
        });
        const client = createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        await expect(client.runTransaction(async () => {
            throw new Error("boom");
        })).rejects.toThrow("boom");
        expect(calls.map((call) => call.url.replace(base, ""))).toEqual([":beginTransaction", ":rollback"]);
        expect(calls[1].body).toEqual({ transaction: "tx-1" });
    });

    test("retries with retryTransaction when commit is ABORTED", async () => {
        let begins = 0;
        let commits = 0;
        const { calls } = installFetch((call) => {
            if (call.url.endsWith(":beginTransaction")) {
                begins++;
                return { json: { transaction: `tx-${begins}` } };
            }
            if (call.url.endsWith(":commit")) {
                commits++;
                if (commits === 1) {
                    return { status: 409, json: { error: { code: 409, status: "ABORTED", message: "contention" } } };
                }
                return { json: { writeResults: [{}] } };
            }
            return { json: {} };
        });
        const client = createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        let attempts = 0;
        await client.runTransaction(async (tx) => {
            attempts++;
            tx.set("counter/a", { value: FirestoreFieldValue.increment(1) }, { merge: true });
        });
        expect(attempts).toBe(2);
        const beginBodies = calls.filter((call) => call.url.endsWith(":beginTransaction")).map((call) => call.body);
        expect(beginBodies).toEqual([
            { options: { readWrite: {} } },
            { options: { readWrite: { retryTransaction: "tx-1" } } },
        ]);
        const commitBodies = calls.filter((call) => call.url.endsWith(":commit")).map((call) => call.body.transaction);
        expect(commitBodies).toEqual(["tx-1", "tx-2"]);
    });

    test("gives up after maxAttempts and does not retry other errors", async () => {
        installFetch((call) => {
            if (call.url.endsWith(":beginTransaction")) {
                return { json: { transaction: "tx" } };
            }
            if (call.url.endsWith(":commit")) {
                return { status: 409, json: { error: { code: 409, status: "ABORTED", message: "contention" } } };
            }
            return { json: {} };
        });
        const client = createFirestoreClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        let attempts = 0;
        const error = await client.runTransaction(async (tx) => {
            attempts++;
            tx.delete("a/b");
        }, { maxAttempts: 3 }).catch((e) => e);
        expect(error).toBeInstanceOf(FirestoreRestError);
        expect((error as FirestoreRestError).code).toBe("ABORTED");
        expect(attempts).toBe(3);

        installFetch((call) => {
            if (call.url.endsWith(":beginTransaction")) {
                return { json: { transaction: "tx" } };
            }
            if (call.url.endsWith(":commit")) {
                return { status: 409, json: { error: { code: 409, status: "ALREADY_EXISTS", message: "exists" } } };
            }
            return { json: {} };
        });
        attempts = 0;
        await expect(client.runTransaction(async (tx) => {
            attempts++;
            tx.create("a/b", {});
        })).rejects.toThrow(/ALREADY_EXISTS/);
        expect(attempts).toBe(1);
    });
});

describe("FirestoreDatabaseAdapter", () => {
    test("maps all 12 where condition types", () => {
        const types = [
            ["equalTo", "=="],
            ["notEqualTo", "!="],
            ["lessThan", "<"],
            ["lessThanOrEqualTo", "<="],
            ["greaterThan", ">"],
            ["greaterThanOrEqualTo", ">="],
            ["whereIn", "in"],
            ["whereNotIn", "not-in"],
            ["isNull", "is-null"],
            ["isNotNull", "is-not-null"],
            ["arrayContains", "array-contains"],
            ["arrayContainsAny", "array-contains-any"],
        ] as const;
        for (const [type, op] of types) {
            expect(databaseWhereToFirestoreWhere({ type, key: "k", value: [1] }).op).toBe(op);
        }
    });

    test("saveDocument converts DatabaseIncrement and merge", async () => {
        const { calls } = installFetch(() => ({ json: { writeResults: [{}] } }));
        const adapter = createFirestoreDatabaseAdapter({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        expect(adapter).toBeInstanceOf(FirestoreDatabaseAdapter);
        await adapter.saveDocument("user/a", { coin: new DatabaseIncrement(10), name: "A" }, { merge: true });
        expect(calls[0].body.writes[0]).toEqual({
            update: { name: `${root}/user/a`, fields: { name: { stringValue: "A" } } },
            updateMask: { fieldPaths: ["name"] },
            updateTransforms: [{ fieldPath: "coin", increment: { integerValue: "10" } }],
        });
    });

    test("query paginates with an opaque cursor ordered by inequality fields and __name__", async () => {
        const { calls } = installFetch(() => ({
            json: [
                { document: { name: `${root}/user/a`, fields: { age: { integerValue: "20" } } } },
                { document: { name: `${root}/user/b`, fields: { age: { integerValue: "25" } } } },
            ],
        }));
        const adapter = new FirestoreDatabaseAdapter({
            client: new FirestoreRestClient({ serviceAccount, accessToken: async () => "static" }),
        });
        const first = await adapter.query("user", {
            wheres: [
                { type: "greaterThan", key: "age", value: 18 },
                { type: "equalTo", key: "active", value: true },
            ],
            limit: 2,
        });
        expect(first.docs).toEqual([
            { path: "user/a", data: { age: 20 } },
            { path: "user/b", data: { age: 25 } },
        ]);
        expect(first.cursor).not.toBeNull();
        expect(calls[0].headers["Authorization"]).toBe("Bearer static");
        expect(calls[0].body.structuredQuery.orderBy).toEqual([
            { field: { fieldPath: "age" }, direction: "ASCENDING" },
            { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
        ]);
        await adapter.query("user", {
            wheres: [
                { type: "greaterThan", key: "age", value: 18 },
                { type: "equalTo", key: "active", value: true },
            ],
            limit: 2,
            cursor: first.cursor,
        });
        expect(calls[1].body.structuredQuery.startAt).toEqual({
            values: [{ integerValue: "25" }, { referenceValue: `${root}/user/b` }],
            before: false,
        });
        await expect(adapter.query("user", { cursor: first.cursor })).rejects.toThrow(/Cursor/);
    });

    test("query returns null cursor when fewer docs than limit", async () => {
        installFetch(() => ({ json: [{ document: { name: `${root}/user/a`, fields: {} } }] }));
        const adapter = createFirestoreDatabaseAdapter({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        const result = await adapter.query("user", { limit: 5 });
        expect(result.cursor).toBeNull();
        expect(await adapter.query("user")).toEqual({ docs: [{ path: "user/a", data: {} }], cursor: null });
    });

    test("getDocument returns null for missing documents", async () => {
        installFetch(() => ({ status: 404, json: { error: { status: "NOT_FOUND" } } }));
        const adapter = createFirestoreDatabaseAdapter({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
        expect(await adapter.getDocument("user/x")).toBeNull();
    });
});
