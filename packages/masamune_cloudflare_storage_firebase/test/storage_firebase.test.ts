import { webcrypto } from "crypto";
import { clearGoogleAccessTokenCache, deploy } from "@mathrunet/masamune_cloudflare";
import {
    Functions,
    FirebaseStorageClient,
    createFirebaseStorageClient,
    createR2CompatibleBucket,
} from "../src";

if (!(globalThis as { crypto?: Crypto }).crypto) {
    (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
}

const bucketName = "test-project.firebasestorage.app";

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
        client_email: "storage@test-project.iam.gserviceaccount.com",
        private_key: `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`,
        ...(projectId ? { project_id: projectId } : {}),
    });
}

interface StoredObject {
    name: string;
    generation: number;
    metageneration: number;
    contentType: string;
    metadata: Record<string, string>;
    body: Buffer;
}

/** In-memory fake of the Cloud Storage JSON API. */
class FakeCloudStorage {
    readonly objects = new Map<string, StoredObject>();
    readonly requests: string[] = [];
    tokenRequests = 0;
    private nextGeneration = 1000;

    install(): void {
        jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
            return this.handle(String(input), init ?? {});
        });
    }

    seed(name: string, body: string, metadata: Record<string, string> = {}): StoredObject {
        const object: StoredObject = {
            name,
            generation: this.nextGeneration++,
            metageneration: 1,
            contentType: "text/plain",
            metadata,
            body: Buffer.from(body),
        };
        this.objects.set(name, object);
        return object;
    }

    private async handle(rawUrl: string, init: RequestInit): Promise<Response> {
        const url = new URL(rawUrl);
        const method = init.method ?? "GET";
        if (url.host === "oauth2.googleapis.com") {
            this.tokenRequests += 1;
            return json({ access_token: "token", expires_in: 3600 });
        }
        expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
        this.requests.push(`${method} ${url.pathname}${url.search}`);
        const generationMatch = url.searchParams.get("ifGenerationMatch");
        const upload = url.pathname.match(/^\/upload\/storage\/v1\/b\/([^/]+)\/o$/);
        if (upload && method === "POST") {
            expect(decodeURIComponent(upload[1])).toBe(bucketName);
            const { resource, body } = parseMultipart(init);
            const current = this.objects.get(resource.name);
            if (generationMatch !== null && String(current?.generation ?? 0) !== generationMatch) {
                return json({ error: "conditionNotMet" }, 412);
            }
            const object: StoredObject = {
                name: resource.name,
                generation: this.nextGeneration++,
                metageneration: 1,
                contentType: resource.contentType,
                metadata: resource.metadata ?? {},
                body,
            };
            this.objects.set(object.name, object);
            return json(resourceOf(object));
        }
        const single = url.pathname.match(/^\/storage\/v1\/b\/([^/]+)\/o\/(.+)$/);
        if (single) {
            const name = decodeURIComponent(single[2]);
            const current = this.objects.get(name);
            if (!current) {
                return json({ error: "notFound" }, 404);
            }
            if (generationMatch !== null && String(current.generation) !== generationMatch) {
                return json({ error: "conditionNotMet" }, 412);
            }
            switch (method) {
                case "GET":
                    if (url.searchParams.get("alt") === "media") {
                        return new Response(new Uint8Array(current.body), { status: 200 });
                    }
                    return json(resourceOf(current));
                case "DELETE":
                    this.objects.delete(name);
                    return new Response(null, { status: 204 });
                case "PATCH": {
                    const metagenerationMatch = url.searchParams.get("ifMetagenerationMatch");
                    if (metagenerationMatch !== null && String(current.metageneration) !== metagenerationMatch) {
                        return json({ error: "conditionNotMet" }, 412);
                    }
                    const patch = JSON.parse(String(init.body)) as { metadata: Record<string, string> };
                    current.metadata = { ...current.metadata, ...patch.metadata };
                    current.metageneration += 1;
                    return json(resourceOf(current));
                }
            }
        }
        const list = url.pathname.match(/^\/storage\/v1\/b\/([^/]+)\/o$/);
        if (list && method === "GET") {
            const prefix = url.searchParams.get("prefix") ?? "";
            const max = Number(url.searchParams.get("maxResults") ?? "1000");
            const start = Number(url.searchParams.get("pageToken") ?? "0");
            const names = [...this.objects.keys()].filter((name) => name.startsWith(prefix)).sort();
            const page = names.slice(start, start + max);
            return json({
                items: page.map((name) => resourceOf(this.objects.get(name)!)),
                nextPageToken: start + max < names.length ? String(start + max) : undefined,
            });
        }
        throw new Error(`Unexpected request: ${method} ${rawUrl}`);
    }
}

function resourceOf(object: StoredObject) {
    return {
        name: object.name,
        bucket: bucketName,
        generation: String(object.generation),
        metageneration: String(object.metageneration),
        size: String(object.body.byteLength),
        contentType: object.contentType,
        updated: "2026-01-01T00:00:00.000Z",
        metadata: object.metadata,
    };
}

