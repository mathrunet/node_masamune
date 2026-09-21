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

/** SQL資格情報はWorkerだけに保持し、共通manifestのtableのみ公開する。 */
export interface TidbWorkersOptions extends WorkersOptions {
  host?: string; username?: string; password?: string;
  schemaManifest: import("./direct_client").SchemaManifest;
  databasePrefix?: string; serverAccessToken?: string; serverAccessHeader?: string;
  maxScanRows?: number; timeoutMs?: number;
}

export interface TidbRequestBody {
  nearest?: { key: string; value: unknown };
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
