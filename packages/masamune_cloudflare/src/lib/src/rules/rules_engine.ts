import { WorkersAuthContext } from "../workers_auth_adapter_base";
import {
    RulesAccessRule,
    RulesConfig,
    RulesEntry,
    RulesOperation,
    RulesOperationKey,
    RulesTarget,
    loadRulesConfig,
} from "./rules_loader";
import { matchRulePath, sortRulePathMatches } from "./path_matcher";
import { matchNamedPathParamSegment } from "./path_segment";

/**
 * Input for evaluating rules.
 *
 * rules評価入力。
 */
export interface RulesEvaluationInput {
    path: string;
    target?: RulesTarget | undefined;
    operation: RulesOperation | RulesOperationKey;
    authentication?: WorkersAuthContext | undefined;
    fetchDocument?: (() => Promise<Record<string, unknown> | null | undefined>) | undefined;
    server?: boolean | undefined;
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
    params?: Record<string, string> | undefined;
}

/**
 * Arguments for building a rules path.
 *
 * rulesパス生成引数。
 */
export interface RulesPathArguments {
    database: string;
    table?: string | undefined;
    indexKey?: string | undefined;
}

/**
 * Access mode resolved from rules.
 *
 * rulesから解決されたアクセスモード。
 */
export type RulesAccessMode = "none" | "functions" | "direct";

/**
 * Database token authorization resolved from rules.
 *
 * rulesから解決されたデータベーストークン権限。
 */
export type RulesDatabaseTokenAuthorization = "read-only" | "full-access";

/**
 * Target input for database token rules evaluation.
 *
 * データベーストークンrules評価対象。
 */
export interface RulesTokenTargetInput {
    table: string;
    operations: RulesOperationKey[];
}

/**
 * Target output for database token rules evaluation.
 *
 * データベーストークンrules評価結果。
 */
export interface RulesTokenTargetOutput extends RulesTokenTargetInput {
    readMode?: RulesAccessMode | undefined;
    writeMode?: RulesAccessMode | undefined;
}

/**
 * Database token access resolved from rules.
 *
 * rulesから解決されたデータベーストークンアクセス。
 */
export interface RulesDatabaseTokenAccess {
    authorization?: RulesDatabaseTokenAuthorization | undefined;
    readMode: RulesAccessMode;
    writeMode: RulesAccessMode;
    scopes: RulesTokenTargetOutput[];
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

    private readonly config: ReturnType<typeof loadRulesConfig>;

    /**
     * Evaluate rules for the given path and operation.
     *
     * 指定したパスと操作に対してrulesを評価します。
     */
    async evaluate(input: RulesEvaluationInput): Promise<RulesEvaluationResult> {
        const operation = normalizeRulesOperation(input.operation);
        const path = normalizeEvaluationPath(input);
        const matches = Object.keys(this.config.normalizedRules)
            .map((rulePath) => matchRulePath(rulePath, path))
            .filter((match) => match.matched);
        if (matches.length === 0) {
            return { allowed: false };
        }

        const sortedMatches = sortRulePathMatches(matches);
        const resolved = resolveInheritedRule(sortedMatches.map((match) => {
            return {
                rulePath: match.rulePath,
                entry: this.config.normalizedRules[match.rulePath],
                params: match.params,
            };
        }));
        const resolvedAccess = resolveAccessRule(resolved.entry, resolved.params, operation);
        if (!resolvedAccess) {
            return {
                allowed: false,
                rulePath: resolved.rulePath,
            };
        }
        return {
            allowed: await evaluateAccessRule(
                resolvedAccess.access,
                input.authentication,
                input.fetchDocument,
                resolvedAccess.params,
                input.server === true,
            ),
            rulePath: resolved.rulePath,
            access: resolvedAccess.access,
            params: resolvedAccess.params,
        };
    }

