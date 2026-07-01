import {
    RulesEngine,
    buildRulesPath,
    normalizeHttpMethodToRulesOperation,
} from "../../src/lib/src/rules/rules_engine";
import { loadRulesConfig } from "../../src/lib/src/rules/rules_loader";

const rules = {
    version: "1",
    rules: {
        "database/*/table/*/*": {
            read: "deny",
            write: "deny",
        },
        "database/main/table/**": {
            read: "authenticated",
        },
        "database/main/table/users/*": {
            create: "authenticated",
            update: { type: "fieldMatch", field: "ownerId" },
        },
        "database/main/table/posts/*": {
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
            path: "database/main/table/posts/post-1",
            operation: "get",
        });

        expect(result.allowed).toBe(true);
        expect(result.rulePath).toBe("database/main/table/posts/*");
        expect(result.access).toBe("allow");
    });

    test("inherits parent read rule when child does not override it", async () => {
        const engine = new RulesEngine(rules);

        const denied = await engine.evaluate({
            path: "database/main/table/users/user-1",
            operation: "get",
        });
        const allowed = await engine.evaluate({
            path: "database/main/table/users/user-1",
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
            path: "database/main/table/posts/post-1",
            operation: "delete",
            authentication: { uid: "user-1" },
        });

        expect(result.allowed).toBe(false);
        expect(result.access).toBe("deny");
    });

    test("evaluates fieldMatch with fetched document", async () => {
        const engine = new RulesEngine(rules);

        const allowed = await engine.evaluate({
            path: "database/main/table/users/user-1",
            operation: "update",
            authentication: { uid: "user-1" },
            fetchDocument: async () => ({ ownerId: "user-1" }),
        });
        const denied = await engine.evaluate({
            path: "database/main/table/users/user-1",
            operation: "update",
            authentication: { uid: "user-2" },
            fetchDocument: async () => ({ ownerId: "user-1" }),
        });

        expect(allowed.allowed).toBe(true);
        expect(denied.allowed).toBe(false);
    });

    test("is independent from rule map insertion order", async () => {
        const reorderedRules = {
            version: "1",
            rules: {
                "database/main/table/posts/*": rules.rules["database/main/table/posts/*"],
                "database/main/table/users/*": rules.rules["database/main/table/users/*"],
                "database/main/table/**": rules.rules["database/main/table/**"],
                "database/*/table/*/*": rules.rules["database/*/table/*/*"],
            },
        };
        const engine = new RulesEngine(reorderedRules);

        const result = await engine.evaluate({
            path: "database/main/table/posts/post-1",
            operation: "get",
        });

        expect(result.allowed).toBe(true);
        expect(result.rulePath).toBe("database/main/table/posts/*");
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
        })).toBe("database/main/table/users/user-1");
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
