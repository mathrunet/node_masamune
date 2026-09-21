import { StripeUsageBuffer, StripeUsageBufferState, StripeUsageEventStore } from "./interface";
import { flushStripeMeter } from "./flush_meter";
import { StripeMeterClient } from "./stripe_meter_client";

/**
 * Record a usage event and flush to Stripe when the buffer is full or aged.
 *
 * The store (e.g. D1) is the source of truth. The buffer (e.g. KV) only decides
 * flush timing — eventual-consistency races there never affect billing.
 * When a flush fails the buffer is kept so the next request retries immediately;
 * unsent units remain pending in the store and are sent together next time.
 *
 * 使用量イベントを記録し、バッファが満杯または時間経過でStripeへフラッシュします。
 *
 * 正本はストア（例: D1）。バッファ（例: KV）はフラッシュタイミングの判定のみで、
 * 結果整合の競合があっても課金には影響しません。フラッシュ失敗時はバッファを残して
 * 次のリクエストで即再送させます。未送信分はストアに残り、次回まとめて送られます。
 */
export async function recordUsage(options: {
    store: StripeUsageEventStore,
    buffer: StripeUsageBuffer,
    client: StripeMeterClient,
    customerKey: string,
    stripeCustomerId: string | null | undefined,
    endpoint: string,
    units?: number | undefined,
    source?: string | undefined,
    flushUnits?: number | undefined,
    flushMs?: number | undefined,
    bufferTtlSeconds?: number | undefined,
}): Promise<void> {
    const units = options.units ?? 1;
    const flushUnits = options.flushUnits ?? 10;
    const flushMs = options.flushMs ?? 60_000;
    const bufferTtlSeconds = options.bufferTtlSeconds ?? 3600;

    try {
        await options.store.insert({
            id: crypto.randomUUID(),
            customerKey: options.customerKey,
            endpoint: options.endpoint,
            units: units,
            source: options.source ?? null,
            createdAt: Date.now(),
        });
    } catch (error) {
        console.warn("usage insert failed", error);
        return;
    }

    let buffer: StripeUsageBufferState = { units: 0, since: Date.now() };
    try {
        const stored = await options.buffer.get(options.customerKey);
        if (stored && typeof stored === "object") {
            buffer = stored;
        }
    } catch {
        // ignore corrupt buffer
    }
    buffer.units += units;
    const aged = Date.now() - buffer.since >= flushMs;
    const full = buffer.units >= flushUnits;
    await options.buffer.put(options.customerKey, buffer, bufferTtlSeconds);

    if (!full && !aged) {
        return;
    }
    let flushed = false;
    try {
        flushed = await flushStripeMeter({
            store: options.store,
            client: options.client,
            customerKey: options.customerKey,
            stripeCustomerId: options.stripeCustomerId,
        });
    } catch (error) {
        console.warn("stripe meter flush error", error);
    }
    if (!flushed) {
        return;
    }
    await options.buffer.put(
        options.customerKey,
        { units: 0, since: Date.now() },
        bufferTtlSeconds,
    );
}
