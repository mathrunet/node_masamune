import { SqlDatabaseLike } from "../meter/d1_usage_event_store";
import {
    mergeDocumentData,
    StripeDocumentData,
    StripePaymentDocument,
    StripePurchaseDocument,
    StripePurchaseStore,
    StripeUserDocument,
} from "./interface";

/**
 * Table name options for [D1StripePurchaseStore].
 *
 * Expected default schema (see the package README for the full DDL):
 *
 * - `stripe_users(user_id PK, customer_id, account_id, data, created_at, updated_at)`
 * - `stripe_payments(user_id, payment_id, data, created_at, updated_at, PK(user_id, payment_id))`
 * - `stripe_purchases(order_id PK, user_id, purchase_id, subscription_id, data, created_at, updated_at)`
 *
 * [D1StripePurchaseStore]のテーブル名オプション。
 *
 * 想定するデフォルトスキーマ（完全なDDLはパッケージREADMEを参照）:
 *
 * - `stripe_users(user_id PK, customer_id, account_id, data, created_at, updated_at)`
 * - `stripe_payments(user_id, payment_id, data, created_at, updated_at, PK(user_id, payment_id))`
 * - `stripe_purchases(order_id PK, user_id, purchase_id, subscription_id, data, created_at, updated_at)`
 */
export interface D1StripePurchaseStoreOptions {
    /**
     * Users table name. Defaults to `stripe_users`.
     *
     * ユーザーテーブル名。デフォルトは`stripe_users`。
     */
    usersTable?: string | undefined;

    /**
     * Payments table name. Defaults to `stripe_payments`.
     *
     * 支払い方法テーブル名。デフォルトは`stripe_payments`。
     */
    paymentsTable?: string | undefined;

    /**
     * Purchases table name. Defaults to `stripe_purchases`.
     *
     * 購入テーブル名。デフォルトは`stripe_purchases`。
     */
    purchasesTable?: string | undefined;
}

interface DocumentRow {
    data: string | null;
    user_id?: string | null;
}

/**
 * [StripePurchaseStore] backed by Cloudflare D1 (or any compatible SQL database).
 *
 * Documents are stored as JSON in the `data` column while lookup keys
 * (`customer_id` / `account_id` / `purchase_id` / `subscription_id`) are kept in
 * sync as indexed columns.
 *
 * Cloudflare D1（または互換SQLデータベース）を用いた[StripePurchaseStore]。
 *
 * ドキュメントは`data`カラムへJSONとして保存し、検索キー
 * （`customer_id` / `account_id` / `purchase_id` / `subscription_id`）は
 * インデックス付きカラムとして同期します。
 */
export class D1StripePurchaseStore implements StripePurchaseStore {
    /**
     * [StripePurchaseStore] backed by Cloudflare D1 (or any compatible SQL database).
     *
     * Cloudflare D1（または互換SQLデータベース）を用いた[StripePurchaseStore]。
     */
    constructor(db: SqlDatabaseLike, options: D1StripePurchaseStoreOptions = {}) {
        this._db = db;
        this._users = options.usersTable ?? "stripe_users";
        this._payments = options.paymentsTable ?? "stripe_payments";
        this._purchases = options.purchasesTable ?? "stripe_purchases";
    }

    private readonly _db: SqlDatabaseLike;
    private readonly _users: string;
    private readonly _payments: string;
    private readonly _purchases: string;

    private static _parse(row: DocumentRow | undefined): StripeDocumentData | null {
        if (!row) {
            return null;
        }
        try {
            return JSON.parse(row.data ?? "{}") as StripeDocumentData;
        } catch {
            return {};
        }
    }

    async getUser(userId: string): Promise<StripeUserDocument | null> {
        const res = await this._db
            .prepare(`SELECT data FROM ${this._users} WHERE user_id = ?`)
            .bind(userId)
            .all<DocumentRow>();
        const data = D1StripePurchaseStore._parse(res.results?.[0]);
        return data === null ? null : { userId, data };
    }

    async findUserByCustomerId(customerId: string): Promise<StripeUserDocument | null> {
        const res = await this._db
            .prepare(`SELECT user_id, data FROM ${this._users} WHERE customer_id = ? LIMIT 1`)
            .bind(customerId)
            .all<DocumentRow & { user_id: string }>();
        const row = res.results?.[0];
        const data = D1StripePurchaseStore._parse(row);
        return row && data !== null ? { userId: row.user_id, data } : null;
    }

    async findUserByAccountId(accountId: string): Promise<StripeUserDocument | null> {
        const res = await this._db
            .prepare(`SELECT user_id, data FROM ${this._users} WHERE account_id = ? LIMIT 1`)
            .bind(accountId)
            .all<DocumentRow & { user_id: string }>();
        const row = res.results?.[0];
        const data = D1StripePurchaseStore._parse(row);
        return row && data !== null ? { userId: row.user_id, data } : null;
    }

