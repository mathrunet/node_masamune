import { D1StripePurchaseStore } from "../src/lib/purchase/d1_purchase_store";
import { mergeDocumentData } from "../src/lib/purchase/interface";
import { SqlDatabaseLike } from "../src/lib/meter/d1_usage_event_store";

interface Row {
    [key: string]: unknown;
}

// D1StripePurchaseStore が発行する SELECT / INSERT / UPDATE / DELETE を
// メモリ上のテーブルで解釈する最小のフェイクD1。
function fakeDb(tables: { [table: string]: Row[] }): SqlDatabaseLike {
    return {
        prepare(sql: string) {
            const normalized = sql.replace(/\s+/g, " ").trim();
            return {
                bind(...args: unknown[]) {
                    const run = async () => {
                        const insert = normalized.match(/^INSERT INTO (\w+) \(([^)]+)\) VALUES/);
                        if (insert) {
                            const table = insert[1] as string;
                            const columns = (insert[2] as string).split(",").map((s) => s.trim());
                            const row: Row = {};
                            columns.forEach((column, i) => {
                                row[column] = args[i];
                            });
                            (tables[table] ??= []).push(row);
                            return {};
                        }
                        const update = normalized.match(/^UPDATE (\w+) SET (.+) WHERE (.+)$/);
                        if (update) {
                            const table = update[1] as string;
                            const setColumns = (update[2] as string).split(",").map((s) => (s.split("=")[0] as string).trim());
                            const whereColumns = (update[3] as string).split("AND").map((s) => (s.split("=")[0] as string).trim());
                            const setValues = args.slice(0, setColumns.length);
                            const whereValues = args.slice(setColumns.length);
                            for (const row of tables[table] ?? []) {
                                if (whereColumns.every((column, i) => row[column] === whereValues[i])) {
                                    setColumns.forEach((column, i) => {
                                        row[column] = setValues[i];
                                    });
                                }
                            }
                            return {};
                        }
                        const del = normalized.match(/^DELETE FROM (\w+) WHERE (.+)$/);
                        if (del) {
                            const table = del[1] as string;
                            const whereColumns = (del[2] as string).split("AND").map((s) => (s.split("=")[0] as string).trim());
                            tables[table] = (tables[table] ?? []).filter(
                                (row) => !whereColumns.every((column, i) => row[column] === args[i]),
                            );
                            return {};
                        }
                        throw new Error(`Unsupported SQL: ${normalized}`);
                    };
                    const all = async <T>() => {
                        const select = normalized.match(/^SELECT (.+) FROM (\w+)(?: WHERE (.+?))?( LIMIT \d+)?$/);
                        if (!select) {
                            throw new Error(`Unsupported SQL: ${normalized}`);
                        }
                        const table = select[2] as string;
                        const where = select[3];
                        let rows = tables[table] ?? [];
                        if (where) {
                            const whereColumns = where.split("AND").map((s) => (s.split("=")[0] as string).trim());
                            rows = rows.filter((row) => whereColumns.every((column, i) => row[column] === args[i]));
                        }
                        return { results: rows as unknown as T[] };
                    };
                    return { run, all };
                },
            };
        },
    };
}

describe("mergeDocumentData", () => {
    it("nullのキーは削除しundefinedは無視する", () => {
        const merged = mergeDocumentData(
            { a: 1, b: 2, c: 3 },
            { a: null, b: undefined, d: 4 },
        );
        expect(merged).toEqual({ b: 2, c: 3, d: 4 });
    });
});

describe("D1StripePurchaseStore", () => {
    it("saveUserがマージ保存し検索キーカラムを同期する", async () => {
        const tables: { [table: string]: Row[] } = {};
        const store = new D1StripePurchaseStore(fakeDb(tables));

        await store.saveUser("user_1", { user: "user_1", customer: "cus_1" });
        await store.saveUser("user_1", { account: "acct_1", email: "a@b.c" });

        const user = await store.getUser("user_1");
        expect(user?.data).toMatchObject({
            user: "user_1",
            customer: "cus_1",
            account: "acct_1",
            email: "a@b.c",
        });
        expect(await store.findUserByCustomerId("cus_1")).not.toBeNull();
        expect(await store.findUserByAccountId("acct_1")).not.toBeNull();

        await store.saveUser("user_1", { customer: null });
        expect(await store.findUserByCustomerId("cus_1")).toBeNull();
        const after = await store.getUser("user_1");
        expect(after?.data["customer"]).toBeUndefined();
    });

    it("savePurchaseがpurchaseId/subscriptionを検索キーへ同期する", async () => {
        const tables: { [table: string]: Row[] } = {};
        const store = new D1StripePurchaseStore(fakeDb(tables));

        await store.savePurchase("order_1", {
            orderId: "order_1",
            purchaseId: "pi_1",
            user: "user_1",
        }, { userId: "user_1" });
        await store.savePurchase("order_2", {
            subscription: "sub_1",
            user: "user_1",
        });

        expect((await store.findPurchaseByPurchaseId("pi_1"))?.orderId).toBe("order_1");
        expect((await store.findPurchaseBySubscriptionId("sub_1"))?.orderId).toBe("order_2");
        expect((await store.getPurchase("order_1", "user_1"))?.data["purchaseId"]).toBe("pi_1");
        expect(await store.getPurchase("order_1", "other_user")).toBeNull();

        await store.savePurchase("order_1", { confirm: true, error: null });
        const purchase = await store.getPurchase("order_1");
        expect(purchase?.data["confirm"]).toBe(true);
        expect(purchase?.data["purchaseId"]).toBe("pi_1");
    });

    it("支払い方法の保存・一覧・削除ができる", async () => {
        const tables: { [table: string]: Row[] } = {};
        const store = new D1StripePurchaseStore(fakeDb(tables));

        await store.savePayment("user_1", "pm_1", { id: "pm_1", brand: "visa", default: true });
        await store.savePayment("user_1", "pm_2", { id: "pm_2", brand: "mc", default: false });
        await store.savePayment("user_1", "pm_1", { expMonth: 12 });

        const payments = await store.listPayments("user_1");
        expect(payments).toHaveLength(2);
        expect(payments.find((p) => p.paymentId === "pm_1")?.data).toMatchObject({
            brand: "visa",
            expMonth: 12,
        });

        await store.deletePayment("user_1", "pm_1");
        expect(await store.listPayments("user_1")).toHaveLength(1);
    });
});
