import {
    mergeDocumentData,
    StripeDocumentData,
    StripePaymentDocument,
    StripePurchaseDocument,
    StripePurchaseStore,
    StripeUserDocument,
} from "../../src/lib/purchase/interface";

/**
 * In-memory [StripePurchaseStore] for tests.
 *
 * テスト用のインメモリ[StripePurchaseStore]。
 */
export class MemoryPurchaseStore implements StripePurchaseStore {
    users = new Map<string, StripeDocumentData>();
    payments = new Map<string, StripeDocumentData>();
    purchases = new Map<string, { userId: string | null, data: StripeDocumentData }>();

    async getUser(userId: string): Promise<StripeUserDocument | null> {
        const data = this.users.get(userId);
        return data ? { userId, data } : null;
    }
    async findUserByCustomerId(customerId: string): Promise<StripeUserDocument | null> {
        for (const [userId, data] of this.users) {
            if (data["customer"] === customerId) {
                return { userId, data };
            }
        }
        return null;
    }
    async findUserByAccountId(accountId: string): Promise<StripeUserDocument | null> {
        for (const [userId, data] of this.users) {
            if (data["account"] === accountId) {
                return { userId, data };
            }
        }
        return null;
    }
    async saveUser(userId: string, update: StripeDocumentData): Promise<void> {
        this.users.set(userId, mergeDocumentData(this.users.get(userId) ?? {}, update));
    }
    async listPayments(userId: string): Promise<StripePaymentDocument[]> {
        const list: StripePaymentDocument[] = [];
        for (const [key, data] of this.payments) {
            const [owner, paymentId] = key.split("/");
            if (owner === userId && paymentId) {
                list.push({ userId, paymentId, data });
            }
        }
        return list;
    }
    async savePayment(userId: string, paymentId: string, update: StripeDocumentData): Promise<void> {
        const key = `${userId}/${paymentId}`;
        this.payments.set(key, mergeDocumentData(this.payments.get(key) ?? {}, update));
    }
    async deletePayment(userId: string, paymentId: string): Promise<void> {
        this.payments.delete(`${userId}/${paymentId}`);
    }
    async getPurchase(orderId: string, userId?: string | undefined): Promise<StripePurchaseDocument | null> {
        const entry = this.purchases.get(orderId);
        if (!entry) {
            return null;
        }
        if (userId && entry.userId !== userId) {
            return null;
        }
        return { orderId, userId: entry.userId, data: entry.data };
    }
    async findPurchaseByPurchaseId(purchaseId: string): Promise<StripePurchaseDocument | null> {
        for (const [orderId, entry] of this.purchases) {
            if (entry.data["purchaseId"] === purchaseId) {
                return { orderId, userId: entry.userId, data: entry.data };
            }
        }
        return null;
    }
    async findPurchaseBySubscriptionId(subscriptionId: string): Promise<StripePurchaseDocument | null> {
        for (const [orderId, entry] of this.purchases) {
            if (entry.data["subscription"] === subscriptionId) {
                return { orderId, userId: entry.userId, data: entry.data };
            }
        }
        return null;
    }
    async savePurchase(
        orderId: string,
        update: StripeDocumentData,
        options: { userId?: string | undefined } = {},
    ): Promise<void> {
        const existing = this.purchases.get(orderId);
        const data = mergeDocumentData(existing?.data ?? {}, update);
        const userId = options.userId
            ?? (typeof data["user"] === "string" ? data["user"] : existing?.userId ?? null);
        this.purchases.set(orderId, { userId, data });
    }
}
