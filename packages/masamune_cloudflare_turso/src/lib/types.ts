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
  /** APIで確認した所属グループ。 */
  group?: string | undefined;
  /** APIで確認したprimary region。 */
  primaryRegion?: string | undefined;
  authToken?: string | undefined;
  authTokenExpiresAt?: number | undefined;
  created?: boolean | undefined;
}

/** 作成先の候補。国コードを大陸コードより優先して照合します。 */
export interface TursoGroup {
  name: string;
  countries?: readonly string[] | undefined;
  continents?: readonly string[] | undefined;
}

/** HTTP外の呼び出しでは地域情報・認証情報を省略できます。 */
export interface TursoGroupContext {
  requestedGroup?: string | undefined;
  country?: string | undefined;
  continent?: string | undefined;
  authentication?: WorkersAuthContext | undefined;
}

export interface TursoGroupResolverContext extends TursoGroupContext {
  database: string;
  databasePrefix?: string | undefined;
  groups: readonly TursoGroup[];
}

export interface TursoWorkersOptions extends WorkersOptions {
  /** 既存DB専用の環境別許可表。設定時は未登録DB・クライアントprefix・自動DB作成を拒否します。 */
  databaseBindings?: Partial<Record<"dev" | "prod", Readonly<Record<string, {
    database: string;
    group: string;
  }>>>> | undefined;
  databasePrefix?: string | undefined;
  organization?: string | undefined;
  group?: string | undefined;
  /** 利用可能グループ。既定groupを省略した場合は先頭をfallbackにします。 */
  groups?: readonly TursoGroup[] | undefined;
  /** 新規DBの配置のみ決定します。既存DBでは呼び出しません。 */
  resolveGroup?: ((context: TursoGroupResolverContext) =>
    string | undefined | Promise<string | undefined>) | undefined;
  platformApiToken?: string | undefined;
  autoCreateDatabase?: boolean | undefined;
  autoCreateTable?: boolean | undefined;
  autoMigrateAddColumns?: boolean | undefined;
  schemaManifest?: TursoSchemaManifest | undefined;
  maxTtlSeconds?: number | undefined;
  serverTokenTtlSeconds?: number | undefined;
  /**
   * Shared secret that marks a request as a trusted server request.
   *
   * When this value (or the `TURSO_SERVER_ACCESS_TOKEN` environment variable)
   * is set, or when [databaseBindings] is set, rules are evaluated with
   * `server: true` only for requests that present the same value in
   * [serverAccessHeader]. Without a configured token, requests to
   * [databaseBindings] are always evaluated as client requests.
   *
   * Without both this value and [databaseBindings], the legacy behavior is
   * kept and every request is evaluated with `server: true`.
   */
  serverAccessToken?: string | undefined;
  /**
   * Header name that carries [serverAccessToken]. Defaults to `x-masamune-server-token`.
   * The `TURSO_SERVER_ACCESS_HEADER` environment variable takes precedence.
   */
  serverAccessHeader?: string | undefined;
  /**
   * Logical database names that this Worker must never create, connect to, or issue tokens for.
   *
   * Use this on the edge Worker to keep the logical name of a shared database
   * served by the region Worker (e.g. `["shared"]`) from being auto-created as
   * a per-user database. Requests for these names fail with HTTP 400
   * `{ "error": "reserved_database" }`.
   */
  reservedDatabases?: readonly string[] | undefined;
}

export interface TursoSchemaColumn {
  name: string;
  type: string;
  vectorMetric?: "cosine" | "euclidean";
}

export interface TursoSchemaTable {
  database: string;
  table: string;
  columns: TursoSchemaColumn[];
}

export interface TursoSchemaManifest {
  version: string;
  tables: Record<string, TursoSchemaTable>;
}

export interface TursoRequestBody {
  nearest?: { key: string; value: unknown };
  /** 未作成DBの配置希望。既存DBの所属先は変更しません。 */
  group?: string | undefined;
  database?: string | undefined;
  table?: string | undefined;
  prefix?: string | undefined;
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
  group?: string | undefined;
  database?: string | undefined;
  prefix?: string | undefined;
  operations?: RulesOperationKey[] | undefined;
  targets?: TursoTokenScopeInput[] | undefined;
  scope?: TursoTokenScopeInput[] | undefined;
  ttlSeconds?: number | undefined;
}

export type AuthenticationContext = WorkersAuthContext;
