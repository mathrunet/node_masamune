/**
 * Operation names supported by rules.json.
 *
 * rules.jsonでサポートする操作名。
 */
export type RulesOperation = "get" | "create" | "update" | "delete";

/**
 * Operation aliases supported by rules.json.
 *
 * rules.jsonでサポートする操作エイリアス。
 */
export type RulesOperationAlias = "read" | "write";

/**
 * Operation keys accepted in a rule entry.
 *
 * ルール内で指定可能な操作キー。
 */
export type RulesOperationKey = RulesOperation | RulesOperationAlias;

/**
 * Access rule for an operation.
 *
 * 操作に対するアクセスルール。
 */
export type RulesAccessRule =
    | "deny"
    | "allow"
    | "authenticated"
    | RulesFieldMatchAccessRule;

/**
 * Field match access rule.
 *
 * フィールド一致アクセスルール。
 */
export interface RulesFieldMatchAccessRule {
    type: "fieldMatch";
    field: string;
}

/**
 * Rule entry for a matched path.
 *
 * パスに対応するルール定義。
 */
export type RulesEntry = Partial<Record<RulesOperationKey, RulesAccessRule>>;

/**
 * Rule map keyed by path pattern.
 *
 * パスパターンをキーにしたルールマップ。
 */
export type RulesMap = Record<string, RulesEntry>;

/**
 * rules.json configuration.
 *
 * rules.json設定。
 */
export interface RulesConfig {
    version: string;
    rules: RulesMap;
}

/**
 * Result of loading and validating rules.
 *
 * rulesの読み込み・検証結果。
 */
export interface LoadedRulesConfig extends RulesConfig { }

const allowedAccessValues = new Set(["deny", "allow", "authenticated"]);
const allowedOperationKeys = new Set([
    "get",
    "create",
    "update",
    "delete",
    "read",
    "write",
]);

/**
 * Load and validate rules configuration.
 *
 * rules設定を読み込み、検証します。
 */
export function loadRulesConfig(input: unknown): LoadedRulesConfig {
    if (!isRecord(input)) {
        throw new Error("Rules config must be an object.");
    }
    if (typeof input.version !== "string" || input.version.length === 0) {
        throw new Error("Rules config version must be a non-empty string.");
    }
    if (!isRecord(input.rules) || Array.isArray(input.rules)) {
        throw new Error("Rules config rules must be an object map.");
    }

    const rules: RulesMap = {};
    for (const [path, entry] of Object.entries(input.rules)) {
        validateRulePath(path);
        rules[path] = validateRulesEntry(path, entry);
    }
    return {
        version: input.version,
        rules,
    };
}

/**
 * Validate a rule path.
 *
 * ルールパスを検証します。
 */
export function validateRulePath(path: string): void {
    if (path.length === 0) {
        throw new Error("Rule path must be a non-empty string.");
    }
    if (path.startsWith("/") || path.endsWith("/")) {
        throw new Error(`Rule path must not start or end with '/': ${path}`);
    }
    const segments = path.split("/");
    if (segments.some((segment) => segment.length === 0)) {
        throw new Error(`Rule path must not contain empty segments: ${path}`);
    }
    const deepWildcardIndex = segments.indexOf("**");
    if (deepWildcardIndex >= 0 && deepWildcardIndex !== segments.length - 1) {
        throw new Error(`'**' must be the last segment in rule path: ${path}`);
    }
}

function validateRulesEntry(path: string, entry: unknown): RulesEntry {
    if (!isRecord(entry) || Array.isArray(entry)) {
        throw new Error(`Rule entry must be an object: ${path}`);
    }
    const result: RulesEntry = {};
    for (const [operation, access] of Object.entries(entry)) {
        if (!allowedOperationKeys.has(operation)) {
            throw new Error(`Unsupported rule operation '${operation}' in ${path}.`);
        }
        result[operation as RulesOperationKey] = validateAccessRule(path, operation, access);
    }
    return result;
}

function validateAccessRule(path: string, operation: string, access: unknown): RulesAccessRule {
    if (typeof access === "string") {
        if (allowedAccessValues.has(access)) {
            return access as RulesAccessRule;
        }
        throw new Error(`Unsupported access rule '${access}' for ${operation} in ${path}.`);
    }
    if (isRecord(access)) {
        if (access.type === "fieldMatch" && typeof access.field === "string" && access.field.length > 0) {
            return {
                type: "fieldMatch",
                field: access.field,
            };
        }
    }
    throw new Error(`Invalid access rule for ${operation} in ${path}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
