import type { WorkersScheduledEvent as ScheduledEvent } from "../src/lib/src/cloudflare_workers_types";
import {
    deploy,
    InternalTarget,
    masamuneInternalSecretEnv,
    RegionScheduleProcessWorkdersBase,
    signInternalRequest,
    verifyInternalRequest,
} from "../src";

class TestRegionScheduleWorker extends RegionScheduleProcessWorkdersBase {
    constructor(
        private readonly handler: (
            event: ScheduledEvent,
            env: unknown,
            ctx: ExecutionContext,
        ) => Promise<void>,
        target?: InternalTarget,
        path: string = "/cron/test",
    ) {
        super({}, target);
        this.path = path;
    }

    path: string;

    run(
        event: ScheduledEvent,
        env: unknown,
        ctx: ExecutionContext,
    ): Promise<void> {
        return this.handler(event, env, ctx);
    }
}

const secret = "test-secret";
const event: ScheduledEvent = { cron: "*/5 * * * *", scheduledTime: 1700000000000 };
const ctx: ExecutionContext = {
    waitUntil: jest.fn(),
    passThroughOnException: jest.fn(),
};

describe("RegionScheduleProcessWorkdersBase", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("registers both the scheduled handler and the internal route", async () => {
        const handler = jest.fn().mockResolvedValue(undefined);
        const app = deploy([new TestRegionScheduleWorker(handler)]);

        expect(app.scheduled).toBeDefined();
        const response = await app.request(
            "https://internal/cron/test",
            { method: "POST", body: "{}" },
            { [masamuneInternalSecretEnv]: secret },
        );
        expect(response.status).toBe(401);
    });

    test("scheduled handler sends a signed POST through env.SELF.fetch and runs the job", async () => {
        const handler = jest.fn().mockResolvedValue(undefined);
        const app = deploy([new TestRegionScheduleWorker(handler)]);
        const requests: Request[] = [];
        const env: { [key: string]: any } = {
            [masamuneInternalSecretEnv]: secret,
        };
        env.SELF = {
            fetch: jest.fn(async (request: Request) => {
                requests.push(request.clone());
                return await app.request(request, undefined, env);
            }),
        };

        await app.scheduled?.(event, env, ctx);

        expect(env.SELF.fetch).toHaveBeenCalledTimes(1);
        const request = requests[0];
        expect(request.method).toBe("POST");
        expect(new URL(request.url).pathname).toBe("/cron/test");
        await expect(verifyInternalRequest(request, secret)).resolves.toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0]).toEqual(event);
        expect(handler.mock.calls[0][1]).toBe(env);
    });

    test("receiving route rejects an unsigned request and runs the job for a signed one", async () => {
        const handler = jest.fn().mockResolvedValue(undefined);
        const app = deploy([new TestRegionScheduleWorker(handler)]);
        const env = { [masamuneInternalSecretEnv]: secret };
        const body = JSON.stringify(event);

        const unauthorized = await app.request(
            "https://internal/cron/test",
            { method: "POST", body },
            env,
        );
        const authorized = await app.request(
            "https://internal/cron/test",
            {
                method: "POST",
                body,
                headers: await signInternalRequest(secret, "POST", "/cron/test", body),
            },
            env,
        );
        const result = await authorized.json() as { success: boolean };

        expect(unauthorized.status).toBe(401);
        expect(authorized.status).toBe(200);
        expect(result.success).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0]).toEqual(event);
    });

    test("scheduled handler rejects when the internal request fails", async () => {
        const handler = jest.fn().mockResolvedValue(undefined);
        const app = deploy([new TestRegionScheduleWorker(handler)]);
        const env = {
            [masamuneInternalSecretEnv]: secret,
            SELF: {
                fetch: jest.fn().mockResolvedValue(new Response("error", { status: 500 })),
            },
        };

        await expect(app.scheduled?.(event, env, ctx)).rejects.toThrow("500");
        expect(handler).not.toHaveBeenCalled();
    });

    test("scheduled handler rejects when the secret is not configured", async () => {
        const app = deploy([new TestRegionScheduleWorker(jest.fn())]);
        const env = { SELF: { fetch: jest.fn() } };

        await expect(app.scheduled?.(event, env, ctx)).rejects.toThrow(masamuneInternalSecretEnv);
        expect(env.SELF.fetch).not.toHaveBeenCalled();
    });

    test("url target sends the request with the global fetch", async () => {
        const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ success: true }), { status: 200 }),
        );
        const app = deploy([
            new TestRegionScheduleWorker(jest.fn(), { url: "https://region.example.com/" }),
        ]);

        await app.scheduled?.(event, { [masamuneInternalSecretEnv]: secret }, ctx);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://region.example.com/cron/test");
        expect(init.method).toBe("POST");
        const request = new Request(url, init);
        await expect(verifyInternalRequest(request, secret)).resolves.toBe(true);
    });

    test("build throws when the path is empty", () => {
        expect(() => deploy([new TestRegionScheduleWorker(jest.fn(), undefined, "")])).toThrow("path");
    });
});
