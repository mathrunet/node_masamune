import { deploy } from "@mathrunet/masamune_cloudflare";
import { Functions } from "../src/functions";
import { ShortLinkKVNamespace, ShortLinkWorkersOptions } from "../src/lib/interface";
import {
    buildShortLinkDestination,
    generateShortLinkCode,
    isAllowedShortLinkHost,
    isValidShortLinkCode,
    timingSafeEqualString,
} from "../src/lib/short_link";

const TOKEN = "admin-token-xyz";

class FakeKV implements ShortLinkKVNamespace {
    readonly store = new Map<string, { value: string; expiration?: number }>();

    async get(key: string): Promise<string | null> {
        return this.store.get(key)?.value ?? null;
    }

    async put(key: string, value: string, options?: { expiration?: number }): Promise<void> {
        this.store.set(key, { value, expiration: options?.expiration });
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
    }

    async list(options?: { prefix?: string; limit?: number; cursor?: string }) {
        const names = [...this.store.keys()].filter((key) => key.startsWith(options?.prefix ?? "")).sort();
        const start = options?.cursor ? Number(options.cursor) : 0;
        const limit = options?.limit ?? 1000;
        const keys = names.slice(start, start + limit).map((name) => ({ name }));
        const complete = start + limit >= names.length;
        return { keys, list_complete: complete, cursor: complete ? undefined : String(start + limit) };
    }
}

function createApp(options: ShortLinkWorkersOptions = {}) {
    const kv = new FakeKV();
    const shared: ShortLinkWorkersOptions = { allowedHosts: ["example.com", "*.example.net"], ...options };
    const app = deploy([
        Functions.shortLink(shared),
        Functions.shortLinkAdmin(shared),
    ]);
    const env = { SHORT_LINK_KV: kv, SHORT_LINK_ADMIN_TOKEN: TOKEN };
    const request = (path: string, init: RequestInit = {}, token: string | null = TOKEN) => {
        const headers = new Headers(init.headers);
        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }
        if (init.body) {
            headers.set("Content-Type", "application/json");
        }
        return app.fetch(new Request(`https://example.com${path}`, { ...init, headers }), env);
    };
    return { app, kv, env, request };
}

describe("helpers", () => {
    test("generates base62 codes of the requested length", () => {
        for (let i = 0; i < 50; i++) {
            const code = generateShortLinkCode(7);
            expect(code).toMatch(/^[0-9A-Za-z]{7}$/);
        }
    });

    test("validates codes", () => {
        expect(isValidShortLinkCode("abc")).toBe(true);
        expect(isValidShortLinkCode("launch_en-v3")).toBe(true);
        expect(isValidShortLinkCode("ab")).toBe(false);
        expect(isValidShortLinkCode("a/b")).toBe(false);
        expect(isValidShortLinkCode("a b c")).toBe(false);
    });

    test("matches allowed hosts", () => {
        expect(isAllowedShortLinkHost("example.com", ["example.com"])).toBe(true);
        expect(isAllowedShortLinkHost("evil.com", ["example.com"])).toBe(false);
        expect(isAllowedShortLinkHost("a.example.net", ["*.example.net"])).toBe(true);
        expect(isAllowedShortLinkHost("example.net", ["*.example.net"])).toBe(true);
        expect(isAllowedShortLinkHost("badexample.net", ["*.example.net"])).toBe(false);
        expect(isAllowedShortLinkHost("anything.com", [])).toBe(true);
    });

    test("appends params and overrides existing keys", () => {
        const url = buildShortLinkDestination({
            code: "abc",
            url: "https://example.com/track/1?utm_source=old&lang=ja",
            params: { utm_source: "x", utm_campaign: "launch" },
            createdAt: "",
            updatedAt: "",
        });
        expect(url.searchParams.get("utm_source")).toBe("x");
        expect(url.searchParams.get("utm_campaign")).toBe("launch");
        expect(url.searchParams.get("lang")).toBe("ja");
    });

    test("compares strings in constant time", () => {
        expect(timingSafeEqualString("abc", "abc")).toBe(true);
        expect(timingSafeEqualString("abc", "abd")).toBe(false);
        expect(timingSafeEqualString("abc", "abcd")).toBe(false);
    });
});

