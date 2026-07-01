import {
  AuthenticationContext,
  RulesAccessRule,
  RulesConfig,
  RulesEntry,
  RulesOperation,
  RulesOperationKey,
  TursoTokenAccessMode,
  TursoTokenScopeInput,
  TursoTokenScopeOutput,
} from "./types";

export interface RulesEvaluationInput {
  path: string;
  operation: RulesOperation | RulesOperationKey;
  authentication?: AuthenticationContext | undefined;
  fetchDocument?: (() => Promise<Record<string, unknown> | null | undefined>) | undefined;
  server?: boolean | undefined;
}

export interface RulesEvaluationResult {
  allowed: boolean;
  rulePath?: string | undefined;
  access?: RulesAccessRule | undefined;
  params?: Record<string, string> | undefined;
}

export type TursoDatabaseTokenAuthorization = "read-only" | "full-access";

export interface TursoDatabaseTokenAccess {
  authorization?: TursoDatabaseTokenAuthorization | undefined;
  readMode: TursoTokenAccessMode;
  writeMode: TursoTokenAccessMode;
  scopes: TursoTokenScopeOutput[];
}

interface RulePathMatch {
  matched: boolean;
  rulePath: string;
  params: Record<string, string>;
  literalSegments: number;
  namedWildcardSegments: number;
  wildcardSegments: number;
  deepWildcardSegments: number;
  matchedSegments: number;
}

export class RulesEngine {
  constructor(config?: RulesConfig | undefined) {
    this.config = normalizeRulesConfig(config);
  }

  private readonly config: RulesConfig;

