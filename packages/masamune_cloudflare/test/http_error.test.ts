import { Hono } from "hono";
import { HttpError, jsonError, resolveConfig } from "../src/lib/src/http_error";

describe("http_error", () => {
    test("jsonError converts HttpError to a JSON response with its status", async () => {
        const app = new Hono();
        app.get("/", (context) => jsonError(context, new HttpError(400, "Bad request.")));
        const response = await app.request("http://localhost/");
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Bad request." });
    });

    test("jsonError converts unknown errors to a 500 response", async () => {
        const app = new Hono();
        app.get("/", (context) => jsonError(context, new Error("Unexpected.")));
        const response = await app.request("http://localhost/");
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Unexpected." });
    });

    test("resolveConfig prefers the option value over context.env", async () => {
        const app = new Hono();
        app.get("/", (context) => {
            return context.json({
                fromOption: resolveConfig(context, "option-value", "TEST_KEY"),
                fromEnv: resolveConfig(context, undefined, "TEST_KEY"),
                missing: resolveConfig(context, undefined, "MISSING_KEY") ?? null,
            });
        });
        const response = await app.request("http://localhost/", {}, {
            TEST_KEY: "env-value",
        });
        expect(await response.json()).toEqual({
            fromOption: "option-value",
            fromEnv: "env-value",
            missing: null,
        });
    });
});