function parseMultipart(init: RequestInit): {
    resource: { name: string, contentType: string, metadata?: Record<string, string> },
    body: Buffer,
} {
    const contentType = new Headers(init.headers).get("Content-Type") ?? "";
    const boundary = contentType.match(/boundary=(.+)$/)?.[1];
    expect(contentType.startsWith("multipart/related")).toBe(true);
    const raw = Buffer.from(init.body as Uint8Array);
    const parts = raw.toString("latin1").split(`--${boundary}`);
    const jsonPart = parts[1].split("\r\n\r\n")[1].replace(/\r\n$/, "");
    const mediaPart = parts[2].substring(parts[2].indexOf("\r\n\r\n") + 4).replace(/\r\n$/, "");
    return {
        resource: JSON.parse(jsonPart),
        body: Buffer.from(mediaPart, "latin1"),
    };
}

function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

let serviceAccount: string;
let storage: FakeCloudStorage;

beforeAll(async () => {
    serviceAccount = await generateServiceAccountJson("test-project");
});

beforeEach(() => {
    clearGoogleAccessTokenCache();
    storage = new FakeCloudStorage();
    storage.install();
});

afterEach(() => {
    jest.restoreAllMocks();
});

function client(): FirebaseStorageClient {
    return createFirebaseStorageClient({ GOOGLE_SERVICE_ACCOUNT: serviceAccount });
}

describe("createFirebaseStorageClient", () => {
    test("resolves the bucket from the project ID", () => {
        expect(client().bucket).toBe(bucketName);
    });

    test("prefers FIREBASE_STORAGE_BUCKET", () => {
        expect(createFirebaseStorageClient({
            GOOGLE_SERVICE_ACCOUNT: serviceAccount,
            FIREBASE_STORAGE_BUCKET: "legacy.appspot.com",
        }).bucket).toBe("legacy.appspot.com");
    });

    test("throws without a service account", () => {
        expect(() => createFirebaseStorageClient({ FIREBASE_PROJECT_ID: "test-project" }))
            .toThrow("GOOGLE_SERVICE_ACCOUNT is not set.");
    });
});

describe("FirebaseStorageClient", () => {
    test("writes and reads an object with metadata", async () => {
        const storageClient = client();
        const written = await storageClient.put("private/a.json", "{\"value\":1}", {
            contentType: "application/json",
            customMetadata: { owner: "user" },
        });
        expect(written?.generation).toBeDefined();

        const object = await storageClient.get("private/a.json");
        expect(await object?.json()).toEqual({ value: 1 });
        expect(object?.contentType).toBe("application/json");
        expect(object?.customMetadata).toEqual({ owner: "user" });
        expect(object?.size).toBe(11);
        expect(storage.tokenRequests).toBe(1);
    });

    test("returns null for missing objects", async () => {
        expect(await client().get("missing.json")).toBeNull();
        expect(await client().head("missing.json")).toBeNull();
        expect(await client().delete("missing.json")).toBe(false);
    });

    test("supports create-only and optimistic writes", async () => {
        const storageClient = client();
        const created = await storageClient.put("locks/job.json", "{}", { ifGenerationMatch: 0 });
        expect(created).not.toBeNull();
        expect(await storageClient.put("locks/job.json", "{}", { ifGenerationMatch: 0 })).toBeNull();

        const updated = await storageClient.put("locks/job.json", "{\"done\":true}", {
            ifGenerationMatch: created!.generation,
        });
        expect(updated).not.toBeNull();
        // The old generation no longer matches.
        expect(await storageClient.put("locks/job.json", "{}", {
            ifGenerationMatch: created!.generation,
        })).toBeNull();
    });

    test("pages through list results", async () => {
        for (let i = 0; i < 5; i++) {
            storage.seed(`users/u1/${i}.txt`, String(i));
        }
        storage.seed("users/u2/0.txt", "other");
        const first = await client().list({ prefix: "users/u1/", limit: 2 });
        expect(first.objects.map((object) => object.key)).toEqual(["users/u1/0.txt", "users/u1/1.txt"]);
        expect(first.truncated).toBe(true);
        const second = await client().list({ prefix: "users/u1/", limit: 2, cursor: first.cursor });
        expect(second.objects.map((object) => object.key)).toEqual(["users/u1/2.txt", "users/u1/3.txt"]);
    });

    test("deletes every object under a prefix", async () => {
        for (let i = 0; i < 3; i++) {
            storage.seed(`users/u1/${i}.txt`, String(i));
        }
        storage.seed("users/u2/0.txt", "other");
        expect(await client().deletePrefix("users/u1/")).toBe(3);
        expect([...storage.objects.keys()]).toEqual(["users/u2/0.txt"]);
        await expect(client().deletePrefix("")).rejects.toThrow("A non-empty prefix is required.");
    });

    test("issues a download URL and reuses an existing token", async () => {
        storage.seed("public/a.png", "png");
        const url = await client().downloadUrl("public/a.png");
        const token = storage.objects.get("public/a.png")!.metadata.firebaseStorageDownloadTokens;
        expect(token).toBeTruthy();
        expect(url).toBe(
            `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/public%2Fa.png?alt=media&token=${token}`,
        );
        expect(await client().downloadUrl("public/a.png")).toBe(url);
        expect(storage.requests.filter((request) => request.startsWith("PATCH"))).toHaveLength(1);
        expect(await client().downloadUrl("missing.png")).toBeNull();
    });
});

