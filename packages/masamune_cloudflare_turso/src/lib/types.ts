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
      type: "serverOnly";
    }
  | {
      type: "fieldMatch";
      field: string;
      serverOnly?: boolean | undefined;
    }
  | {
      type: "pathParamMatch";
      param: string;
      serverOnly?: boolean | undefined;
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

export interface TursoWorkersOptions extends Omit<WorkersOptions, "rules"> {
  databaseNamePrefix?: string | undefined;
  organizationName?: string | undefined;
  groupName?: string | undefined;
  platformApiToken?: string | undefined;
  autoCreateDatabase?: boolean | undefined;
  autoCreateTable?: boolean | undefined;
  autoMigrateAddColumns?: boolean | undefined;
  maxTtlSeconds?: number | undefined;
  rules?: RulesConfig | undefined;
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

export type TursoTokenAccessMode = "none" | "functions" | "direct";

export interface TursoTokenScopeOutput extends TursoTokenScopeInput {
  readMode?: TursoTokenAccessMode | undefined;
  writeMode?: TursoTokenAccessMode | undefined;
}

export interface TursoTokenRequestBody {
  database?: string | undefined;
  operations?: RulesOperationKey[] | undefined;
  targets?: TursoTokenScopeInput[] | undefined;
  scope?: TursoTokenScopeInput[] | undefined;
  ttlSeconds?: number | undefined;
}

export interface AuthenticationContext {
  uid?: string | undefined;
  token?: unknown;
}
