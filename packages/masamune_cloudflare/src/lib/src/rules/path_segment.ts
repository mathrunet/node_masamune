/**
 * A named parameter embedded in a rule path segment.
 *
 * ルールパスセグメントに埋め込まれた名前付きパラメータ。
 */
export interface NamedPathParamSegment {
    name: string;
    prefix: string;
    suffix: string;
}

/**
 * A named parameter matched against a request path segment.
 *
 * リクエストパスセグメントに照合された名前付きパラメータ。
 */
export interface NamedPathParamMatch extends NamedPathParamSegment {
    value: string;
}

/**
 * Parse a rule path segment containing one named parameter.
 *
 * 名前付きパラメータを1つ含むルールパスセグメントを解析します。
 */
export function parseNamedPathParamSegment(segment: string): NamedPathParamSegment | undefined {
    const match = /^([^{}]*)\{([A-Za-z_][A-Za-z0-9_]*)\}([^{}]*)$/.exec(segment);
    if (!match) {
        return undefined;
    }
    return {
        name: match[2],
        prefix: match[1],
        suffix: match[3],
    };
}

/**
 * Match a named parameter rule segment and extract its value.
 *
 * 名前付きパラメータのルールセグメントを照合し、その値を抽出します。
 */
export function matchNamedPathParamSegment(
    segment: string,
    value: string,
): NamedPathParamMatch | undefined {
    const parsed = parseNamedPathParamSegment(segment);
    if (!parsed || !value.startsWith(parsed.prefix) || !value.endsWith(parsed.suffix)) {
        return undefined;
    }
    const end = value.length - parsed.suffix.length;
    const paramValue = value.slice(parsed.prefix.length, end);
    if (paramValue.length === 0) {
        return undefined;
    }
    return {
        ...parsed,
        value: paramValue,
    };
}
