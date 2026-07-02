import { deploy, ScheduleProcessWorkdersBase, WorkersData } from "../src";
import { Hono } from "hono";

class TestScheduleWorker extends ScheduleProcessWorkdersBase {
    constructor(
        private readonly handler: (
            event: ScheduledEvent,
            env: unknown,
            ctx: ExecutionContext,
        ) => Promise<void>,
    ) {
        super();
    }

    process(
        event: ScheduledEvent,
        env: unknown,
        ctx: ExecutionContext,
    ): Promise<void> {
        return this.handler(event, env, ctx);
    }
}

const event: ScheduledEvent = { cron: "* * * * *" };
const env = { TEST: "value" };
const ctx: ExecutionContext = {
    waitUntil: jest.fn(),
    passThroughOnException: jest.fn(),
};

describe("ScheduleProcessWorkdersBase", () => {
    test("runs a scheduled worker from deploy scheduled handler", async () => {
        const handler = jest.fn().mockResolvedValue(undefined);
        const app = deploy([
            new TestScheduleWorker(handler),
        ]);

        await app.scheduled?.(event, env, ctx);

        expect(handler).toHaveBeenCalledWith(event, env, ctx);
    });

    test("runs multiple scheduled workers in parallel", async () => {
        const calls: string[] = [];
        let resolveFirst: (() => void) | undefined;
        const first = jest.fn().mockImplementation(async () => {
            calls.push("first:start");
            await new Promise<void>((resolve) => {
                resolveFirst = resolve;
            });
            calls.push("first:end");
        });
        const second = jest.fn().mockImplementation(async () => {
            calls.push("second");
            resolveFirst?.();
        });
        const app = deploy([
            new TestScheduleWorker(first),
            new TestScheduleWorker(second),
        ]);

        await app.scheduled?.(event, env, ctx);

        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
        expect(calls).toEqual(["first:start", "second", "first:end"]);
    });

    test("keeps request workers available with scheduled workers", async () => {
        const scheduled = jest.fn().mockResolvedValue(undefined);
        const requestWorker = new WorkersData({
            path: "/test",
            func: (hono: Hono) => {
                hono.get("/", async (context) => {
                    return context.json({ message: "Hello, World!" });
                });
                return hono;
            },
        });
        const app = deploy([
            requestWorker,
            new TestScheduleWorker(scheduled),
        ]);

        const response = await app.request("http://localhost/test");
        const body = await response.json() as { message: string };
        await app.scheduled?.(event, env, ctx);

        expect(response.status).toBe(200);
        expect(body.message).toBe("Hello, World!");
        expect(scheduled).toHaveBeenCalledWith(event, env, ctx);
    });
});
