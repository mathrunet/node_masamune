import { Hono } from "hono";
import type { WorkersScheduledEvent } from "./cloudflare_workers_types";
import { ScheduleProcessWorkdersBase } from "./schedule_process_workders_base";
import { WorkersOptions } from "./workers_base";
import { fetchInternal, InternalTarget } from "./internal_request";
import { InternalAuthAdapter } from "../adapters/internal_auth_adapter";

/**
 * Default target of [RegionScheduleProcessWorkdersBase].
 *
 * Sends the job to this Worker itself through the `SELF` Service Binding.
 */
export const defaultRegionScheduleTarget: InternalTarget = { binding: "SELF" };

/**
 * Base class for scheduled jobs that run in the `fetch` handler of the region Worker.
 *
 * Cloudflare applies placement only to `fetch` handlers, not to `scheduled` handlers.
 * The `scheduled` handler forwards the event as a signed internal request, and the
 * receiving route at [path] calls [run] near the fixed-region backend.
 */
export abstract class RegionScheduleProcessWorkdersBase extends ScheduleProcessWorkdersBase {
    /**
     * Base class for scheduled jobs that run in the `fetch` handler of the region Worker.
     *
     * @param options
     * Worker options. Firebase authentication is not applied to the internal route.
     *
     * @param target
     * Destination of the internal request. Defaults to [defaultRegionScheduleTarget].
     */
    constructor(
        options: WorkersOptions = {},
        target: InternalTarget = defaultRegionScheduleTarget,
    ) {
        super(options);
        this.target = target;
    }

    /**
     * Destination of the internal request.
     */
    readonly target: InternalTarget;

    /**
     * Route path that receives the internal request (for example `/cron/cleanup`).
     */
    abstract path: string;

    /**
     * Specify the actual contents of the scheduled job. Runs in the `fetch` handler.
     */
    abstract run(
        event: WorkersScheduledEvent,
        env: unknown,
        ctx: ExecutionContext,
    ): Promise<void>;

    async process(
        event: WorkersScheduledEvent,
        env: unknown,
        _ctx: ExecutionContext,
    ): Promise<void> {
        const response = await fetchInternal(
            env,
            this.target,
            this.path,
            JSON.stringify({ cron: event.cron, scheduledTime: event.scheduledTime }),
        );
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`The region scheduled job at ${this.path} failed with status ${response.status}: ${text}`);
        }
    }

    build(_defaultOptions: WorkersOptions = {}): Hono {
        if (!this.path) {
            throw new Error("RegionScheduleProcessWorkdersBase requires a non-empty path.");
        }
        const hono = new Hono();
        hono.use("*", new InternalAuthAdapter({ secretEnv: this.target.secretEnv }).build());
        hono.post("/", async (context) => {
            const payload = await context.req.json() as Partial<WorkersScheduledEvent>;
            const event: WorkersScheduledEvent = {
                cron: typeof payload.cron === "string" ? payload.cron : "",
                scheduledTime: typeof payload.scheduledTime === "number" ? payload.scheduledTime : undefined,
            };
            await this.run(event, context.env, executionContextOf(context));
            return context.json({ success: true });
        });
        return hono;
    }
}

function executionContextOf(context: { executionCtx: ExecutionContext }): ExecutionContext {
    try {
        return context.executionCtx;
    } catch (_) {
        return {
            waitUntil: () => { },
            passThroughOnException: () => { },
        };
    }
}
