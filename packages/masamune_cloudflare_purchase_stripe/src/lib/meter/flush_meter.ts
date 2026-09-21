import { StripeUsageEventStore } from "./interface";
import { StripeMeterClient } from "./stripe_meter_client";

/**
 * Flush pending usage events for one customer to the Stripe Meter Event API.
 *
 * Returns `true` when there was nothing to send or the flush succeeded, and
 * `false` when Stripe rejected the batch (events stay pending for a retry).
 *
 * 顧客1件分の未送信使用量イベントをStripe Meter Event APIへフラッシュします。
 *
 * 送信対象がない、または送信に成功した場合は`true`、Stripeがバッチを拒否した
 * 場合は`false`を返します（イベントは未送信のまま残り、次回再送されます）。
 */
export async function flushStripeMeter(options: {
    store: StripeUsageEventStore,
    client: StripeMeterClient,
    customerKey: string,
    stripeCustomerId: string | null | undefined,
}): Promise<boolean> {
    if (!options.client.enabled || !options.stripeCustomerId) {
        return true;
    }

    const rows = await options.store.listPending(options.customerKey);
    const total = rows.reduce((sum, row) => sum + row.units, 0);
    if (total <= 0) {
        return true;
    }

    // 時間窓ベースだと同一窓内の別バッチが Stripe の冪等性で捨てられ過小計上になる。
    // 送信成功後に flushed を確定するため、identifier はバッチごとに一意でよい。
    const identifier = `${options.customerKey}:${crypto.randomUUID()}`;
    const sent = await options.client.sendMeterEvent({
        stripeCustomerId: options.stripeCustomerId,
        value: total,
        identifier: identifier,
    });
    if (!sent) {
        return false;
    }

    await options.store.markFlushed(rows.map((row) => row.id));
    return true;
}
