import {
    matchRulePath,
    sortRulePathMatches,
} from "../../src/lib/src/rules/path_matcher";

describe("path matcher", () => {
    test("matches exact paths", () => {
        const result = matchRulePath(
            "database/main/users/user-1",
            "database/main/users/user-1",
        );

        expect(result.matched).toBe(true);
        expect(result.literalSegments).toBe(4);
    });

    test("matches single segment wildcards", () => {
        const result = matchRulePath(
            "database/*/users/*",
            "database/main/users/user-1",
        );

        expect(result.matched).toBe(true);
        expect(result.literalSegments).toBe(2);
        expect(result.wildcardSegments).toBe(2);
    });

    test("matches named path parameters", () => {
        const result = matchRulePath(
            "database/{uid}",
            "database/user-1",
        );

        expect(result.matched).toBe(true);
        expect(result.params).toEqual({ uid: "user-1" });
        expect(result.namedWildcardSegments).toBe(1);
    });

    test("matches named path parameters embedded in a segment", () => {
        const prefixed = matchRulePath(
            "database/private_{uid}",
            "database/private_user-1",
        );
        const wrapped = matchRulePath(
            "database/prefix_{uid}_suffix",
            "database/prefix_user-1_suffix",
        );

        expect(prefixed.matched).toBe(true);
        expect(prefixed.params).toEqual({ uid: "user-1" });
        expect(prefixed.embeddedLiteralCharacters).toBe("private_".length);
        expect(wrapped.matched).toBe(true);
        expect(wrapped.params).toEqual({ uid: "user-1" });
    });

    test("does not match embedded parameters with different literals or empty values", () => {
        expect(matchRulePath(
            "database/prefix_{uid}_suffix",
            "database/other_user-1_suffix",
        ).matched).toBe(false);
        expect(matchRulePath(
            "database/prefix_{uid}_suffix",
            "database/prefix_user-1_other",
        ).matched).toBe(false);
        expect(matchRulePath(
            "database/private_{uid}",
            "database/private_",
        ).matched).toBe(false);
    });

    test("matches deep wildcard as remaining segments", () => {
        const result = matchRulePath(
            "database/main/**",
            "database/main/users/user-1",
        );

        expect(result.matched).toBe(true);
        expect(result.deepWildcardSegments).toBe(1);
    });

    test("matches parent rule paths as inherited rules", () => {
        const result = matchRulePath(
            "database/main/users",
            "database/main/users/user-1",
        );

        expect(result.matched).toBe(true);
        expect(result.literalSegments).toBe(3);
    });

    test("does not match missing segments without deep wildcard", () => {
        const result = matchRulePath(
            "database/*/users/*",
            "database/main/users",
        );

        expect(result.matched).toBe(false);
    });

    test("sorts matches by specificity", () => {
        const matches = [
            matchRulePath("database/*/*", "database/main/users/user-1"),
            matchRulePath("database/main/**", "database/main/users/user-1"),
            matchRulePath("database/main/users/*", "database/main/users/user-1"),
        ];

        const sorted = sortRulePathMatches(matches);

        expect(sorted.map((match) => match.rulePath)).toEqual([
            "database/main/users/*",
            "database/main/**",
            "database/*/*",
        ]);
    });

    test("sorts embedded parameters between literals and whole-segment parameters", () => {
        const matches = [
            matchRulePath("database/*", "database/private_user-1"),
            matchRulePath("database/{uid}", "database/private_user-1"),
            matchRulePath("database/private_{uid}", "database/private_user-1"),
            matchRulePath("database/private_user-1", "database/private_user-1"),
        ];

        const sorted = sortRulePathMatches(matches);

        expect(sorted.map((match) => match.rulePath)).toEqual([
            "database/private_user-1",
            "database/private_{uid}",
            "database/{uid}",
            "database/*",
        ]);
    });

    test("rejects invalid deep wildcard position", () => {
        expect(() => matchRulePath(
            "database/**/users",
            "database/main/users",
        )).toThrow("'**' must be the last segment");
    });

    test("rejects invalid named path parameters", () => {
        expect(() => matchRulePath(
            "database/{invalid-name}",
            "database/main",
        )).toThrow("Invalid path parameter segment");
        expect(() => matchRulePath(
            "database/prefix_{uid}_{other}",
            "database/prefix_user-1_other-1",
        )).toThrow("Invalid path parameter segment");
        expect(() => matchRulePath(
            "database/private_{uid",
            "database/private_user-1",
        )).toThrow("Invalid path parameter segment");
    });

    test("rejects duplicate named path parameters", () => {
        expect(() => matchRulePath(
            "database/{uid}/users/{uid}",
            "database/user-1/users/user-1",
        )).toThrow("Duplicate path parameter");
        expect(() => matchRulePath(
            "database/private_{uid}/users/owner_{uid}",
            "database/private_user-1/users/owner_user-1",
        )).toThrow("Duplicate path parameter");
    });
});
