import {
    matchRulePath,
    sortRulePathMatches,
} from "../../src/lib/src/rules/path_matcher";

describe("path matcher", () => {
    test("matches exact paths", () => {
        const result = matchRulePath(
            "database/main/table/users/user-1",
            "database/main/table/users/user-1",
        );

        expect(result.matched).toBe(true);
        expect(result.literalSegments).toBe(5);
    });

    test("matches single segment wildcards", () => {
        const result = matchRulePath(
            "database/*/table/users/*",
            "database/main/table/users/user-1",
        );

        expect(result.matched).toBe(true);
        expect(result.literalSegments).toBe(3);
        expect(result.wildcardSegments).toBe(2);
    });

    test("matches deep wildcard as remaining segments", () => {
        const result = matchRulePath(
            "database/main/table/**",
            "database/main/table/users/user-1",
        );

        expect(result.matched).toBe(true);
        expect(result.deepWildcardSegments).toBe(1);
    });

    test("does not match missing segments without deep wildcard", () => {
        const result = matchRulePath(
            "database/*/table/users/*",
            "database/main/table/users",
        );

        expect(result.matched).toBe(false);
    });

    test("sorts matches by specificity", () => {
        const matches = [
            matchRulePath("database/*/table/*/*", "database/main/table/users/user-1"),
            matchRulePath("database/main/table/**", "database/main/table/users/user-1"),
            matchRulePath("database/main/table/users/*", "database/main/table/users/user-1"),
        ];

        const sorted = sortRulePathMatches(matches);

        expect(sorted.map((match) => match.rulePath)).toEqual([
            "database/main/table/users/*",
            "database/main/table/**",
            "database/*/table/*/*",
        ]);
    });

    test("rejects invalid deep wildcard position", () => {
        expect(() => matchRulePath(
            "database/**/users",
            "database/main/table/users",
        )).toThrow("'**' must be the last segment");
    });
});
