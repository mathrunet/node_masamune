import { HttpError } from "@mathrunet/masamune_cloudflare";
import { verifyJwsWithX5c } from "./jws";
import { VerifyIOSRequest, VerifyIOSResponse, VerifyIOSStoreKit2Request } from "./interface";

/**
 * Perform IOS receipt verification.
 *
 * IOSの受信確認を実行します。
 *
 * @param {String} receiptData
 * Receipt data for purchases (for StoreKit1) or JWT token (for StoreKit2).
 *
 * 購入の際のレシートデータ（StoreKit1の場合）またはJWTトークン（StoreKit2の場合）。
 *
 * @param {String} password
 * SharedSecret for AppStore (for StoreKit1), obtained from [Apps]->[App Info]->[Shared Secret for App] in the AppStore.
 * For StoreKit2, this can be an empty string.
 *
 * AppStoreのSharedSecret（StoreKit1の場合）。AppStoreの[アプリ]->[App情報]->[App用共有シークレット]から取得します。
 * StoreKit2の場合は空文字列を渡すことができます。
 *
 * @param {Number} storeKitVersion
 * StoreKit version (1 or 2). Defaults to 1.
 *
 * StoreKitのバージョン（1または2）。デフォルトは1。
 *
 * @param {String} transactionId
 * Transaction ID (required for StoreKit2).
 *
 * トランザクションID（StoreKit2の場合は必須）。
 *
 * @return {Promise<{ [key: string]: any; }}
 * Receipt information for the item.
 *
 * アイテムの受領情報。
 */
export async function verifyIOS(request: VerifyIOSRequest): Promise<VerifyIOSResponse> {
    if (request.storeKitVersion === 2) {
        console.log(`StoreKitVersion2: ${request.receiptData} ${request.transactionId}`);
        if (!request.transactionId) {
            throw new HttpError(400, "Transaction ID is required for StoreKit2 verification.");
        }
        return await verifyIOSStoreKit2({ jwtToken: request.receiptData, transactionId: request.transactionId });
    }
    console.log(`StoreKitVersion1: ${request.receiptData}`);
    if (!request.password) {
        throw new HttpError(400, "Password is required for StoreKit1 verification.");
    }
    let json = await requestVerifyReceipt("https://buy.itunes.apple.com/verifyReceipt", request);
    let status = json["status"];
    if (status === 21007 || status === 21008) {
        json = await requestVerifyReceipt("https://sandbox.itunes.apple.com/verifyReceipt", request);
        status = json["status"];
        if (status !== 0) {
            throw new HttpError(404, "Illegal receipt.");
        }
    } else {
        if (status !== 0) {
            throw new HttpError(404, "Illegal receipt.");
        }
    }
    return json as VerifyIOSResponse;
}

async function requestVerifyReceipt(
    endpoint: string,
    request: VerifyIOSRequest,
): Promise<{ [key: string]: any }> {
    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify({
            "receipt-data": request.receiptData,
            "password": request.password,
            "exclude-old-transactions": true,
        }),
    });
    if (!res.ok) {
        throw new HttpError(404, "The validation data is empty.");
    }
    return (await res.json()) as { [key: string]: any };
}

/**
 * Verify iOS StoreKit2 transaction.
 *
 * iOS StoreKit2のトランザクションを検証します。
 *
 * @param {String} jwtToken
 * JWT token from StoreKit2.
 *
 * StoreKit2からのJWTトークン。
 *
 * @return {Promise<{ [key: string]: any; }}
 * Transaction information.
 *
 * トランザクション情報。
 */
async function verifyIOSStoreKit2(request: VerifyIOSStoreKit2Request): Promise<VerifyIOSResponse> {
    if (!request.jwtToken) {
        throw new HttpError(400, "JWT token is required for StoreKit2 verification.");
    }

    try {
        const { payload: verifiedPayload } = await verifyJwsWithX5c(request.jwtToken);

        if (request.transactionId && verifiedPayload.transactionId !== request.transactionId) {
            throw new HttpError(403, "Transaction ID mismatch.");
        }

        const result: VerifyIOSResponse = {
            status: 0,
            environment: verifiedPayload.environment || "Production",
            receipt: {
                bundle_id: verifiedPayload.bundleId,
                application_version: verifiedPayload.appVersion,
                in_app: [{
                    quantity: verifiedPayload.quantity?.toString() || "1",
                    product_id: verifiedPayload.productId,
                    transaction_id: verifiedPayload.transactionId,
                    original_transaction_id: verifiedPayload.originalTransactionId,
                    purchase_date_ms: verifiedPayload.purchaseDate?.toString(),
                    original_purchase_date_ms: verifiedPayload.originalPurchaseDate?.toString(),
                    expires_date_ms: verifiedPayload.expiresDate?.toString(),
                    web_order_line_item_id: verifiedPayload.webOrderLineItemId,
                    is_trial_period: verifiedPayload.isTrialPeriod || "false",
                    is_in_intro_offer_period: verifiedPayload.isInIntroOfferPeriod || "false",
                }],
            },
            latest_receipt_info: [{
                quantity: verifiedPayload.quantity?.toString() || "1",
                product_id: verifiedPayload.productId,
                transaction_id: verifiedPayload.transactionId,
                original_transaction_id: verifiedPayload.originalTransactionId,
                purchase_date_ms: verifiedPayload.purchaseDate?.toString(),
                original_purchase_date_ms: verifiedPayload.originalPurchaseDate?.toString(),
                expires_date_ms: verifiedPayload.expiresDate?.toString(),
                web_order_line_item_id: verifiedPayload.webOrderLineItemId,
                is_trial_period: verifiedPayload.isTrialPeriod || "false",
                is_in_intro_offer_period: verifiedPayload.isInIntroOfferPeriod || "false",
            }],
            pending_renewal_info: [],
            decoded_payload: verifiedPayload,
        };

        console.log("StoreKit2 verification successful:", result);
        return result;
    } catch (error) {
        console.error("StoreKit2 verification error:", error);
        if (error instanceof HttpError) {
            throw error;
        }
        throw new HttpError(500, "Failed to verify StoreKit2 transaction.");
    }
}