  async evaluate(input: RulesEvaluationInput): Promise<RulesEvaluationResult> {
    const operation = normalizeRulesOperation(input.operation);
    const matches = Object.keys(this.config.rules)
      .map((rulePath) => matchRulePath(rulePath, input.path))
      .filter((match) => match.matched)
      .sort(compareRulePathMatch);
    if (matches.length === 0) {
      return { allowed: false };
    }
    const resolved = resolveInheritedRule(matches.map((match) => ({
      rulePath: match.rulePath,
      entry: this.config.rules[match.rulePath],
      params: match.params,
    })));
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
    for (const [rulePath, entry] of Object.entries(this.config.rules)) {
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
    for (const [rulePath, entry] of Object.entries(this.config.rules)) {
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
}

export function createTursoRulesEngine(config?: RulesConfig | undefined): RulesEngine {
  return new RulesEngine(config);
}

export function buildRulesPath({
  database,
  table,
  indexKey,
}: {
  database: string;
  table: string;
  indexKey: string;
}): string {
  return [
    "database",
    encodePathSegment(database),
    "table",
    encodePathSegment(table),
    encodePathSegment(indexKey),
  ].join("/");
}

export function buildDatabaseRulesPath({
  database,
}: {
  database: string;
}): string {
  return [
    "database",
    encodePathSegment(database),
  ].join("/");
}

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

export async function filterAllowedScope({
  engine,
  database,
  scope,
  authentication,
}: {
  engine: RulesEngine;
  database: string;
  scope: TursoTokenScopeInput[];
  authentication?: AuthenticationContext | undefined;
}): Promise<TursoTokenScopeInput[]> {
  const allowed: TursoTokenScopeInput[] = [];
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
          operation,
          authentication,
        });
      }));
      if (results.every((result: RulesEvaluationResult) => result.allowed)) {
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

export async function resolveDatabaseTokenAccess({
  engine,
  database,
  scope = [],
  authentication,
}: {
  engine: RulesEngine;
  database: string;
  scope?: TursoTokenScopeInput[] | undefined;
  authentication?: AuthenticationContext | undefined;
}): Promise<TursoDatabaseTokenAccess | undefined> {
  const path = buildDatabaseRulesPath({ database });
  const directRead = await engine.evaluate({
    path,
    operation: "read",
    authentication,
    server: false,
  });
  const serverRead = directRead.allowed
    ? directRead
    : await engine.evaluate({
        path,
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
  const readMode = resolveOverallMode(
    readScopes.map((item) => item.readMode ?? "none"),
    scope.length === 0 ? directRead.allowed ? "direct" : "functions" : "none",
  );
  let writeMode = resolveOverallMode(
    writeScopes.map((item) => item.writeMode ?? "none"),
    scope.length === 0 ? directDatabaseWrite ? "direct" : serverDatabaseWrite ? "functions" : "none" : "none",
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

async function resolveScopeModes({
  engine,
  database,
  scope,
  authentication,
}: {
  engine: RulesEngine;
  database: string;
  scope: TursoTokenScopeInput[];
  authentication?: AuthenticationContext | undefined;
}): Promise<TursoTokenScopeOutput[]> {
  const resolved: TursoTokenScopeOutput[] = [];
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
  authentication?: AuthenticationContext | undefined;
}): Promise<TursoTokenAccessMode> {
  const path = buildRulesPath({
    database,
    table,
    indexKey: "*",
  });
  const expanded = expandRulesOperation(operation);
  const direct = await Promise.all(expanded.map((item) => engine.evaluate({
    path,
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
    operation: item,
    authentication,
    server: true,
  })));
  return server.every((result) => result.allowed) ? "functions" : "none";
}

function resolveOverallMode(
  scopedModes: TursoTokenAccessMode[],
  fallback: TursoTokenAccessMode,
): TursoTokenAccessMode {
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
  readMode: TursoTokenAccessMode,
  writeMode: TursoTokenAccessMode,
): TursoDatabaseTokenAuthorization | undefined {
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
  authentication?: AuthenticationContext | undefined;
  server: boolean;
}): Promise<boolean> {
  const results = await Promise.all(
    expandRulesOperation("write").map((operation) => {
      return engine.evaluate({
        path,
        operation,
        authentication,
        server,
      });
    }),
  );
  return results.every((result) => result.allowed);
}

export async function resolveDatabaseTokenAuthorization({
  engine,
  database,
  authentication,
}: {
  engine: RulesEngine;
  database: string;
  authentication?: AuthenticationContext | undefined;
}): Promise<TursoDatabaseTokenAuthorization | undefined> {
  const access = await resolveDatabaseTokenAccess({
    engine,
    database,
    authentication,
  });
  return access?.authorization;
}

function normalizeRulesConfig(config?: RulesConfig | undefined): RulesConfig {
  if (!config) {
    return {
      version: "1",
      rules: {
        "database/**": {
          read: "deny",
          write: "deny",
        },
      },
    };
  }
  if (typeof config.version !== "string" || !isRecord(config.rules)) {
    throw new Error("Invalid rules config.");
  }
  for (const path of Object.keys(config.rules)) {
    validateRulePath(path);
  }
  return config;
}

function matchRulePath(rulePath: string, requestPath: string): RulePathMatch {
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

function compareRulePathMatch(a: RulePathMatch, b: RulePathMatch): number {
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

function resolveRulesOperation(operation: RulesOperation): RulesOperationKey[] {
  switch (operation) {
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

async function evaluateAccessRule(
  access: RulesAccessRule,
  authentication?: AuthenticationContext | undefined,
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
    default:
      break;
  }
  if ("serverOnly" in access && access.serverOnly === true && !server) {
    return false;
  }
  switch (access.type) {
    case "serverOnly":
      return server;
    case "fieldMatch": {
      const uid = authentication?.uid;
      if (!uid || !fetchDocument) {
        return false;
      }
      const document = await fetchDocument();
      return document?.[access.field] === uid;
    }
    case "pathParamMatch": {
      const uid = authentication?.uid;
      return !!uid && params[access.param] === uid;
    }
  }
}

function validateRulePath(path: string): void {
  if (path.length === 0 || path.startsWith("/") || path.endsWith("/")) {
    throw new Error(`Invalid rule path: ${path}`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error(`Invalid rule path: ${path}`);
  }
  const paramNames = new Set<string>();
  for (const segment of segments) {
    if ((segment.startsWith("{") || segment.endsWith("}")) && !parseNamedPathParam(segment)) {
      throw new Error(`Invalid path parameter segment '${segment}' in rule path: ${path}`);
    }
    const paramName = parseNamedPathParam(segment);
    if (!paramName) {
      continue;
    }
    if (paramNames.has(paramName)) {
      throw new Error(`Duplicate path parameter '${paramName}' in rule path: ${path}`);
    }
    paramNames.add(paramName);
  }
  const deepWildcardIndex = segments.indexOf("**");
  if (deepWildcardIndex >= 0 && deepWildcardIndex !== segments.length - 1) {
    throw new Error(`'**' must be the last segment in rule path: ${path}`);
  }
}

function isRulePathInTableScope(
  rulePath: string,
  database: string,
  table: string,
): boolean {
  const segments = splitPath(rulePath);
  if (segments.length <= 4) {
    return false;
  }
  return segmentMatches(segments[0], "database") &&
    segmentMatches(segments[1], database) &&
    segmentMatches(segments[2], "table") &&
    segmentMatches(segments[3], table);
}

function segmentMatches(ruleSegment: string | undefined, value: string): boolean {
  if (!ruleSegment) {
    return false;
  }
  if (ruleSegment === "**") {
    return true;
  }
  return ruleSegment === "*" || !!parseNamedPathParam(ruleSegment) || ruleSegment === value;
}

function isDirectSafeScopeAccess(access: RulesAccessRule): boolean {
  return access === "allow";
}

function splitPath(path: string): string[] {
  if (path.length === 0 || path.startsWith("/") || path.endsWith("/")) {
    return [];
  }
  return path.split("/");
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

function encodePathSegment(segment: string): string {
  if (segment.length === 0 || segment.includes("/")) {
    throw new Error(`Invalid path segment: ${segment}`);
  }
  return segment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
