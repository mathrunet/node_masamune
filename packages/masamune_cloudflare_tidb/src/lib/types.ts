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
  /**
   * Shared secret that allows a request to be evaluated as a server request.
   *
   * When omitted, every CRUD request is evaluated as a client request and
   * `server` scoped rules are always denied.
   *
   * リクエストをサーバーリクエストとして評価することを許可する共有シークレット。
   *
   * 未指定の場合、すべてのCRUDリクエストはクライアントリクエストとして評価され、
   * `server`指定のrulesは常に拒否されます。
   */
  serverAccessToken?: string | undefined;
  /**
   * Header name used to present [serverAccessToken].
   *
   * Defaults to `x-masamune-server-token`.
   *
   * [serverAccessToken]を提示するためのヘッダー名。
   *
   * 既定値は`x-masamune-server-token`です。
   */
  serverAccessHeader?: string | undefined;
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
  custom_endpoints?: Record<string, TidbDataServiceEndpoint> | undefined;
}

export interface TidbRequestBody {
  database?: string | undefined;
  table?: string | undefined;
  prefix?: string | undefined;
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
