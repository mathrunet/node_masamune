import { validateRulePath } from "./rules_loader";

/**
 * Result of matching a rule path against a request path.
 *
 * ルールパスとリクエストパスのマッチ結果。
 */
export interface RulePathMatch {
    matched: boolean;
    rulePath: string;
    params: Record<string, string>;
    literalSegments: number;
    namedWildcardSegments: number;
    wildcardSegments: number;
    deepWildcardSegments: number;
    matchedSegments: number;
}

/**
 * Match rule path to request path.
 *
 * ルールパスをリクエストパスに照合します。
 */
export function matchRulePath(rulePath: string, requestPath: string): RulePathMatch {
    validateRulePath(rulePath);
    const ruleSegments = splitPath(rulePath);
    const requestSegments = splitPath(requestPath);
    const params: Record<string, string> = {};
    let literalSegments = 0;
    let namedWildcardSegments = 0;
    let wildcardSegments = 0;
    let deepWildcardSegments = 0;

    for (let i = 0; i < ruleSegments.length; i++) {
        const ruleSegment = ruleSegments[i];
        if (ruleSegment === "**") {
            deepWildcardSegments = 1;
            return {
                matched: true,
                rulePath,
                params,
                literalSegments,
                namedWildcardSegments,
                wildcardSegments,
                deepWildcardSegments,
                matchedSegments: requestSegments.length,
            };
        }
        const requestSegment = requestSegments[i];
        if (requestSegment === undefined) {
            return createUnmatched(rulePath);
        }
        if (ruleSegment === "*") {
            wildcardSegments++;
            continue;
        }
        const paramName = parseNamedPathParam(ruleSegment);
        if (paramName) {
            params[paramName] = requestSegment;
            namedWildcardSegments++;
            wildcardSegments++;
            continue;
        }
        if (ruleSegment !== requestSegment) {
            return createUnmatched(rulePath);
        }
        literalSegments++;
    }
    if (ruleSegments.length !== requestSegments.length) {
        return createUnmatched(rulePath);
    }
    return {
        matched: true,
        rulePath,
        params,
        literalSegments,
        namedWildcardSegments,
        wildcardSegments,
        deepWildcardSegments,
        matchedSegments: requestSegments.length,
    };
}

/**
 * Compare matches by specificity.
 *
 * マッチ結果を具体度で比較します。
 */
export function compareRulePathMatch(a: RulePathMatch, b: RulePathMatch): number {
    if (a.literalSegments !== b.literalSegments) {
        return b.literalSegments - a.literalSegments;
    }
    if (a.deepWildcardSegments !== b.deepWildcardSegments) {
        return a.deepWildcardSegments - b.deepWildcardSegments;
    }
    if (a.namedWildcardSegments !== b.namedWildcardSegments) {
        return b.namedWildcardSegments - a.namedWildcardSegments;
    }
    if (a.wildcardSegments !== b.wildcardSegments) {
        return a.wildcardSegments - b.wildcardSegments;
    }
    if (a.matchedSegments !== b.matchedSegments) {
        return b.matchedSegments - a.matchedSegments;
    }
    return a.rulePath.localeCompare(b.rulePath);
}

/**
 * Sort matches from the most specific to the least specific.
 *
 * マッチ結果を具体度の高い順に並べます。
 */
export function sortRulePathMatches(matches: RulePathMatch[]): RulePathMatch[] {
    return [...matches].sort(compareRulePathMatch);
}

function splitPath(path: string): string[] {
    if (path.length === 0 || path.startsWith("/") || path.endsWith("/")) {
        return [];
    }
    const segments = path.split("/");
    if (segments.some((segment) => segment.length === 0)) {
        return [];
    }
    return segments;
}

function createUnmatched(rulePath: string): RulePathMatch {
    return {
        matched: false,
        rulePath,
        params: {},
        literalSegments: 0,
        namedWildcardSegments: 0,
        wildcardSegments: 0,
        deepWildcardSegments: 0,
        matchedSegments: 0,
    };
}

function parseNamedPathParam(segment: string): string | undefined {
    const match = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(segment);
    return match?.[1];
}
