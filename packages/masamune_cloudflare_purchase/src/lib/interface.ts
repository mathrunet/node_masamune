/**
 * Update subscription request interface.
 * 
 * サブスクリプションのアップデートリクエストインターフェース。
 */
export interface UpdateSubscriptionRequest {
    targetCollectionPath: string;
    targetDocumentId: string;
    data: { [key: string]: any };
    additionalData: { [key: string]: any };
    userId: string;
    platform: string;
    orderId: string;
    productId: string;
    purchaseId: string;
    packageName: string;
    token: string;
    expiryDate: number;
    firestoreInstance: FirebaseFirestore.Firestore;
}

/**
 * Update subscription data interface.
 * 
 * サブスクリプションのアップデートデータインターフェース。
 */
export interface UpdateSubscriptionData {
    expired: boolean;
    paused: boolean;
    token: string;
    platform: string;
    productId: string;
    purchaseId: string;
    packageName: string;
    expiredTime: number;
    orderId: string;
    userId?: string;
    "@time": Date;
    "@uid": string;
    [key: string]: any;
}

/**
 * Update unlock request interface.
 * 
 * アンロックのアップデートリクエストインターフェース。
 */
export interface UpdateUnlockRequest {
    targetDocumentFieldPath: string;
    transactionId: string;
    transactionData: { [key: string]: any };
    firestoreInstance: FirebaseFirestore.Firestore;
}

/**
 * Update unlock data interface.
 * 
 * アンロックのアップデートデータインターフェース。
 */
export interface UpdateUnlockData {
    "@time": Date;
    "@uid": string;
    [key: string]: any;
}

/**
 * Update wallet request interface.
 * 
 * ウォレットのアップデートリクエストインターフェース。
 */
export interface UpdateWalletRequest {
    targetDocumentFieldPath: string;
    value: number;
    transactionId: string;
    transactionData: { [key: string]: any };
    firestoreInstance: FirebaseFirestore.Firestore;
}

/**
 * Update wallet data interface.
 * 
 * ウォレットのアップデートデータインターフェース。
 */
export interface UpdateWalletData {
    "@time": Date;
    "@uid": string;
    [key: string]: any;
}

/**
 * Verify android request interface.
 * 
 * Androidの検証リクエストインターフェース。
 */
export interface VerifyAndroidRequest {
    type: "products" | "subscriptions";
    serviceAccountEmail: string;
    serviceAccountPrivateKey: string;
    packageName: string;
    productId: string;
    purchaseToken: string;
}

/**
 * Verify android response interface.
 * 
 * Androidの検証レスポンスインターフェース。
 */
export interface VerifyAndroidResponse {
    purchaseState?: number | undefined | null;
    orderId: string | undefined | null;
    startTimeMillis?: string | undefined | null;
    expiryTimeMillis?: string | undefined | null;
    linkedPurchaseToken?: string | undefined | null;
    [key: string]: any;
}

/**
 * Verify ios request interface.
 * 
 * IOSの検証リクエストインターフェース。
 */
export interface VerifyIOSRequest {
    receiptData: string;
    password?: string | null | undefined;
    storeKitVersion?: number;
    transactionId?: string | null | undefined;
}

/**
 * Verify ios store kit 2 request interface.
 * 
 * IOSのStoreKit2の検証リクエストインターフェース。
 */
export interface VerifyIOSStoreKit2Request {
    jwtToken: string;
    transactionId?: string;
}

/**
 * Verify ios store kit 2 response interface.
 * 
 * IOSのStoreKit2の検証レスポンスインターフェース。
 */
export interface VerifyIOSResponse {
    status?: number;
    environment?: string;
    receipt?: {
        bundle_id?: string;
        application_version?: string;
        in_app?: [{
            quantity?: string;
            expired?: boolean
            product_id?: string;
            transaction_id?: string;
            original_transaction_id?: string;
            purchase_date_ms?: string;
            original_purchase_date_ms?: string;
            expires_date_ms?: string;
            web_order_line_item_id?: string;
            is_trial_period?: string;
            is_in_intro_offer_period?: string;
        }]
    },
    latest_receipt_info?: [{
        quantity?: string;
        expired?: boolean
        product_id?: string;
        transaction_id?: string;
        original_transaction_id?: string;
        purchase_date_ms?: string;
        original_purchase_date_ms?: string;
        expires_date_ms?: string;
        web_order_line_item_id?: string;
        is_trial_period?: string;
        is_in_intro_offer_period?: string;
    }],
    pending_renewal_info: [],
    decoded_payload?: { [key: string]: any };
    [key: string]: any;
}

/**
 * IOS transaction info interface.
 * 
 * IOSのトランザクション情報インターフェース。
 */
export interface IOSTransactionInfo {
    productId: string;
    transactionId: string;
    originalTransactionId: string;
    purchaseDate: string;
    originalPurchaseDate: string;
    expiresDate: string;
    webOrderLineItemId: string;
    isTrialPeriod: boolean;
    isInIntroOfferPeriod: boolean;
    [key: string]: any;
}
