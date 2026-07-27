import {
    deploy,
    QueueProcessWorkdersBase,
    ScheduleProcessWorkdersBase,
    WorkersQueueExecutionContext,
    WorkersQueueMessageBatch,
    WorkersData,
} from "../src";
import { Hono } from "hono";

class TestQueueWorker extends QueueProcessWorkdersBase {
    constructor(
        private readonly handler: (
            batch: WorkersQueueMessageBatch,
            env: unknown,
            ctx: WorkersQueueExecutionContext,
        ) => Promise<void>,
    ) {
        super();
    }

    process(
        batch: WorkersQueueMessageBatch,
        env: unknown,
        ctx: WorkersQueueExecutionContext,
    ): Promise<void> {
        return this.handler(batch, env, ctx);
    }
}

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

const message = {
    id: "message-1",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    body: { value: "test" },
    attempts: 1,
    ack: jest.fn(),
    retry: jest.fn(),
};
const batch: WorkersQueueMessageBatch = {
    queue: "test-queue",
    messages: [message],
    ackAll: jest.fn(),
    retryAll: jest.fn(),
};
const env = { TEST: "value" };
const ctx: ExecutionContext = {
    waitUntil: jest.fn(),
    passThroughOnException: jest.fn(),
};

describe("QueueProcessWorkdersBase", () => {
    test("runs a queue worker from deploy queue handler", async () => {
        const handler = jest.fn().mockResolvedValue(undefined);
        const app = deploy([
            new TestQueueWorker(handler),
        ]);

        await app.queue?.(batch, env, ctx);

        expect(handler).toHaveBeenCalledWith(batch, env, ctx);
    });

    test("runs multiple queue workers in parallel", async () => {
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
            new TestQueueWorker(first),
            new TestQueueWorker(second),
        ]);

        await app.queue?.(batch, env, ctx);

        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
        expect(calls).toEqual(["first:start", "second", "first:end"]);
    });

    test("keeps request and scheduled workers available with queue workers", async () => {
        const queued = jest.fn().mockResolvedValue(undefined);
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
            new TestQueueWorker(queued),
        ]);
        const event: ScheduledEvent = { cron: "* * * * *" };

        const response = await app.request("http://localhost/test");
        await app.scheduled?.(event, env, ctx);
        await app.queue?.(batch, env, ctx);

        expect(response.status).toBe(200);
        expect(scheduled).toHaveBeenCalledWith(event, env, ctx);
        expect(queued).toHaveBeenCalledWith(batch, env, ctx);
    });
});
