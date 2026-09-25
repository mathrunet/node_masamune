import { Hono } from "hono";
import {
    InternalAuthAdapter,
    masamuneInternalSecretEnv,
    signInternalRequest,
    verifyInternalRequest,
} from "../src";

const secret = "test-secret";

async function signedRequest({
    method = "POST",
    signedMethod = method,
    path = "/internal",
    signedPath = path,
    body = "{\"a\":1}",
    signedBody = body,
    timestamp,
    signSecret = secret,
}: {
    method?: string;
    signedMethod?: string;
    path?: string;
    signedPath?: string;
    body?: string;
    signedBody?: string;
    timestamp?: number;
    signSecret?: string;
} = {}): Promise<Request> {
    const headers = await signInternalRequest(signSecret, signedMethod, signedPath, signedBody, timestamp);
    return new Request(`https://internal${path}`, {
        method,
        headers,
        body: method === "GET" ? undefined : body,
    });
}

describe("internal request signing", () => {
    test("verifies a signed request", async () => {
        const request = await signedRequest();

        await expect(verifyInternalRequest(request, secret)).resolves.toBe(true);
        await expect(request.text()).resolves.toBe("{\"a\":1}");
    });

    test("rejects a tampered body", async () => {
        const request = await signedRequest({ signedBody: "{\"a\":2}" });

        await expect(verifyInternalRequest(request, secret)).resolves.toBe(false);
    });

    test("rejects a tampered path", async () => {
        const request = await signedRequest({ signedPath: "/other" });

        await expect(verifyInternalRequest(request, secret)).resolves.toBe(false);
    });

    test("rejects a tampered method", async () => {
        const request = await signedRequest({ method: "PUT", signedMethod: "POST" });

        await expect(verifyInternalRequest(request, secret)).resolves.toBe(false);
    });

    test("rejects a request outside the allowed clock skew", async () => {
        const request = await signedRequest({
            timestamp: Math.floor(Date.now() / 1000) - 301,
        });

        await expect(verifyInternalRequest(request, secret)).resolves.toBe(false);
        await expect(verifyInternalRequest(await signedRequest({
            timestamp: Math.floor(Date.now() / 1000) - 301,
        }), secret, { maxSkewSeconds: 600 })).resolves.toBe(true);
    });

    test("rejects a request signed with another secret", async () => {
        const request = await signedRequest({ signSecret: "other-secret" });

        await expect(verifyInternalRequest(request, secret)).resolves.toBe(false);
    });

    test("returns false when the secret is not configured", async () => {
        await expect(verifyInternalRequest(await signedRequest(), undefined)).resolves.toBe(false);
        await expect(verifyInternalRequest(await signedRequest(), "")).resolves.toBe(false);
    });

    test("returns false when the signature headers are missing", async () => {
        const request = new Request("https://internal/internal", { method: "POST", body: "{}" });

        await expect(verifyInternalRequest(request, secret)).resolves.toBe(false);
    });
});

describe("InternalAuthAdapter", () => {
    function createApp(): Hono {
        const app = new Hono();
        app.use("*", new InternalAuthAdapter().build());
        app.post("/internal", async (context) => {
            const body = await context.req.json() as { a: number };
            return context.json({ a: body.a });
        });
        return app;
    }

    test("returns 401 for an unsigned request", async () => {
        const response = await createApp().request(
            "https://internal/internal",
            { method: "POST", body: "{\"a\":1}" },
            { [masamuneInternalSecretEnv]: secret },
        );
        const body = await response.json() as { error: string };

        expect(response.status).toBe(401);
        expect(body.error).toBe("Unauthorized");
    });

    test("returns 401 when the secret is not configured", async () => {
        const response = await createApp().request(await signedRequest(), undefined, {});

        expect(response.status).toBe(401);
    });

    test("passes a signed request and keeps the body readable", async () => {
        const response = await createApp().request(
            await signedRequest(),
            undefined,
            { [masamuneInternalSecretEnv]: secret },
        );
        const body = await response.json() as { a: number };

        expect(response.status).toBe(200);
        expect(body.a).toBe(1);
    });
});
