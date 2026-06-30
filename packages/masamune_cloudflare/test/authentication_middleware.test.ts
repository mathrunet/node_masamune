import { Hono } from "hono";
import { deploy } from "../src";
import {
    FirebaseAuthenticationMiddleware,
    NoAuthenticationMiddleware,
} from "../src/lib/middlewares";
import { WorkersData } from "../src/lib/src/workers_data";

jest.mock("firebase-auth-cloudflare-workers", () => ({
    Auth: {
        getOrInitialize: jest.fn(),
    },
}));

import { Auth } from "firebase-auth-cloudflare-workers";

let mockVerifyIdToken: jest.Mock;
const mockGetOrInitialize = Auth.getOrInitialize as jest.Mock;

const keyStore = {
    get: jest.fn(),
    put: jest.fn(),
};

function createWorker(options = {}) {
    return new WorkersData({
        path: "/test",
        options,
        func: (hono: Hono) => {
            hono.get("/", async (context) => {
                return context.json({ message: "Hello, World!" });
            });
            return hono;
        },
    });
}

describe("authentication middleware", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockVerifyIdToken = jest.fn();
        mockGetOrInitialize.mockReturnValue({
            verifyIdToken: mockVerifyIdToken,
        });
    });

    test("allows requests without authentication when NoAuthenticationMiddleware is used", async () => {
        const app = deploy([
            createWorker({ authentication: new NoAuthenticationMiddleware() }),
        ]);

        const response = await app.request("http://localhost/test");
        const body = await response.json() as { message: string };

        expect(response.status).toBe(200);
        expect(body.message).toBe("Hello, World!");
    });

    test("allows requests when Firebase Authentication token is valid", async () => {
        mockVerifyIdToken.mockResolvedValueOnce({ uid: "user-1" });
        const app = deploy([
            createWorker({
                authentication: new FirebaseAuthenticationMiddleware({
                    projectId: "test-project",
                    keyStore,
                }),
            }),
        ]);

        const response = await app.request("http://localhost/test", {
            headers: {
                Authorization: "Bearer valid-token",
            },
        });
        const body = await response.json() as { message: string };

        expect(response.status).toBe(200);
        expect(body.message).toBe("Hello, World!");
        expect(mockGetOrInitialize).toHaveBeenCalledWith("test-project", keyStore);
        expect(mockVerifyIdToken).toHaveBeenCalledWith("valid-token", undefined, undefined, undefined);
    });

    test("rejects requests when Firebase Authentication token is invalid", async () => {
        mockVerifyIdToken.mockRejectedValueOnce(new Error("invalid token"));
        const app = deploy([
            createWorker({
                authentication: new FirebaseAuthenticationMiddleware({
                    projectId: "test-project",
                    keyStore,
                }),
            }),
        ]);

        const response = await app.request("http://localhost/test", {
            headers: {
                Authorization: "Bearer invalid-token",
            },
        });
        const body = await response.json() as { error: string };

        expect(response.status).toBe(401);
        expect(body.error).toBe("Unauthorized");
        expect(mockVerifyIdToken).toHaveBeenCalledWith("invalid-token", undefined, undefined, undefined);
    });

    test("rejects requests when Firebase Authentication bearer token is missing", async () => {
        const app = deploy([
            createWorker({
                authentication: new FirebaseAuthenticationMiddleware({
                    projectId: "test-project",
                    keyStore,
                }),
            }),
        ]);

        const response = await app.request("http://localhost/test");
        const body = await response.json() as { error: string };

        expect(response.status).toBe(401);
        expect(body.error).toBe("Unauthorized");
        expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    test("applies deploy default authentication and allows worker override", async () => {
        mockVerifyIdToken.mockResolvedValueOnce({ uid: "user-1" });
        const app = deploy([
            createWorker(),
            new WorkersData({
                path: "/public",
                options: { authentication: new NoAuthenticationMiddleware() },
                func: (hono: Hono) => {
                    hono.get("/", async (context) => {
                        return context.json({ message: "Public" });
                    });
                    return hono;
                },
            }),
        ], {
            authentication: new FirebaseAuthenticationMiddleware({
                projectId: "test-project",
                keyStore,
            }),
        });

        const privateResponse = await app.request("http://localhost/test", {
            headers: {
                Authorization: "Bearer valid-token",
            },
        });
        const publicResponse = await app.request("http://localhost/public");
        const publicBody = await publicResponse.json() as { message: string };

        expect(privateResponse.status).toBe(200);
        expect(publicResponse.status).toBe(200);
        expect(publicBody.message).toBe("Public");
        expect(mockVerifyIdToken).toHaveBeenCalledTimes(1);
    });
});
