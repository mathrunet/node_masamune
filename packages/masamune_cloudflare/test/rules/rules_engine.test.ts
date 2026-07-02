import {
    RulesEngine,
    buildDatabaseRulesPath,
    buildRulesPath,
    buildStorageRulesPath,
    normalizeHttpMethodToRulesOperation,
    resolveDatabaseTokenAccess,
} from "../../src/lib/src/rules/rules_engine";
import { loadRulesConfig } from "../../src/lib/src/rules/rules_loader";

const rules = {
    version: "1",
    rules: {
        database: {
            "*/*": {
                read: "deny",
                write: "deny",
            },
            "main/**": {
                read: "authenticated",
            },
            "main/users/*": {
                create: "authenticated",
                update: { type: "fieldMatch", field: "ownerId" },
            },
            "main/posts/*": {
                read: "allow",
                write: "authenticated",
                delete: "deny",
            },
        },
        storage: {
            "public/**": {
                read: "allow",
                write: "authenticated",
            },
            "images/{uid}/**": {
                read: { type: "path", param: "uid" },
                write: { type: "path", param: "uid", server: true },
            },
        },
    },
};

describe("rules engine", () => {
    test("allows public read by the most specific database rule", async () => {
        const engine = new RulesEngine(rules);

        const result = await engine.evaluate({
            target: "database",
            path: "main/posts/post-1",
            operation: "get",
        });

        expect(result.allowed).toBe(true);
        expect(result.rulePath).toBe("database/main/posts/*");
        expect(result.access).toBe("allow");
    });

    test("inherits parent read rule when child does not override it", async () => {
        const engine = new RulesEngine(rules);

        const denied = await engine.evaluate({
            target: "database",
            path: "main/users/user-1",
            operation: "get",
        });
        const allowed = await engine.evaluate({
            target: "database",
            path: "main/users/user-1",
            operation: "get",
            authentication: { uid: "user-1" },
        });

        expect(denied.allowed).toBe(false);
        expect(denied.access).toBe("authenticated");
        expect(allowed.allowed).toBe(true);
        expect(allowed.access).toBe("authenticated");
    });

    test("prefers specific operation over write alias", async () => {
        const engine = new RulesEngine(rules);

        const result = await engine.evaluate({
            target: "database",
            path: "main/posts/post-1",
            operation: "delete",
            authentication: { uid: "user-1" },
        });

        expect(result.allowed).toBe(false);
        expect(result.access).toBe("deny");
    });

    test("evaluates fieldMatch with fetched document", async () => {
        const engine = new RulesEngine(rules);

        const allowed = await engine.evaluate({
            target: "database",
            path: "main/users/user-1",
            operation: "update",
            authentication: { uid: "user-1" },
            fetchDocument: async () => ({ ownerId: "user-1" }),
        });
        const denied = await engine.evaluate({
            target: "database",
            path: "main/users/user-1",
            operation: "update",
            authentication: { uid: "user-2" },
            fetchDocument: async () => ({ ownerId: "user-1" }),
        });

        expect(allowed.allowed).toBe(true);
        expect(denied.allowed).toBe(false);
    });

    test("evaluates field rule with fetched document", async () => {
        const engine = new RulesEngine({
            version: "1",
            rules: {
                database: {
                    "main/users/*": {
                        update: { type: "field", field: "ownerId" },
                    },
                },
            },
        });

        const result = await engine.evaluate({
            target: "database",
            path: "main/users/user-1",
            operation: "update",
            authentication: { uid: "user-1" },
            fetchDocument: async () => ({ ownerId: "user-1" }),
        });

        expect(result.allowed).toBe(true);
    });

    test("inherits table rule without index key", async () => {
        const engine = new RulesEngine({
            version: "1",
            rules: {
                database: {
                    main: {
                        write: "allow",
                    },
                    "main/users": {
                        write: "deny",
                    },
                },
            },
        });

        const result = await engine.evaluate({
            target: "database",
            path: "main/users/user-1",
            operation: "write",
            server: true,
        });

        expect(result.allowed).toBe(false);
        expect(result.rulePath).toBe("database/main/users");
    });

    test("evaluates path parameter rules", async () => {
        const engine = new RulesEngine({
            version: "1",
            rules: {
                database: {
                    "{uid}": {
                        read: { type: "path", param: "uid" },
                    },
                },
            },
        });

        const result = await engine.evaluate({
            target: "database",
            path: "user-1",
            operation: "read",
            authentication: { uid: "user-1" },
        });

        expect(result.allowed).toBe(true);
        expect(result.params).toEqual({ uid: "user-1" });
    });

    test("evaluates server-only rules", async () => {
        const engine = new RulesEngine({
            version: "1",
            rules: {
                database: {
                    main: {
                        write: "server",
                    },
                },
            },
        });

        const denied = await engine.evaluate({
            target: "database",
            path: "main",
            operation: "write",
            server: false,
        });
        const allowed = await engine.evaluate({
            target: "database",
            path: "main",
            operation: "write",
            server: true,
        });

        expect(denied.allowed).toBe(false);
        expect(allowed.allowed).toBe(true);
    });

    test("is independent from rule map insertion order", async () => {
        const reorderedRules = {
            version: "1",
            rules: {
                database: {
                    "main/posts/*": rules.rules.database["main/posts/*"],
                    "main/users/*": rules.rules.database["main/users/*"],
                    "main/**": rules.rules.database["main/**"],
                    "*/*": rules.rules.database["*/*"],
                },
            },
        };
        const engine = new RulesEngine(reorderedRules);

        const result = await engine.evaluate({
            target: "database",
            path: "main/posts/post-1",
            operation: "get",
        });

        expect(result.allowed).toBe(true);
        expect(result.rulePath).toBe("database/main/posts/*");
    });

    test("evaluates storage target independently from database target", async () => {
        const engine = new RulesEngine(rules);

        const publicRead = await engine.evaluate({
            target: "storage",
            path: "public/logo.png",
            operation: "read",
        });
        const ownerWrite = await engine.evaluate({
            target: "storage",
            path: "images/user-1/avatar.png",
            operation: "write",
            authentication: { uid: "user-1" },
            server: true,
        });
        const otherWrite = await engine.evaluate({
            target: "storage",
            path: "images/user-1/avatar.png",
            operation: "write",
            authentication: { uid: "user-2" },
            server: true,
        });

        expect(publicRead.allowed).toBe(true);
        expect(ownerWrite.allowed).toBe(true);
        expect(otherWrite.allowed).toBe(false);
    });

    test("normalizes HTTP methods to rules operations", () => {
        expect(normalizeHttpMethodToRulesOperation("GET")).toBe("get");
        expect(normalizeHttpMethodToRulesOperation("POST")).toBe("create");
        expect(normalizeHttpMethodToRulesOperation("PUT")).toBe("update");
        expect(normalizeHttpMethodToRulesOperation("DELETE")).toBe("delete");
    });

    test("builds database rules path", () => {
        expect(buildRulesPath({
            database: "main",
            table: "users",
            indexKey: "user-1",
        })).toBe("main/users/user-1");
        expect(buildDatabaseRulesPath({ database: "main" })).toBe("main");
    });

    test("builds storage rules path", () => {
        expect(buildStorageRulesPath({ path: "/images/user-1/avatar.png" }))
            .toBe("images/user-1/avatar.png");
    });

    test("resolves database token access modes", async () => {
        const engine = new RulesEngine({
            version: "1",
            rules: {
                database: {
                    main: {
                        read: "allow",
                        write: "server",
                    },
                },
            },
        });

        const access = await resolveDatabaseTokenAccess({
            engine,
            database: "main",
            operations: ["read", "write"],
        });

        expect(access).toMatchObject({
            authorization: "read-only",
            readMode: "direct",
            writeMode: "functions",
        });
    });

    test("downgrades database token write mode when a descendant table denies writes", async () => {
        const engine = new RulesEngine({
            version: "1",
            rules: {
                database: {
                    main: {
                        read: "allow",
                        write: "allow",
                    },
                    "main/users": {
                        read: "allow",
                        write: "deny",
                    },
                },
            },
        });

        const access = await resolveDatabaseTokenAccess({
            engine,
            database: "main",
        });

        expect(access).toMatchObject({
            authorization: "read-only",
            readMode: "direct",
            writeMode: "functions",
        });
    });

    test("validates rules config schema", () => {
        expect(() => loadRulesConfig({
            version: "1",
            rules: [],
        })).toThrow("rules must be an object");
        expect(() => loadRulesConfig({
            version: "1",
            rules: {
                "database/main": { read: "allow" },
            },
        })).toThrow("Unsupported rules target");
        expect(() => loadRulesConfig({
            version: "1",
            rules: {
                database: {
                    "/main": { read: "allow" },
                },
            },
        })).toThrow("must not start or end");
        expect(() => loadRulesConfig({
            version: "1",
            rules: {
                database: {
                    main: { read: "unknown" },
                },
            },
        })).toThrow("Unsupported access rule");
    });
});
