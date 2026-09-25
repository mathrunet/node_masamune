import Stripe from "stripe";

/**
 * Stripe API version used across this package (parity with
 * `@mathrunet/masamune_cloudflare_purchase_stripe`).
 *
 * このパッケージ全体で使用するStripe APIバージョン
 * （`@mathrunet/masamune_cloudflare_purchase_stripe`と同一）。
 */
export const STRIPE_API_VERSION = "2026-08-26.dahlia";

/**
 * Create a Stripe SDK client pinned to [STRIPE_API_VERSION].
 *
 * [STRIPE_API_VERSION]に固定したStripe SDKクライアントを作成します。
 */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}

/**
 * Loosely typed Stripe object.
 *
 * Webhook payloads are rendered with the API version of the webhook endpoint,
 * not the version pinned by the SDK, so they may contain legacy fields.
 *
 * 緩く型付けされたStripeオブジェクト。
 *
 * WebhookペイロードはSDKで固定したバージョンではなくWebhookエンドポイントの
 * APIバージョンで生成されるため、旧フィールドを含む場合があります。
 */
export type StripeLooseObject = { [key: string]: any };

/**
 * Subscription fields stored in the purchase document.
 *
 * The field names are kept identical to the ones stored before the
 * `2025-03-31.basil` migration so that downstream data stays compatible.
 *
 * 購入ドキュメントに保存するサブスクリプションのフィールド。
 *
 * 下流のデータ互換性を保つため、`2025-03-31.basil`移行前と同じフィールド名を
 * 使用します。
 */
export interface StripeSubscriptionPurchaseFields {
  /**
         * Start of the current period (UNIX seconds). Earliest value across items.
         *
         * 現在の請求期間の開始（UNIX秒）。アイテム間で最も早い値。
         */
  current_period_start: number | null;

  /**
         * End of the current period (UNIX seconds). Latest value across items.
         *
         * 現在の請求期間の終了（UNIX秒）。アイテム間で最も遅い値。
         */
  current_period_end: number | null;

  /**
         * Price ID of the first subscription item.
         *
         * 最初のサブスクリプションアイテムの価格ID。
         */
  price_id: string | null;

  /**
         * Whether the price of the first item is active.
         *
         * 最初のアイテムの価格が有効かどうか。
         */
  active: boolean | null;

  /**
         * Unit amount of the price of the first item.
         *
         * 最初のアイテムの価格の単価。
         */
  amount: number | null;

  /**
         * Billing scheme of the price of the first item.
         *
         * 最初のアイテムの価格の請求方式。
         */
  billing_scheme: string | null;

  /**
         * Recurring interval of the price of the first item.
         *
         * 最初のアイテムの価格の請求間隔。
         */
  interval: string | null;

  /**
         * Recurring interval count of the price of the first item.
         *
         * 最初のアイテムの価格の請求間隔数。
         */
  interval_count: number | null;

  /**
         * Usage type of the price of the first item.
         *
         * 最初のアイテムの価格の使用タイプ。
         */
  usage_type: string | null;

