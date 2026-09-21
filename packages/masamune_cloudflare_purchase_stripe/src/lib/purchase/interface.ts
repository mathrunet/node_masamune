/**
 * Free-form document data stored for Stripe users / payments / purchases.
 *
 * Mirrors the Firestore document model of
 * `@mathrunet/masamune_firebase_purchase_stripe`. Setting a key to `null` in an
 * update deletes the key (equivalent to `FieldValue.delete()`).
 *
 * Stripeのユーザー・支払い方法・購入情報として保存する自由形式のドキュメントデータ。
 *
 * `@mathrunet/masamune_firebase_purchase_stripe`のFirestoreドキュメントモデルを
 * 踏襲します。更新時にキーへ`null`を設定するとそのキーを削除します
 * （`FieldValue.delete()`相当）。
 */
export type StripeDocumentData = { [key: string]: any };

/**
 * Stored Stripe user (customer / connect account) document.
 *
 * 保存されたStripeユーザー（カスタマー / Connectアカウント）ドキュメント。
 */
export interface StripeUserDocument {
    /**
     * Application user ID.
     *
     * アプリケーションのユーザーID。
     */
    userId: string;

    /**
     * Document data (`customer`, `account`, `defaultPayment`, etc.).
     *
     * ドキュメントデータ（`customer`、`account`、`defaultPayment`など）。
     */
    data: StripeDocumentData;
}

/**
 * Stored Stripe payment method document.
 *
 * 保存されたStripe支払い方法ドキュメント。
 */
export interface StripePaymentDocument {
    /**
     * Application user ID.
     *
     * アプリケーションのユーザーID。
     */
    userId: string;

    /**
     * Stripe payment method ID.
     *
     * Stripeの支払い方法ID。
     */
    paymentId: string;

    /**
     * Document data (`type`, `brand`, `numberLast`, `default`, etc.).
     *
     * ドキュメントデータ（`type`、`brand`、`numberLast`、`default`など）。
     */
    data: StripeDocumentData;
}

/**
 * Stored Stripe purchase / subscription document.
 *
 * 保存されたStripe購入・サブスクリプションドキュメント。
 */
export interface StripePurchaseDocument {
    /**
     * Order ID (database key).
     *
     * 注文ID（データベースのキー）。
     */
    orderId: string;

    /**
     * Application user ID. May be `null` for subscription records created from
     * webhooks before the user is known.
     *
     * アプリケーションのユーザーID。ユーザーが未確定のWebhook起点の
     * サブスクリプションレコードでは`null`になることがあります。
     */
    userId: string | null;

    /**
     * Document data (`purchaseId`, `subscription`, `confirm`, `success`, etc.).
     *
     * ドキュメントデータ（`purchaseId`、`subscription`、`confirm`、`success`など）。
     */
    data: StripeDocumentData;
}

/**
 * Persistence boundary for Stripe purchase data.
 *
 * Replaces the Firestore paths (`PURCHASE_STRIPE_USERPATH` /
 * `PURCHASE_STRIPE_PAYMENTPATH` / `PURCHASE_STRIPE_PURCHASEPATH`) of the
 * Firebase implementation. All `save*` methods merge the update into the
 * existing document; keys set to `null` are removed.
 *
 * Stripe購入データの永続化境界。
 *
 * Firebase実装のFirestoreパス（`PURCHASE_STRIPE_USERPATH` /
 * `PURCHASE_STRIPE_PAYMENTPATH` / `PURCHASE_STRIPE_PURCHASEPATH`）を置き換えます。
 * すべての`save*`メソッドは既存ドキュメントへ更新をマージし、`null`が設定された
 * キーは削除されます。
 */
export interface StripePurchaseStore {
    /**
     * Get a user document by application user ID.
     *
     * アプリケーションのユーザーIDでユーザードキュメントを取得します。
     */
    getUser(userId: string): Promise<StripeUserDocument | null>;

    /**
     * Find a user document by Stripe customer ID.
     *
     * StripeのカスタマーIDでユーザードキュメントを検索します。
     */
    findUserByCustomerId(customerId: string): Promise<StripeUserDocument | null>;

    /**
     * Find a user document by Stripe connect account ID.
     *
     * StripeのConnectアカウントIDでユーザードキュメントを検索します。
     */
    findUserByAccountId(accountId: string): Promise<StripeUserDocument | null>;

    /**
     * Merge-save a user document.
     *
     * ユーザードキュメントをマージ保存します。
     */
    saveUser(userId: string, update: StripeDocumentData): Promise<void>;

    /**
     * List payment method documents of a user.
     *
     * ユーザーの支払い方法ドキュメントを一覧します。
     */
    listPayments(userId: string): Promise<StripePaymentDocument[]>;

    /**
     * Merge-save a payment method document.
     *
     * 支払い方法ドキュメントをマージ保存します。
     */
    savePayment(userId: string, paymentId: string, update: StripeDocumentData): Promise<void>;

    /**
     * Delete a payment method document.
     *
     * 支払い方法ドキュメントを削除します。
     */
    deletePayment(userId: string, paymentId: string): Promise<void>;

    /**
     * Get a purchase document by order ID. When `userId` is given the document
     * must belong to that user.
     *
     * 注文IDで購入ドキュメントを取得します。`userId`を指定した場合はその
     * ユーザーの所有ドキュメントに限定します。
     */
    getPurchase(orderId: string, userId?: string | undefined): Promise<StripePurchaseDocument | null>;

    /**
     * Find a purchase document by Stripe payment intent ID.
     *
     * StripeのPaymentIntent IDで購入ドキュメントを検索します。
     */
    findPurchaseByPurchaseId(purchaseId: string): Promise<StripePurchaseDocument | null>;

    /**
     * Find a purchase document by Stripe subscription ID.
     *
     * StripeのサブスクリプションIDで購入ドキュメントを検索します。
     */
    findPurchaseBySubscriptionId(subscriptionId: string): Promise<StripePurchaseDocument | null>;

    /**
     * Merge-save a purchase document.
     *
     * 購入ドキュメントをマージ保存します。
     */
    savePurchase(orderId: string, update: StripeDocumentData, options?: { userId?: string | undefined }): Promise<void>;
}

/**
 * Apply a merge update to document data. Keys set to `null` are removed
 * (equivalent to `FieldValue.delete()`), `undefined` keys are ignored.
 *
 * ドキュメントデータへマージ更新を適用します。`null`が設定されたキーは削除され
 * （`FieldValue.delete()`相当）、`undefined`のキーは無視されます。
 */
export function mergeDocumentData(
    current: StripeDocumentData,
    update: StripeDocumentData,
): StripeDocumentData {
    const merged: StripeDocumentData = { ...current };
    for (const key of Object.keys(update)) {
        const value = update[key];
        if (value === undefined) {
            continue;
        }
        if (value === null) {
            delete merged[key];
        } else {
            merged[key] = value;
        }
    }
    return merged;
}
