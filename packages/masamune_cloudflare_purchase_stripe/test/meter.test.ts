import { D1UsageEventStore, SqlDatabaseLike } from "../src/lib/meter/d1_usage_event_store";
import { flushStripeMeter } from "../src/lib/meter/flush_meter";
import { KVNamespaceLike, KVUsageBuffer } from "../src/lib/meter/kv_usage_buffer";
import { recordUsage } from "../src/lib/meter/record_usage";
import { StripeMeterClient } from "../src/lib/meter/stripe_meter_client";

function fakeDb(pendingRows: { id: string, units: number }[], executed: string[]): SqlDatabaseLike {
    return {
        prepare(sql: string) {
            return {
                bind(..._args: unknown[]) {
                    return {
                        async run() {
                            executed.push(sql.replace(/\s+/g, " ").trim());
                            return {};
                        },
                        async all<T>() {
                            return { results: pendingRows as unknown as T[] };
                        },
                    };
                },
            };
        },
    };
}

function fakeKv(store: Map<string, string>): KVNamespaceLike {
    return {
        async get(key: string) {
            const value = store.get(key);
            return value === undefined ? null : JSON.parse(value);
        },
        async put(key: string, value: string) {
            store.set(key, value);
        },
    };
}

function fakeFetch(status: number, onRequest?: (init?: RequestInit) => void): typeof fetch {
    return (async (_url: unknown, init?: RequestInit) => {
        onRequest?.(init);
        return new Response(status >= 400 ? "error" : "{}", { status });
    }) as typeof fetch;
}

function makeParts(options: {
    pendingRows: { id: string, units: number }[],
    executed: string[],
    store: Map<string, string>,
    fetch: typeof fetch,
}) {
    return {
        store: new D1UsageEventStore(fakeDb(options.pendingRows, options.executed)),
        buffer: new KVUsageBuffer(fakeKv(options.store)),
        client: new StripeMeterClient({
            secretKey: "sk_test_dummy",
            eventName: "test_decisions",
            fetch: options.fetch,
        }),
    };
}

describe("recordUsage", () => {
    it("Stripe flush が失敗したらバッファを保持して次回再送に回す", async () => {
        const executed: string[] = [];
        const store = new Map<string, string>();
        const parts = makeParts({
            pendingRows: [{ id: "u1", units: 10 }],
            executed,
            store,
            fetch: fakeFetch(500),
        });

        await recordUsage({
            ...parts,
            customerKey: "key_1",
            stripeCustomerId: "cus_123",
            endpoint: "decide",
            units: 10,
        });

        const buffer = JSON.parse(store.get("usage:key_1") ?? "{}");
        expect(buffer.units).toBe(10);
        expect(executed.some((sql) => sql.includes("SET flushed_to_stripe = 1"))).toBe(false);
    });

    it("Stripe flush が成功したらバッファをリセットし送信済みを記録する", async () => {
        const executed: string[] = [];
        const store = new Map<string, string>();
        const parts = makeParts({
            pendingRows: [{ id: "u1", units: 10 }],
            executed,
            store,
            fetch: fakeFetch(200),
        });

        await recordUsage({
            ...parts,
            customerKey: "key_1",
            stripeCustomerId: "cus_123",
            endpoint: "decide",
            units: 10,
        });

        const buffer = JSON.parse(store.get("usage:key_1") ?? "{}");
        expect(buffer.units).toBe(0);
        expect(executed.some((sql) => sql.includes("SET flushed_to_stripe = 1"))).toBe(true);
    });

    it("閾値未満なら flush せずバッファへ積むだけ", async () => {
        const executed: string[] = [];
        const store = new Map<string, string>();
        let fetchCalled = false;
        const parts = makeParts({
            pendingRows: [{ id: "u1", units: 1 }],
            executed,
            store,
            fetch: fakeFetch(200, () => {
                fetchCalled = true;
            }),
        });

        await recordUsage({
            ...parts,
            customerKey: "key_1",
            stripeCustomerId: "cus_123",
            endpoint: "decide",
            units: 1,
        });

        const buffer = JSON.parse(store.get("usage:key_1") ?? "{}");
        expect(buffer.units).toBe(1);
        expect(fetchCalled).toBe(false);
    });
});

describe("flushStripeMeter", () => {
    it("バッチごとに一意な identifier を送る", async () => {
        const identifiers: string[] = [];
        const parts = makeParts({
            pendingRows: [{ id: "u1", units: 3 }],
            executed: [],
            store: new Map(),
            fetch: fakeFetch(200, (init) => {
                identifiers.push(new URLSearchParams(String(init?.body ?? "")).get("identifier") ?? "");
            }),
        });
        const options = {
            store: parts.store,
            client: parts.client,
            customerKey: "key_1",
            stripeCustomerId: "cus_123",
        };

        expect(await flushStripeMeter(options)).toBe(true);
        expect(await flushStripeMeter(options)).toBe(true);
        expect(identifiers).toHaveLength(2);
        expect(identifiers[0]).not.toBe(identifiers[1]);
        expect(identifiers[0]?.startsWith("key_1:")).toBe(true);
    });

    it("Stripe がエラーを返したら false を返し flushed を更新しない", async () => {
        const executed: string[] = [];
        const parts = makeParts({
            pendingRows: [{ id: "u1", units: 3 }],
            executed,
            store: new Map(),
            fetch: fakeFetch(400),
        });

        expect(
            await flushStripeMeter({
                store: parts.store,
                client: parts.client,
                customerKey: "key_1",
                stripeCustomerId: "cus_123",
            }),
        ).toBe(false);
        expect(executed.some((sql) => sql.includes("SET flushed_to_stripe = 1"))).toBe(false);
    });

    it("secret や顧客IDが未設定なら送信せず成功扱いにする", async () => {
        let fetchCalled = false;
        const store = new D1UsageEventStore(fakeDb([{ id: "u1", units: 3 }], []));
        const disabledClient = new StripeMeterClient({
            secretKey: "",
            eventName: "test_decisions",
            fetch: fakeFetch(200, () => {
                fetchCalled = true;
            }),
        });

        expect(
            await flushStripeMeter({
                store,
                client: disabledClient,
                customerKey: "key_1",
                stripeCustomerId: "cus_123",
            }),
        ).toBe(true);
        expect(
            await flushStripeMeter({
                store,
                client: new StripeMeterClient({
                    secretKey: "sk_test_dummy",
                    eventName: "test_decisions",
                    fetch: fakeFetch(200, () => {
                        fetchCalled = true;
                    }),
                }),
                customerKey: "key_1",
                stripeCustomerId: null,
            }),
        ).toBe(true);
        expect(fetchCalled).toBe(false);
    });
});