    async saveUser(userId: string, update: StripeDocumentData): Promise<void> {
        const now = Date.now();
        const existing = await this.getUser(userId);
        const merged = mergeDocumentData(existing?.data ?? {}, update);
        const customerId = typeof merged["customer"] === "string" ? merged["customer"] : null;
        const accountId = typeof merged["account"] === "string" ? merged["account"] : null;
        if (existing) {
            await this._db
                .prepare(
                    `UPDATE ${this._users}
                     SET customer_id = ?, account_id = ?, data = ?, updated_at = ?
                     WHERE user_id = ?`,
                )
                .bind(customerId, accountId, JSON.stringify(merged), now, userId)
                .run();
        } else {
            await this._db
                .prepare(
                    `INSERT INTO ${this._users}
                      (user_id, customer_id, account_id, data, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                )
                .bind(userId, customerId, accountId, JSON.stringify(merged), now, now)
                .run();
        }
    }

    async listPayments(userId: string): Promise<StripePaymentDocument[]> {
        const res = await this._db
            .prepare(`SELECT payment_id, data FROM ${this._payments} WHERE user_id = ?`)
            .bind(userId)
            .all<{ payment_id: string, data: string | null }>();
        return (res.results ?? []).map((row) => ({
            userId,
            paymentId: row.payment_id,
            data: D1StripePurchaseStore._parse(row) ?? {},
        }));
    }

    async savePayment(userId: string, paymentId: string, update: StripeDocumentData): Promise<void> {
        const now = Date.now();
        const res = await this._db
            .prepare(`SELECT data FROM ${this._payments} WHERE user_id = ? AND payment_id = ?`)
            .bind(userId, paymentId)
            .all<DocumentRow>();
        const existing = D1StripePurchaseStore._parse(res.results?.[0]);
        const merged = mergeDocumentData(existing ?? {}, update);
        if (existing !== null) {
            await this._db
                .prepare(
                    `UPDATE ${this._payments} SET data = ?, updated_at = ?
                     WHERE user_id = ? AND payment_id = ?`,
                )
                .bind(JSON.stringify(merged), now, userId, paymentId)
                .run();
        } else {
            await this._db
                .prepare(
                    `INSERT INTO ${this._payments}
                      (user_id, payment_id, data, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?)`,
                )
                .bind(userId, paymentId, JSON.stringify(merged), now, now)
                .run();
        }
    }

    async deletePayment(userId: string, paymentId: string): Promise<void> {
        await this._db
            .prepare(`DELETE FROM ${this._payments} WHERE user_id = ? AND payment_id = ?`)
            .bind(userId, paymentId)
            .run();
    }

    async getPurchase(orderId: string, userId?: string | undefined): Promise<StripePurchaseDocument | null> {
        const res = userId
            ? await this._db
                .prepare(`SELECT user_id, data FROM ${this._purchases} WHERE order_id = ? AND user_id = ?`)
                .bind(orderId, userId)
                .all<DocumentRow>()
            : await this._db
                .prepare(`SELECT user_id, data FROM ${this._purchases} WHERE order_id = ?`)
                .bind(orderId)
                .all<DocumentRow>();
        const row = res.results?.[0];
        const data = D1StripePurchaseStore._parse(row);
        return row && data !== null ? { orderId, userId: row.user_id ?? null, data } : null;
    }

    async findPurchaseByPurchaseId(purchaseId: string): Promise<StripePurchaseDocument | null> {
        const res = await this._db
            .prepare(`SELECT order_id, user_id, data FROM ${this._purchases} WHERE purchase_id = ? LIMIT 1`)
            .bind(purchaseId)
            .all<DocumentRow & { order_id: string }>();
        const row = res.results?.[0];
        const data = D1StripePurchaseStore._parse(row);
        return row && data !== null ? { orderId: row.order_id, userId: row.user_id ?? null, data } : null;
    }

    async findPurchaseBySubscriptionId(subscriptionId: string): Promise<StripePurchaseDocument | null> {
        const res = await this._db
            .prepare(`SELECT order_id, user_id, data FROM ${this._purchases} WHERE subscription_id = ? LIMIT 1`)
            .bind(subscriptionId)
            .all<DocumentRow & { order_id: string }>();
        const row = res.results?.[0];
        const data = D1StripePurchaseStore._parse(row);
        return row && data !== null ? { orderId: row.order_id, userId: row.user_id ?? null, data } : null;
    }

    async savePurchase(
        orderId: string,
        update: StripeDocumentData,
        options: { userId?: string | undefined } = {},
    ): Promise<void> {
        const now = Date.now();
        const existing = await this.getPurchase(orderId);
        const merged = mergeDocumentData(existing?.data ?? {}, update);
        const userId = options.userId
            ?? (typeof merged["user"] === "string" ? merged["user"] : existing?.userId ?? null);
        const purchaseId = typeof merged["purchaseId"] === "string" ? merged["purchaseId"] : null;
        const subscriptionId = typeof merged["subscription"] === "string" ? merged["subscription"] : null;
        if (existing) {
            await this._db
                .prepare(
                    `UPDATE ${this._purchases}
                     SET user_id = ?, purchase_id = ?, subscription_id = ?, data = ?, updated_at = ?
                     WHERE order_id = ?`,
                )
                .bind(userId, purchaseId, subscriptionId, JSON.stringify(merged), now, orderId)
                .run();
        } else {
            await this._db
                .prepare(
                    `INSERT INTO ${this._purchases}
                      (order_id, user_id, purchase_id, subscription_id, data, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                )
                .bind(orderId, userId, purchaseId, subscriptionId, JSON.stringify(merged), now, now)
                .run();
        }
    }
}
