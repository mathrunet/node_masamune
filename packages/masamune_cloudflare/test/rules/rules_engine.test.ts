import {
    RulesEngine,
    buildDatabaseRulesPath,
    buildRulesPath,
    normalizeHttpMethodToRulesOperation,
    resolveDatabaseTokenAccess,
} from "../../src/lib/src/rules/rules_engine";
import { loadRulesConfig } from "../../src/lib/src/rules/rules_loader";

const rules = {
    version: "1",
    rules: {
        "database/*/*": {
            read: "deny",
            write: "deny",
        },
        "database/main/**": {
            read: "authenticated",
        },
        "database/main/users/*": {
            create: "authenticated",
            update: { type: "fieldMatch", field: "ownerId" },
        },
        "database/main/posts/*": {
            read: "allow",
            write: "authenticated",
            delete: "deny",
        },
    },
};

describe("rules engine", () => {
    test("allows public read by the most specific rule", async () => {
        const engine = new RulesEngine(rules);

        const result = await engine.evaluate({
            path: "database/main/posts/post-1",
            operation: "get",
        });

        expect(result.allowed).toBe(true);
        expect(result.rulePath).toBe("database/main/posts/*");
        expect(result.access).toBe("allow");
    });

    test("inherits parent read rule when child does not override it", async () => {
        const engine = new RulesEngine(rules);

        const denied = await engine.evaluate({
            path: "database/main/users/user-1",
            operation: "get",
        });
        const allowed = await engine.evaluate({
            path: "database/main/users/user-1",
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
            path: "database/main/posts/post-1",
            operation: "delete",
            authentication: { uid: "user-1" },
        });

        expect(result.allowed).toBe(false);
        expect(result.access).toBe("deny");
    });

    test("evaluates fieldMatch with fetched document", async () => {
        const engine = new RulesEngine(rules);

        const allowed = await engine.evaluate({
            path: "database/main/users/user-1",
            operation: "update",
            authentication: { uid: "user-1" },
            fetchDocument: async () => ({ ownerId: "user-1" }),
        });
        const denied = await engine.evaluate({
            path: "database/main/users/user-1",
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
                "database/main/users/*": {
                    update: { type: "field", field: "ownerId" },
                },
            },
        });

        const result = await engine.evaluate({
            path: "database/main/users/user-1",
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
                "database/main": {
                    write: "allow",
                },
                "database/main/users": {
                    write: "deny",
                },
            },
        });

        const result = await engine.evaluate({
            path: "database/main/users/user-1",
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
                "database/{uid}": {
                    read: { type: "path", param: "uid" },
                },
            },
        });

        const result = await engine.evaluate({
            path: "database/user-1",
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
                "database/main": {
                    write: "server",
                },
            },
        });

        const denied = await engine.evaluate({
            path: "database/main",
            operation: "write",
            server: false,
        });
        const allowed = await engine.evaluate({
            path: "database/main",
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
                "database/main/posts/*": rules.rules["database/main/posts/*"],
                "database/main/users/*": rules.rules["database/main/users/*"],
                "database/main/**": rules.rules["database/main/**"],
                "database/*/*": rules.rules["database/*/*"],
            },
        };
        const engine = new RulesEngine(reorderedRules);

        const result = await engine.evaluate({
            path: "database/main/posts/post-1",
            operation: "get",
        });

        expect(result.allowed).toBe(true);
        expect(result.rulePath).toBe("database/main/posts/*");
    });

    test("normalizes HTTP methods to rules operations", () => {
        expect(normalizeHttpMethodToRulesOperation("GET")).toBe("get");
        expect(normalizeHttpMethodToRulesOperation("POST")).toBe("create");
        expect(normalizeHttpMethodToRulesOperation("PUT")).toBe("update");
        expect(normalizeHttpMethodToRulesOperation("DELETE")).toBe("delete");
    });

    test("builds rules path", () => {
        expect(buildRulesPath({
            database: "main",
            table: "users",
            indexKey: "user-1",
        })).toBe("database/main/users/user-1");
    });

    test("builds database rules path", () => {
        expect(buildDatabaseRulesPath({ database: "main" })).toBe("database/main");
    });

    test("resolves database token access modes", async () => {
        const engine = new RulesEngine({
            version: "1",
            rules: {
                "database/main": {
                    read: "allow",
                    write: "server",
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
                "database/main": {
                    read: "allow",
                    write: "allow",
                },
                "database/main/users": {
                    read: "allow",
                    write: "deny",
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
        })).toThrow("rules must be an object map");
        expect(() => loadRulesConfig({
            version: "1",
            rules: {
                "/database/main": { read: "allow" },
            },
        })).toThrow("must not start or end");
        expect(() => loadRulesConfig({
            version: "1",
            rules: {
                "database/main": { read: "unknown" },
            },
        })).toThrow("Unsupported access rule");
    });
});
