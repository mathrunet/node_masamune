import {
  AuthenticationContext,
  RulesAccessRule,
  RulesConfig,
  RulesEntry,
  RulesOperation,
  RulesOperationKey,
  TursoTokenScopeInput,
} from "./types";

export interface RulesEvaluationInput {
  path: string;
  operation: RulesOperation | RulesOperationKey;
  authentication?: AuthenticationContext | undefined;
  fetchDocument?: (() => Promise<Record<string, unknown> | null | undefined>) | undefined;
}

export interface RulesEvaluationResult {
  allowed: boolean;
  rulePath?: string | undefined;
  access?: RulesAccessRule | undefined;
}

interface RulePathMatch {
  matched: boolean;
  rulePath: string;
  literalSegments: number;
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
    })));
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
  let literalSegments = 0;
  let wildcardSegments = 0;
  let deepWildcardSegments = 0;
  for (let i = 0; i < ruleSegments.length; i++) {
    const ruleSegment = ruleSegments[i];
    if (ruleSegment === "**") {
      deepWildcardSegments = 1;
      return {
        matched: true,
        rulePath,
        literalSegments,
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
    literalSegments,
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
  if (a.wildcardSegments !== b.wildcardSegments) {
    return a.wildcardSegments - b.wildcardSegments;
  }
  if (a.matchedSegments !== b.matchedSegments) {
    return b.matchedSegments - a.matchedSegments;
  }
  return a.rulePath.localeCompare(b.rulePath);
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

function validateRulePath(path: string): void {
  if (path.length === 0 || path.startsWith("/") || path.endsWith("/")) {
    throw new Error(`Invalid rule path: ${path}`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error(`Invalid rule path: ${path}`);
  }
  const deepWildcardIndex = segments.indexOf("**");
  if (deepWildcardIndex >= 0 && deepWildcardIndex !== segments.length - 1) {
    throw new Error(`'**' must be the last segment in rule path: ${path}`);
  }
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
    literalSegments: 0,
    wildcardSegments: 0,
    deepWildcardSegments: 0,
    matchedSegments: 0,
  };
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
