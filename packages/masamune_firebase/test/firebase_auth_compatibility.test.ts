describe("Firebase Auth CommonJS dependencies", () => {
    test("loads the real Admin Auth and Functions modules", () => {
        expect(typeof require("firebase-admin/auth").getAuth).toBe("function");
        expect(typeof require("firebase-functions/v2/https").onCall).toBe("function");
    });

    test("signs and verifies JWTs with the real jose implementation", async () => {
        const { SignJWT, jwtVerify } = require("jose");
        const key = new Uint8Array(32);
        const token = await new SignJWT({ sub: "test-user" })
            .setProtectedHeader({ alg: "HS256" })
            .sign(key);

        const { payload } = await jwtVerify(token, key);
        expect(payload.sub).toBe("test-user");
        await expect(jwtVerify(token, new Uint8Array(32).fill(1)))
            .rejects.toThrow("signature verification failed");
    });
});