describe("createR2CompatibleBucket", () => {
    test("emulates R2 conditional writes with etags", async () => {
        const bucket = createR2CompatibleBucket(client());
        const claim = await bucket.put("outbox/job.json", JSON.stringify({ status: "claimed" }), {
            onlyIf: { etagDoesNotMatch: "*" },
        });
        expect(claim).not.toBeNull();
        expect(await bucket.put("outbox/job.json", "{}", { onlyIf: { etagDoesNotMatch: "*" } })).toBeNull();

        const confirmed = await bucket.put("outbox/job.json", JSON.stringify({ status: "queued" }), {
            onlyIf: { etagMatches: claim!.etag },
        });
        expect(confirmed).not.toBeNull();
        expect(await bucket.put("outbox/job.json", "{}", { onlyIf: { etagMatches: claim!.etag } })).toBeNull();
        expect(await bucket.put("outbox/job.json", "{}", {
            onlyIf: { etagDoesNotMatch: confirmed!.httpEtag },
        })).toBeNull();

        const object = await bucket.get("outbox/job.json");
        expect(await object?.json()).toEqual({ status: "queued" });
        expect(object?.etag).toBe(confirmed!.etag);
        expect(await new Response(object!.body).text()).toBe("{\"status\":\"queued\"}");
    });

    test("supports head, list and batch delete", async () => {
        const bucket = createR2CompatibleBucket(client());
        await bucket.put("users/u1/a.json", "{}", { httpMetadata: { contentType: "application/json" } });
        await bucket.put("users/u1/b.json", "{}");
        expect((await bucket.head("users/u1/a.json"))?.httpMetadata.contentType).toBe("application/json");
        expect(await bucket.head("users/u1/missing.json")).toBeNull();
        const listed = await bucket.list({ prefix: "users/u1/", limit: 1000 });
        expect(listed.objects).toHaveLength(2);
        await bucket.delete(listed.objects.map((object) => object.key));
        expect(storage.objects.size).toBe(0);
    });
});

describe("storage_firebase worker", () => {
    function createApp() {
        return deploy([
            Functions.storageFirebase(),
        ], {
            rules: {
                version: "1",
                rules: {
                    storage: {
                        "public/**": {
                            read: "allow",
                            write: "allow",
                        },
                        "private/**": {
                            read: "deny",
                            write: "deny",
                        },
                    },
                },
            },
        });
    }

    const env = () => ({
        GOOGLE_SERVICE_ACCOUNT: serviceAccount,
        STORAGE_PUBLIC_BASE_URL: "https://storage.example.com/",
    });

    async function call(body: Record<string, unknown>) {
        return await createApp().request("http://localhost/storage_firebase", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
        }, env());
    }

    test("uploads and downloads an object", async () => {
        const upload = await call({
            operation: "put",
            path: "public/hello.txt",
            binary: btoa("hello"),
            meta: { contentType: "text/plain" },
        });
        const uploaded = await upload.json() as { meta: { downloadUri: string, publicUri: string } };
        expect(upload.status).toBe(200);
        expect(uploaded.meta.downloadUri).toContain("token=");
        expect(uploaded.meta.publicUri).toBe("https://storage.example.com/public/hello.txt");

        const download = await call({ operation: "get", path: "public/hello.txt" });
        const body = await download.json() as { binary: string, meta: { contentType: string } };
        expect(download.status).toBe(200);
        expect(atob(body.binary)).toBe("hello");
        expect(body.meta.contentType).toBe("text/plain");
    });

    test("denies storage paths by rules", async () => {
        const response = await call({
            operation: "put",
            path: "private/secret.txt",
            binary: btoa("secret"),
        });
        expect(response.status).toBe(403);
        expect((await response.json() as { error: string }).error).toBe("denied");
        expect(storage.objects.size).toBe(0);
    });

    test("issues a download URL and deletes an object", async () => {
        storage.seed("public/a.txt", "a");
        const url = await call({ operation: "downloadUrl", path: "public/a.txt" });
        expect(url.status).toBe(200);
        expect((await url.json() as { meta: { downloadUri: string } }).meta.downloadUri)
            .toContain("firebasestorage.googleapis.com");

        const deleted = await call({ operation: "delete", path: "public/a.txt" });
        expect(deleted.status).toBe(200);
        expect(storage.objects.size).toBe(0);

        const missing = await call({ operation: "get", path: "public/a.txt" });
        expect(missing.status).toBe(404);
    });

    test("rejects invalid paths", async () => {
        const response = await call({ operation: "get", path: "../etc/passwd" });
        expect(response.status).toBe(400);
    });
});