  /**
         * Quantity of the first item.
         *
         * 最初のアイテムの数量。
         */
  quantity: number | null;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

/**
 * Resolve the current billing period of a subscription.
 *
 * Since `2025-03-31.basil` the period lives on each subscription item
 * (`items.data[].current_period_*`). The earliest start and the latest end
 * across items are returned. Falls back to the legacy top-level fields for
 * payloads rendered with older API versions. Returns `null` instead of an
 * invalid value when the period is unavailable.
 *
 * サブスクリプションの現在の請求期間を解決します。
 *
 * `2025-03-31.basil`以降、期間は各サブスクリプションアイテム
 * （`items.data[].current_period_*`）に移動しました。アイテム間で最も早い開始と
 * 最も遅い終了を返します。旧APIバージョンのペイロードでは従来のトップレベル
 * フィールドにフォールバックします。期間が取得できない場合は不正値ではなく
 * `null`を返します。
 */
export function resolveSubscriptionPeriod(
  subscription: Stripe.Subscription | StripeLooseObject,
): { start: number | null, end: number | null } {
  const source = subscription as StripeLooseObject;
  const items: StripeLooseObject[] = Array.isArray(source?.["items"]?.["data"])
    ? source["items"]["data"]
    : [];
  const starts = items
    .map((item) => toFiniteNumber(item?.["current_period_start"]))
    .filter((value): value is number => value !== null);
  const ends = items
    .map((item) => toFiniteNumber(item?.["current_period_end"]))
    .filter((value): value is number => value !== null);
  return {
    start: starts.length > 0
      ? Math.min(...starts)
      : toFiniteNumber(source?.["current_period_start"]),
    end: ends.length > 0
      ? Math.max(...ends)
      : toFiniteNumber(source?.["current_period_end"]),
  };
}

/**
 * Build the subscription fields stored in the purchase document.
 *
 * Reads the price from the first subscription item (`items.data[0].price`)
 * instead of the legacy `subscription.plan`, falling back to
 * `items.data[0].plan` and `subscription.plan` for older payloads.
 *
 * 購入ドキュメントに保存するサブスクリプションのフィールドを構築します。
 *
 * 従来の`subscription.plan`ではなく最初のサブスクリプションアイテムの価格
 * （`items.data[0].price`）を参照し、旧ペイロードでは`items.data[0].plan`と
 * `subscription.plan`にフォールバックします。
 */
export function resolveSubscriptionPurchaseFields(
  subscription: Stripe.Subscription | StripeLooseObject,
): StripeSubscriptionPurchaseFields {
  const source = subscription as StripeLooseObject;
  const period = resolveSubscriptionPeriod(source);
  const item: StripeLooseObject = (Array.isArray(source?.["items"]?.["data"])
    ? source["items"]["data"][0]
    : undefined) ?? {};
  const price: StripeLooseObject = item["price"] && typeof item["price"] === "object"
    ? item["price"]
    : {};
  const plan: StripeLooseObject = (item["plan"] && typeof item["plan"] === "object"
    ? item["plan"]
    : undefined) ?? (source?.["plan"] && typeof source["plan"] === "object"
    ? source["plan"]
    : undefined) ?? {};
  const recurring: StripeLooseObject = price["recurring"] ?? {};
  return {
    current_period_start: period.start,
    current_period_end: period.end,
    price_id: firstDefined<string>(price["id"], plan["id"]),
    active: firstDefined<boolean>(price["active"], plan["active"]),
    amount: firstDefined<number>(price["unit_amount"], plan["amount"]),
    billing_scheme: firstDefined<string>(price["billing_scheme"], plan["billing_scheme"]),
    interval: firstDefined<string>(recurring["interval"], plan["interval"]),
    interval_count: firstDefined<number>(recurring["interval_count"], plan["interval_count"]),
    usage_type: firstDefined<string>(recurring["usage_type"], plan["usage_type"]),
    quantity: firstDefined<number>(item["quantity"], source?.["quantity"]),
  };
}

/**
 * Receipt information of a PaymentIntent.
 *
 * PaymentIntentの領収書情報。
 */
export interface StripePaymentIntentReceipt {
  /**
         * Receipt URL of the latest charge.
         *
         * 最新のチャージの領収書URL。
         */
  receiptUrl: string | null;

  /**
         * Captured amount of the latest charge.
         *
         * 最新のチャージのキャプチャ済み金額。
         */
  capturedAmount: number | null;
}

/**
 * Resolve the receipt URL and captured amount of a PaymentIntent.
 *
 * `PaymentIntent.charges` was removed in `2022-11-15`; the charge is now
 * referenced by `latest_charge` (an ID in webhook payloads). An expanded
 * charge is used as is, otherwise the charge is retrieved. The legacy
 * `charges.data[0]` is used as a fallback for older payloads. Retrieval errors
 * are logged and result in `null` values so the caller can still proceed.
 *
 * PaymentIntentの領収書URLとキャプチャ済み金額を解決します。
 *
 * `PaymentIntent.charges`は`2022-11-15`で削除され、チャージは`latest_charge`
 * （WebhookペイロードではID）で参照されます。展開済みのチャージはそのまま使い、
 * それ以外はチャージを取得します。旧ペイロードでは従来の`charges.data[0]`に
 * フォールバックします。取得エラーはログに出力し`null`を返すため、呼び出し側は
 * 処理を続行できます。
 */
export async function resolvePaymentIntentReceipt(options: {
  stripeClient: Stripe,
  paymentIntent: Stripe.PaymentIntent | StripeLooseObject,
}): Promise<StripePaymentIntentReceipt> {
  const source = options.paymentIntent as StripeLooseObject;
  const latestCharge = source?.["latest_charge"];
  let charge: StripeLooseObject | null = null;
  if (latestCharge && typeof latestCharge === "object") {
    charge = latestCharge;
  } else if (typeof latestCharge === "string" && latestCharge.length > 0) {
    try {
      charge = await options.stripeClient.charges.retrieve(latestCharge) as unknown as StripeLooseObject;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("stripe latest_charge retrieve failed", message.slice(0, 240));
    }
  }
  if (!charge) {
    const legacy = source?.["charges"]?.["data"];
    if (Array.isArray(legacy) && legacy.length > 0 && legacy[0]) {
      charge = legacy[0];
    }
  }
  const receiptUrl = charge?.["receipt_url"];
  const capturedAmount = charge?.["amount_captured"];
  return {
    receiptUrl: typeof receiptUrl === "string" && receiptUrl.length > 0 ? receiptUrl : null,
    capturedAmount: toFiniteNumber(capturedAmount),
  };
}
