import {
  RulesAccessMode,
  RulesAccessRule,
  RulesConfig,
  RulesEntry,
  RulesOperation,
  RulesOperationAlias,
  RulesOperationKey,
  RulesTokenTargetInput,
  RulesTokenTargetOutput,
  WorkersAuthContext,
  WorkersOptions,
} from "@mathrunet/masamune_cloudflare";

export type TursoCrudMethod = "GET" | "POST" | "PUT" | "DELETE";

export type {
  RulesAccessRule,
  RulesConfig,
  RulesEntry,
  RulesOperation,
  RulesOperationAlias,
  RulesOperationKey,
};

export interface TursoDatabaseConnection {
  url: string;
  authToken?: string | undefined;
}

export interface TursoWorkersOptions extends WorkersOptions {
  databasePrefix?: string | undefined;
  organization?: string | undefined;
  group?: string | undefined;
  platformApiToken?: string | undefined;
  autoCreateDatabase?: boolean | undefined;
  autoCreateTable?: boolean | undefined;
  autoMigrateAddColumns?: boolean | undefined;
  maxTtlSeconds?: number | undefined;
}

export interface TursoRequestBody {
  database?: string | undefined;
  table?: string | undefined;
  indexKey?: string | undefined;
  where?: TursoWhereCondition[] | undefined;
  orderBy?: TursoOrderCondition[] | undefined;
  limit?: number | undefined;
  value?: Record<string, unknown> | undefined;
  count?: boolean | undefined;
}

export interface TursoWhereCondition {
  type?: string | undefined;
  key?: string | undefined;
  value?: unknown;
}

export interface TursoOrderCondition {
  key?: string | undefined;
  descending?: boolean | undefined;
}

export type TursoTokenAccessMode = RulesAccessMode;

export type TursoTokenScopeInput = RulesTokenTargetInput;

export type TursoTokenScopeOutput = RulesTokenTargetOutput;

export interface TursoTokenRequestBody {
  database?: string | undefined;
  operations?: RulesOperationKey[] | undefined;
  targets?: TursoTokenScopeInput[] | undefined;
  scope?: TursoTokenScopeInput[] | undefined;
  ttlSeconds?: number | undefined;
}

export type AuthenticationContext = WorkersAuthContext;
