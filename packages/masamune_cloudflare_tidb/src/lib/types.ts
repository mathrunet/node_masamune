import {
  RulesAccessRule,
  RulesConfig,
  RulesEntry,
  RulesOperation,
  RulesOperationAlias,
  RulesOperationKey,
  WorkersAuthContext,
  WorkersOptions,
} from "@mathrunet/masamune_cloudflare";

export type TidbCrudMethod = "GET" | "POST" | "PUT" | "DELETE";

export type {
  RulesAccessRule,
  RulesConfig,
  RulesEntry,
  RulesOperation,
  RulesOperationAlias,
  RulesOperationKey,
};

export interface TidbDatabaseConnection {
  url: string;
  database: string;
  host: string;
  port: number;
}

export interface TidbWorkersOptions extends WorkersOptions {
  databasePrefix?: string | undefined;
  connectionUrl?: string | undefined;
  autoCreateTable?: boolean | undefined;
  autoMigrateAddColumns?: boolean | undefined;
}

export interface TidbRequestBody {
  database?: string | undefined;
  table?: string | undefined;
  indexKey?: string | undefined;
  where?: TidbWhereCondition[] | undefined;
  orderBy?: TidbOrderCondition[] | undefined;
  limit?: number | undefined;
  value?: Record<string, unknown> | undefined;
  count?: boolean | undefined;
}

export interface TidbWhereCondition {
  type?: string | undefined;
  key?: string | undefined;
  value?: unknown;
}

export interface TidbOrderCondition {
  key?: string | undefined;
  descending?: boolean | undefined;
}

export type AuthenticationContext = WorkersAuthContext;
