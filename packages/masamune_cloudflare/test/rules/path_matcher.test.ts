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
    });

    test("rejects duplicate named path parameters", () => {
        expect(() => matchRulePath(
            "database/{uid}/users/{uid}",
            "database/user-1/users/user-1",
        )).toThrow("Duplicate path parameter");
    });
});