describe("admin API", () => {
    test("rejects requests without a valid token", async () => {
        const { request } = createApp();
        expect((await request("/short_link", {}, null)).status).toBe(401);
        expect((await request("/short_link", {}, "wrong")).status).toBe(401);
    });

    test("returns 500 when the admin token is not configured", async () => {
        const kv = new FakeKV();
        const app = deploy([Functions.shortLinkAdmin()]);
        const response = await app.fetch(new Request("https://example.com/short_link", {
            headers: { Authorization: `Bearer ${TOKEN}` },
        }), { SHORT_LINK_KV: kv });
        expect(response.status).toBe(500);
    });

    test("creates a link with a generated code", async () => {
        const { request, kv } = createApp({ codeLength: 8 });
        const response = await request("/short_link", {
            method: "POST",
            body: JSON.stringify({ url: "https://example.com/track/1", params: { utm_source: "x", utm_medium: "social" }, note: "memo" }),
        });
        expect(response.status).toBe(201);
        const body = await response.json() as Record<string, any>;
        expect(body.code).toMatch(/^[0-9A-Za-z]{8}$/);
        expect(body.params).toEqual({ utm_source: "x", utm_medium: "social" });
        expect(body.note).toBe("memo");
        expect(kv.store.has(`short_link:${body.code}`)).toBe(true);
    });

    test("creates a link with a custom code and rejects duplicates", async () => {
        const { request } = createApp();
        const init = { method: "POST", body: JSON.stringify({ url: "https://example.com/", code: "launch_en" }) };
        expect((await request("/short_link", init)).status).toBe(201);
        expect((await request("/short_link", init)).status).toBe(409);
    });

    test("rejects invalid input", async () => {
        const { request } = createApp();
        const post = (body: unknown) => request("/short_link", { method: "POST", body: JSON.stringify(body) });
        expect((await post({ url: "https://evil.com/" })).status).toBe(400);
        expect((await post({ url: "http://example.com/" })).status).toBe(400);
        expect((await post({ url: "javascript:alert(1)" })).status).toBe(400);
        expect((await post({ url: "https://user:pass@example.com/" })).status).toBe(400);
        expect((await post({ url: "https://example.com/", code: "a/b" })).status).toBe(400);
        expect((await post({ url: "https://example.com/", params: { "bad key": "x" } })).status).toBe(400);
        expect((await post({ url: "https://example.com/", params: { utm_source: 1 } })).status).toBe(400);
        expect((await post({ url: "https://example.com/", expiresAt: "2000-01-01T00:00:00Z" })).status).toBe(400);
        expect((await request("/short_link", { method: "POST", body: "not json" })).status).toBe(400);
    });

    test("gets, lists, updates and deletes links", async () => {
        const { request } = createApp();
        for (const code of ["aaa", "bbb", "ccc"]) {
            await request("/short_link", { method: "POST", body: JSON.stringify({ url: "https://example.com/", code }) });
        }
        const first = await (await request("/short_link?limit=2")).json() as Record<string, any>;
        expect(first.links.map((link: any) => link.code)).toEqual(["aaa", "bbb"]);
        expect(first.cursor).toBeDefined();
        const second = await (await request(`/short_link?limit=2&cursor=${first.cursor}`)).json() as Record<string, any>;
        expect(second.links.map((link: any) => link.code)).toEqual(["ccc"]);
        expect(second.cursor).toBeUndefined();

        const created = await (await request("/short_link/aaa")).json() as Record<string, any>;
        const updated = await request("/short_link/aaa", {
            method: "PUT",
            body: JSON.stringify({ url: "https://a.example.net/", params: { utm_source: "tiktok" } }),
        });
        expect(updated.status).toBe(200);
        const updatedBody = await updated.json() as Record<string, any>;
        expect(updatedBody.url).toBe("https://a.example.net/");
        expect(updatedBody.createdAt).toBe(created.createdAt);

        expect((await request("/short_link/zzz", { method: "PUT", body: JSON.stringify({ url: "https://example.com/" }) })).status).toBe(404);
        expect((await request("/short_link/aaa", { method: "DELETE" })).status).toBe(200);
        expect((await request("/short_link/aaa")).status).toBe(404);
    });
});

describe("redirect", () => {
    test("redirects to the destination with params", async () => {
        const { request } = createApp();
        await request("/short_link", {
            method: "POST",
            body: JSON.stringify({ url: "https://example.com/track/1", code: "abc", params: { utm_source: "x", utm_campaign: "launch_en" } }),
        });
        const response = await request("/s/abc?utm_source=ignored", {}, null);
        expect(response.status).toBe(302);
        const location = new URL(response.headers.get("Location")!);
        expect(location.origin + location.pathname).toBe("https://example.com/track/1");
        expect(location.searchParams.get("utm_source")).toBe("x");
        expect(location.searchParams.get("utm_campaign")).toBe("launch_en");
        expect(response.headers.get("Cache-Control")).toContain("no-store");
    });

    test("returns 404 for unknown or invalid codes", async () => {
        const { request } = createApp();
        expect((await request("/s/unknown", {}, null)).status).toBe(404);
        expect((await request("/s/a", {}, null)).status).toBe(404);
    });

    test("redirects to notFoundUrl when configured", async () => {
        const { request } = createApp({ notFoundUrl: "https://example.com/" });
        const response = await request("/s/unknown", {}, null);
        expect(response.status).toBe(302);
        expect(response.headers.get("Location")).toBe("https://example.com/");
    });

    test("treats expired links as not found", async () => {
        const { request, kv } = createApp();
        await kv.put("short_link:old", JSON.stringify({
            code: "old",
            url: "https://example.com/",
            createdAt: "2020-01-01T00:00:00Z",
            updatedAt: "2020-01-01T00:00:00Z",
            expiresAt: "2020-02-01T00:00:00Z",
        }));
        expect((await request("/s/old", {}, null)).status).toBe(404);
    });

    test("applies resolveDestination", async () => {
        const { request } = createApp({
            resolveDestination: (record, destination) => {
                destination.searchParams.set("ct", destination.searchParams.get("utm_campaign") ?? "");
                destination.searchParams.delete("utm_campaign");
                return destination;
            },
        });
        await request("/short_link", {
            method: "POST",
            body: JSON.stringify({ url: "https://example.com/app", code: "store", params: { utm_campaign: "launch" } }),
        });
        const location = new URL((await request("/s/store", {}, null)).headers.get("Location")!);
        expect(location.searchParams.get("ct")).toBe("launch");
        expect(location.searchParams.has("utm_campaign")).toBe(false);
    });

    test("supports a custom path and key prefix", async () => {
        const kv = new FakeKV();
        const app = deploy([
            Functions.shortLink({ path: "go", keyPrefix: "link:" }),
        ]);
        await kv.put("link:abc", JSON.stringify({ code: "abc", url: "https://example.com/", createdAt: "", updatedAt: "" }));
        const response = await app.fetch(new Request("https://example.com/go/abc"), { SHORT_LINK_KV: kv });
        expect(response.status).toBe(302);
    });
});
