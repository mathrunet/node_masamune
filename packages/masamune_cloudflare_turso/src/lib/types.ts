import { WorkersOptions } from "@mathrunet/masamune_cloudflare";

export type TursoCrudMethod = "GET" | "POST" | "PUT" | "DELETE";

export type RulesOperation = "get" | "create" | "update" | "delete";
export type RulesOperationAlias = "read" | "write";
export type RulesOperationKey = RulesOperation | RulesOperationAlias;

export type RulesAccessRule =
  | "deny"
  | "allow"
  | "authenticated"
  | {
    type: "fieldMatch";
    field: string;
  };

export type RulesEntry = Partial<Record<RulesOperationKey, RulesAccessRule>>;

export interface RulesConfig {
  version: string;
  rules: Record<string, RulesEntry>;
}

export interface TursoDatabaseConnection {
  url: string;
  authToken?: string | undefined;
}

export interface TursoTokenIssuerOptions {
  secret?: string | undefined;
  issuer?: string | undefined;
  audience?: string | undefined;
}

export interface TursoWorkersOptions extends Omit<WorkersOptions, "rules"> {
  url?: string | undefined;
  authToken?: string | undefined;
  databases?: Record<string, TursoDatabaseConnection> | undefined;
  defaultDatabase?: string | undefined;
  databaseNamePrefix?: string | undefined;
  organizationName?: string | undefined;
  groupName?: string | undefined;
  platformApiToken?: string | undefined;
  autoCreateDatabase?: boolean | undefined;
  autoCreateTable?: boolean | undefined;
  autoMigrateAddColumns?: boolean | undefined;
  maxTtlSeconds?: number | undefined;
  rules?: RulesConfig | undefined;
  tokenIssuer?: TursoTokenIssuerOptions | undefined;
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

export interface TursoTokenScopeInput {
  table: string;
  operations: RulesOperationKey[];
}

export interface TursoTokenRequestBody {
  database?: string | undefined;
  scope?: TursoTokenScopeInput[] | undefined;
  ttlSeconds?: number | undefined;
}

export interface AuthenticationContext {
  uid?: string | undefined;
  token?: unknown;
}
