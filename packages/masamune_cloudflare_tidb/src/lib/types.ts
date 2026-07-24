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
export type TidbConnectionMode = "direct" | "data-service";

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
  mode?: TidbConnectionMode | undefined;
  dataServiceAppId?: string | undefined;
  dataServiceRegion?: string | undefined;
  dataServiceBaseUrl?: string | undefined;
  dataServicePublicKey?: string | undefined;
  dataServicePrivateKey?: string | undefined;
  dataServiceManifest?: TidbDataServiceManifest | undefined;
  maxScanRows?: number | undefined;
  autoCreateTable?: boolean | undefined;
  autoMigrateAddColumns?: boolean | undefined;
}

export type TidbDataServiceOperation =
  | "get"
  | "list"
  | "count"
  | "upsert"
  | "update"
  | "delete";

export interface TidbDataServiceEndpoint {
  path: string;
  method: "GET" | "POST";
}

export interface TidbDataServiceTableManifest {
  database: string;
  table: string;
  columns: string[];
  endpoints: Partial<
    Record<TidbDataServiceOperation, TidbDataServiceEndpoint>
  >;
}

export interface TidbDataServiceManifest {
  version: "1";
  tables: Record<string, TidbDataServiceTableManifest>;
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
