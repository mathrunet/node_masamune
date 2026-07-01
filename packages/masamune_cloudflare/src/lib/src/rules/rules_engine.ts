import { WorkersAuthContext } from "../workers_auth_adapter_base";
import {
    RulesAccessRule,
    RulesConfig,
    RulesEntry,
    RulesOperation,
    RulesOperationKey,
    loadRulesConfig,
} from "./rules_loader";
import { matchRulePath, sortRulePathMatches } from "./path_matcher";

/**
 * Input for evaluating rules.
 *
 * rules評価入力。
 */
export interface RulesEvaluationInput {
    path: string;
    operation: RulesOperation | RulesOperationKey;
    authentication?: WorkersAuthContext | undefined;
    fetchDocument?: (() => Promise<Record<string, unknown> | null | undefined>) | undefined;
}

/**
 * Result of evaluating rules.
 *
 * rules評価結果。
 */
export interface RulesEvaluationResult {
    allowed: boolean;
    rulePath?: string | undefined;
    access?: RulesAccessRule | undefined;
}

/**
 * Arguments for building a rules path.
 *
 * rulesパス生成引数。
 */
export interface RulesPathArguments {
    database: string;
    table: string;
    indexKey: string;
}

/**
 * Rules engine.
 *
 * rules評価エンジン。
 */
export class RulesEngine {
    constructor(config: RulesConfig | unknown) {
        this.config = loadRulesConfig(config);
    }

    private readonly config: RulesConfig;

    /**
     * Evaluate rules for the given path and operation.
     *
     * 指定したパスと操作に対してrulesを評価します。
     */
    async evaluate(input: RulesEvaluationInput): Promise<RulesEvaluationResult> {
        const operation = normalizeRulesOperation(input.operation);
        const matches = Object.keys(this.config.rules)
            .map((rulePath) => matchRulePath(rulePath, input.path))
            .filter((match) => match.matched);
        if (matches.length === 0) {
            return { allowed: false };
        }

        const sortedMatches = sortRulePathMatches(matches);
        const resolved = resolveInheritedRule(sortedMatches.map((match) => {
            return {
                rulePath: match.rulePath,
                entry: this.config.rules[match.rulePath],
            };
        }));
        const access = resolveAccessRule(resolved.entry, operation);
        if (!access) {
            return {
                allowed: false,
                rulePath: resolved.rulePath,
            };
        }
        return {
            allowed: await evaluateAccessRule(access, input.authentication, input.fetchDocument),
            rulePath: resolved.rulePath,
            access,
        };
    }
}

/**
 * Build a normalized rules path.
 *
 * 正規化されたrulesパスを生成します。
 */
export function buildRulesPath({ database, table, indexKey }: RulesPathArguments): string {
    return [
        "database",
        encodeRulesPathSegment(database),
        "table",
        encodeRulesPathSegment(table),
        encodeRulesPathSegment(indexKey),
    ].join("/");
}

/**
 * Normalize HTTP method to rules operation.
 *
 * HTTPメソッドをrules操作に正規化します。
 */
export function normalizeHttpMethodToRulesOperation(method: string): RulesOperation {
    switch (method.toUpperCase()) {
        case "GET":
            return "get";
        case "POST":
            return "create";
        case "PUT":
            return "update";
        case "DELETE":
            return "delete";
        default:
            throw new Error(`Unsupported HTTP method for rules: ${method}`);
    }
}

/**
 * Normalize rules operation aliases.
 *
 * rules操作エイリアスを正規化します。
 */
export function normalizeRulesOperation(operation: RulesOperation | RulesOperationKey): RulesOperation {
    switch (operation) {
        case "read":
            return "get";
        case "write":
            return "create";
        case "get":
        case "create":
        case "update":
        case "delete":
            return operation;
    }
}

/**
 * Resolve operation lookup order.
 *
 * 操作の解決順を取得します。
 */
export function resolveRulesOperation(operation: RulesOperation | RulesOperationKey): RulesOperationKey[] {
    const normalized = normalizeRulesOperation(operation);
    switch (normalized) {
        case "get":
            return ["get", "read"];
        case "create":
            return ["create", "write"];
        case "update":
            return ["update", "write"];
        case "delete":
            return ["delete", "write"];
    }
}

function resolveInheritedRule(
    matches: { rulePath: string, entry: RulesEntry | undefined }[],
): { rulePath: string, entry: RulesEntry } {
    const inherited: RulesEntry = {};
    let rulePath = matches[0]?.rulePath ?? "";
    for (const match of [...matches].reverse()) {
        if (!match.entry) {
            continue;
        }
        rulePath = match.rulePath;
        for (const [operation, access] of Object.entries(match.entry)) {
            inherited[operation as RulesOperationKey] = access;
        }
    }
    return {
        rulePath,
        entry: inherited,
    };
}

function resolveAccessRule(entry: RulesEntry, operation: RulesOperation): RulesAccessRule | undefined {
    for (const operationKey of resolveRulesOperation(operation)) {
        const access = entry[operationKey];
        if (access) {
            return access;
        }
    }
    return undefined;
}

async function evaluateAccessRule(
    access: RulesAccessRule,
    authentication?: WorkersAuthContext | undefined,
    fetchDocument?: (() => Promise<Record<string, unknown> | null | undefined>) | undefined,
): Promise<boolean> {
    switch (access) {
        case "deny":
            return false;
        case "allow":
            return true;
        case "authenticated":
            return !!authentication?.uid;
        default: {
            const uid = authentication?.uid;
            if (!uid || !fetchDocument) {
                return false;
            }
            const document = await fetchDocument();
            return document?.[access.field] === uid;
        }
    }
}

function encodeRulesPathSegment(segment: string): string {
    if (segment.length === 0 || segment.includes("/")) {
        throw new Error(`Invalid rules path segment: ${segment}`);
    }
    return segment;
}
