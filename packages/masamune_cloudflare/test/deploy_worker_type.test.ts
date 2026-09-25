import { Hono } from "hono";
import { deploy, WorkersDeployType } from "../src";
import { NoneAuthAdapter } from "../src/lib/adapters/none_auth_adapter";
import { WorkersData } from "../src/lib/src/workers_data";

function createWorker() {
    return new WorkersData({
        path: "/test",
        func: (hono: Hono) => {
            hono.get("/", async (context) => context.json({ ok: true }));
            hono.get("/denied", async (context) => context.json({ error: "denied" }, 403));
            return hono;
        },
    });
}

describe("deploy worker type", () => {
    test.each(["edge", "region"] as WorkersDeployType[])("adds x-masamune-worker: %s", async (type) => {
        const app = deploy([createWorker()], { auth: new NoneAuthAdapter(), type });
        const response = await app.request("/test");
        expect(response.status).toBe(200);
        expect(response.headers.get("x-masamune-worker")).toBe(type);
    });

    test("adds the header to error and unmatched responses", async () => {
        const app = deploy([createWorker()], { auth: new NoneAuthAdapter(), type: "region" });
        const denied = await app.request("/test/denied");
        expect(denied.status).toBe(403);
        expect(denied.headers.get("x-masamune-worker")).toBe("region");
        const missing = await app.request("/missing");
        expect(missing.status).toBe(404);
        expect(missing.headers.get("x-masamune-worker")).toBe("region");
    });

    test("does not add the header without type", async () => {
        const app = deploy([createWorker()], { auth: new NoneAuthAdapter() });
        const response = await app.request("/test");
        expect(response.headers.get("x-masamune-worker")).toBeNull();
    });

    test("rejects an unknown type", () => {
        expect(() => deploy([createWorker()], { type: "global" as WorkersDeployType })).toThrow("Invalid Worker type");
    });
});