    /**
     * Returns true when a table scoped rule requires server evaluation.
     *
     * テーブル配下ルールにサーバー評価が必要な制約がある場合はtrueを返します。
     */
    hasScopedRestriction({
        database,
        table,
        operation,
    }: {
        database: string;
        table: string;
        operation: RulesOperation | RulesOperationKey;
    }): boolean {
        const normalized = normalizeRulesOperation(operation);
        for (const [rulePath, entry] of Object.entries(this.config.normalizedRules)) {
            if (!isRulePathInTableScope(rulePath, database, table)) {
                continue;
            }
            const access = resolveAccessRule(entry, {}, normalized)?.access;
            if (!access || isDirectSafeScopeAccess(access)) {
                continue;
            }
            return true;
        }
        return false;
    }

    /**
     * Returns true when a table scoped rule explicitly denies access.
     *
     * テーブル配下ルールに明示的なdenyがある場合はtrueを返します。
     */
    hasScopedDeny({
        database,
        table,
        operation,
    }: {
        database: string;
        table: string;
        operation: RulesOperation | RulesOperationKey;
    }): boolean {
        const normalized = normalizeRulesOperation(operation);
        for (const [rulePath, entry] of Object.entries(this.config.normalizedRules)) {
            if (!isRulePathInTableScope(rulePath, database, table)) {
                continue;
            }
            const access = resolveAccessRule(entry, {}, normalized)?.access;
            if (access === "deny") {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns true when a database descendant rule requires server evaluation.
     *
     * データベース配下ルールにサーバー評価が必要な制約がある場合はtrueを返します。
     */
    hasDatabaseScopedRestriction({
        database,
        operation,
    }: {
        database: string;
        operation: RulesOperation | RulesOperationKey;
    }): boolean {
        const normalized = normalizeRulesOperation(operation);
        for (const [rulePath, entry] of Object.entries(this.config.normalizedRules)) {
            if (!isRulePathInDatabaseScope(rulePath, database)) {
                continue;
            }
            const access = resolveAccessRule(entry, {}, normalized)?.access;
            if (!access || isDirectSafeScopeAccess(access)) {
                continue;
            }
            return true;
        }
        return false;
    }
}

/**
 * Build a normalized rules path.
 *
 * 正規化されたrulesパスを生成します。
 */
export function buildRulesPath({ database, table, indexKey }: RulesPathArguments): string {
        return buildDatabaseRulesPath({ database, table, indexKey });
}

/**
 * Build a normalized database rules path.
 *
 * 正規化されたデータベースrulesパスを生成します。
 */
export function buildDatabaseRulesPath({ database, table, indexKey }: RulesPathArguments): string {
    return [
        encodeRulesPathSegment(database),
        table == null ? undefined : encodeRulesPathSegment(table),
        indexKey == null ? undefined : encodeRulesPathSegment(indexKey),
    ].filter((segment): segment is string => typeof segment === "string").join("/");
}

/**
 * Build a normalized storage rules path.
 *
 * 正規化されたストレージrulesパスを生成します。
 */
export function buildStorageRulesPath({ path }: { path: string }): string {
    return path.trim().split("/")
        .filter((segment) => segment.length > 0)
        .map(encodeRulesPathSegment)
        .join("/");
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
 * Expand operation aliases to concrete operations.
 *
 * 操作エイリアスを具体的な操作へ展開します。
 */
export function expandRulesOperation(operation: RulesOperationKey): RulesOperation[] {
    switch (operation) {
        case "read":
            return ["get"];
        case "write":
            return ["create", "update", "delete"];
        case "get":
        case "create":
        case "update":
        case "delete":
            return [operation];
    }
}

/**
 * Filter token targets by rules.
 *
 * rulesによりトークン対象をフィルタします。
 */
export async function filterAllowedScope({
    engine,
    database,
    scope,
    authentication,
}: {
    engine: RulesEngine;
    database: string;
    scope: RulesTokenTargetInput[];
    authentication?: WorkersAuthContext | undefined;
}): Promise<RulesTokenTargetInput[]> {
    const allowed: RulesTokenTargetInput[] = [];
    for (const item of scope) {
        const operations: RulesOperationKey[] = [];
        for (const operationKey of item.operations) {
            const expanded = expandRulesOperation(operationKey);
            const results = await Promise.all(expanded.map((operation) => {
                return engine.evaluate({
                    path: buildRulesPath({
                        database,
                        table: item.table,
                        indexKey: "*",
                    }),
                    target: "database",
                    operation,
                    authentication,
                });
            }));
            if (results.every((result) => result.allowed)) {
                operations.push(operationKey);
            }
        }
        if (operations.length > 0) {
            allowed.push({
                table: item.table,
                operations,
            });
        }
    }
    return allowed;
}

/**
 * Resolve database token access from rules.
 *
 * rulesからデータベーストークンアクセスを解決します。
 */
export async function resolveDatabaseTokenAccess({
    engine,
    database,
    operations,
    scope = [],
    authentication,
}: {
    engine: RulesEngine;
    database: string;
    operations?: RulesOperationKey[] | undefined;
    scope?: RulesTokenTargetInput[] | undefined;
    authentication?: WorkersAuthContext | undefined;
}): Promise<RulesDatabaseTokenAccess | undefined> {
    const path = buildDatabaseRulesPath({ database });
    const directRead = await engine.evaluate({
        path,
        target: "database",
        operation: "read",
        authentication,
        server: false,
    });
    const serverRead = directRead.allowed
        ? directRead
        : await engine.evaluate({
            path,
            target: "database",
            operation: "read",
            authentication,
            server: true,
        });
    if (!serverRead.allowed) {
        return undefined;
    }
    const directDatabaseWrite = await evaluateDatabaseWrite({
        engine,
        path,
        authentication,
        server: false,
    });
    const serverDatabaseWrite = directDatabaseWrite
        ? true
        : await evaluateDatabaseWrite({
            engine,
            path,
            authentication,
            server: true,
        });
    const scopes = await resolveScopeModes({
        engine,
        database,
        scope,
        authentication,
    });
    const readScopes = scopes.filter((item) => requiresRead(item.operations));
    const writeScopes = scopes.filter((item) => requiresWrite(item.operations));
    const requestedOperations = operations ?? [];
    const requestsDatabaseRead = requiresRead(requestedOperations);
    const requestsDatabaseWrite = requiresWrite(requestedOperations);
    const hasTargets = scope.length > 0;
    const restrictedDatabaseRead = !hasTargets && expandRulesOperation("read").some((operation) => {
        return engine.hasDatabaseScopedRestriction({
            database,
            operation,
        });
    });
    const restrictedDatabaseWrite = !hasTargets && expandRulesOperation("write").some((operation) => {
        return engine.hasDatabaseScopedRestriction({
            database,
            operation,
        });
    });
    const databaseReadMode = restrictedDatabaseRead
        ? serverRead.allowed ? "functions" : "none"
        : directRead.allowed ? "direct" : "functions";
    const databaseWriteMode = restrictedDatabaseWrite
        ? serverDatabaseWrite ? "functions" : "none"
        : directDatabaseWrite ? "direct" : serverDatabaseWrite ? "functions" : "none";
    const readMode = resolveOverallMode(
        readScopes.map((item) => item.readMode ?? "none"),
        !hasTargets && (requestedOperations.length === 0 || requestsDatabaseRead)
            ? databaseReadMode
            : "none",
    );
    let writeMode = resolveOverallMode(
        writeScopes.map((item) => item.writeMode ?? "none"),
        !hasTargets && (requestedOperations.length === 0 || requestsDatabaseWrite)
            ? databaseWriteMode
            : "none",
    );
    if (readMode === "functions" && writeMode === "direct") {
        writeMode = serverDatabaseWrite ? "functions" : "none";
    }
    const authorization = resolveTokenAuthorization(readMode, writeMode);
    return {
        authorization,
        readMode,
        writeMode,
        scopes,
    };
}

/**
 * Resolve database token authorization from rules.
 *
 * rulesからデータベーストークン権限を解決します。
 */
export async function resolveDatabaseTokenAuthorization({
    engine,
    database,
    authentication,
}: {
    engine: RulesEngine;
    database: string;
    authentication?: WorkersAuthContext | undefined;
}): Promise<RulesDatabaseTokenAuthorization | undefined> {
    const access = await resolveDatabaseTokenAccess({
        engine,
        database,
        authentication,
    });
    return access?.authorization;
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
    matches: {
        rulePath: string,
        entry: RulesEntry | undefined,
        params: Record<string, string>,
    }[],
): {
    rulePath: string,
    entry: RulesEntry,
    params: Partial<Record<RulesOperationKey, Record<string, string>>>,
} {
    const inherited: RulesEntry = {};
    const inheritedParams: Partial<Record<RulesOperationKey, Record<string, string>>> = {};
    let rulePath = matches[0]?.rulePath ?? "";
    for (const match of [...matches].reverse()) {
        if (!match.entry) {
            continue;
        }
        rulePath = match.rulePath;
        for (const [operation, access] of Object.entries(match.entry)) {
            inherited[operation as RulesOperationKey] = access;
            inheritedParams[operation as RulesOperationKey] = match.params;
        }
    }
    return {
        rulePath,
        entry: inherited,
        params: inheritedParams,
    };
}

function resolveAccessRule(
    entry: RulesEntry,
    params: Partial<Record<RulesOperationKey, Record<string, string>>>,
    operation: RulesOperation,
): {
    access: RulesAccessRule,
    params: Record<string, string>,
} | undefined {
    for (const operationKey of resolveRulesOperation(operation)) {
        const access = entry[operationKey];
        if (access) {
            return {
                access,
                params: params[operationKey] ?? {},
            };
        }
    }
    return undefined;
}

async function evaluateAccessRule(
    access: RulesAccessRule,
    authentication?: WorkersAuthContext | undefined,
    fetchDocument?: (() => Promise<Record<string, unknown> | null | undefined>) | undefined,
    params: Record<string, string> = {},
    server = false,
): Promise<boolean> {
    switch (access) {
        case "deny":
            return false;
        case "allow":
            return true;
        case "authenticated":
            return !!authentication?.uid;
        case "server":
            return server;
        default:
            break;
    }
    if ("server" in access && access.server === true && !server) {
        return false;
    }
    switch (access.type) {
        case "field":
        case "fieldMatch": {
            const uid = authentication?.uid;
            if (!uid || !fetchDocument) {
                return false;
            }
            const document = await fetchDocument();
            return document?.[access.field] === uid;
        }
        case "path": {
            const uid = authentication?.uid;
            return !!uid && params[access.param] === uid;
        }
    }
}

async function resolveScopeModes({
    engine,
    database,
    scope,
    authentication,
}: {
    engine: RulesEngine;
    database: string;
    scope: RulesTokenTargetInput[];
    authentication?: WorkersAuthContext | undefined;
}): Promise<RulesTokenTargetOutput[]> {
    const resolved: RulesTokenTargetOutput[] = [];
    for (const item of scope) {
        const readMode = requiresRead(item.operations)
            ? await resolveScopedOperationMode({
                engine,
                database,
                table: item.table,
                operation: "read",
                authentication,
            })
            : undefined;
        const writeMode = requiresWrite(item.operations)
            ? await resolveScopedOperationMode({
                engine,
                database,
                table: item.table,
                operation: "write",
                authentication,
            })
            : undefined;
        resolved.push({
            table: item.table,
            operations: item.operations,
            ...(readMode ? { readMode } : {}),
            ...(writeMode ? { writeMode } : {}),
        });
    }
    return resolved;
}

async function resolveScopedOperationMode({
    engine,
    database,
    table,
    operation,
    authentication,
}: {
    engine: RulesEngine;
    database: string;
    table: string;
    operation: RulesOperationKey;
    authentication?: WorkersAuthContext | undefined;
}): Promise<RulesAccessMode> {
    const path = buildRulesPath({
        database,
        table,
        indexKey: "*",
    });
    const expanded = expandRulesOperation(operation);
    const direct = await Promise.all(expanded.map((item) => engine.evaluate({
        path,
        target: "database",
        operation: item,
        authentication,
        server: false,
    })));
    const directAllowed = direct.every((result) => result.allowed);
    const restricted = expanded.some((item) => engine.hasScopedRestriction({
        database,
        table,
        operation: item,
    }));
    if (directAllowed && !restricted) {
        return "direct";
    }
    const denied = expanded.some((item) => engine.hasScopedDeny({
        database,
        table,
        operation: item,
    }));
    if (restricted && !denied) {
        return "functions";
    }
    const server = await Promise.all(expanded.map((item) => engine.evaluate({
        path,
        target: "database",
        operation: item,
        authentication,
        server: true,
    })));
    return server.every((result) => result.allowed) ? "functions" : "none";
}

function resolveOverallMode(
    scopedModes: RulesAccessMode[],
    fallback: RulesAccessMode,
): RulesAccessMode {
    if (scopedModes.length === 0) {
        return fallback;
    }
    if (scopedModes.every((mode) => mode === "direct")) {
        return "direct";
    }
    if (scopedModes.some((mode) => mode === "none")) {
        return "none";
    }
    return "functions";
}

function resolveTokenAuthorization(
    readMode: RulesAccessMode,
    writeMode: RulesAccessMode,
): RulesDatabaseTokenAuthorization | undefined {
    if (writeMode === "direct") {
        return "full-access";
    }
    if (readMode === "direct") {
        return "read-only";
    }
    return undefined;
}

function requiresRead(operations: RulesOperationKey[]): boolean {
    return operations.some((operation) => expandRulesOperation(operation).includes("get"));
}

function requiresWrite(operations: RulesOperationKey[]): boolean {
    return operations.some((operation) => {
        const expanded = expandRulesOperation(operation);
        return expanded.includes("create") || expanded.includes("update") || expanded.includes("delete");
    });
}

async function evaluateDatabaseWrite({
    engine,
    path,
    authentication,
    server,
}: {
    engine: RulesEngine;
    path: string;
    authentication?: WorkersAuthContext | undefined;
    server: boolean;
}): Promise<boolean> {
    const results = await Promise.all(
        expandRulesOperation("write").map((operation) => {
            return engine.evaluate({
                path,
                target: "database",
                operation,
                authentication,
                server,
            });
        }),
    );
    return results.every((result) => result.allowed);
}

function isRulePathInTableScope(
    rulePath: string,
    database: string,
    table: string,
): boolean {
    const segments = splitRulesPath(rulePath);
    if (segments.length <= 2) {
        return false;
    }
    return segmentMatches(segments[0], "database") &&
        segmentMatches(segments[1], database) &&
        segmentMatches(segments[2], table);
}

function isRulePathInDatabaseScope(
    rulePath: string,
    database: string,
): boolean {
    const segments = splitRulesPath(rulePath);
    if (segments.length <= 2) {
        return false;
    }
    return segmentMatches(segments[0], "database") &&
        segmentMatches(segments[1], database);
}

function segmentMatches(ruleSegment: string | undefined, value: string): boolean {
    if (!ruleSegment) {
        return false;
    }
    if (ruleSegment === "**") {
        return true;
    }
    return ruleSegment === "*" || !!matchNamedPathParamSegment(ruleSegment, value) || ruleSegment === value;
}

function isDirectSafeScopeAccess(access: RulesAccessRule): boolean {
    return access === "allow";
}

function splitRulesPath(path: string): string[] {
    if (path.length === 0 || path.startsWith("/") || path.endsWith("/")) {
        return [];
    }
    return path.split("/");
}

function normalizeEvaluationPath(input: RulesEvaluationInput): string {
    if (!input.target) {
        return input.path;
    }
    const path = input.path.trim().replace(/^\/+|\/+$/g, "");
    return `${input.target}/${path}`;
}

function encodeRulesPathSegment(segment: string): string {
    if (segment.length === 0 || segment.includes("/")) {
        throw new Error(`Invalid rules path segment: ${segment}`);
    }
    return segment;
}
