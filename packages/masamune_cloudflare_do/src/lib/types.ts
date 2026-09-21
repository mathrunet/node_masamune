import type { WorkersOptions, WorkersAuthContext } from "@mathrunet/masamune_cloudflare";
export type { RulesConfig } from "@mathrunet/masamune_cloudflare";
export type AuthenticationContext = WorkersAuthContext;
export type DoCrudMethod = "GET" | "POST" | "PUT" | "DELETE";
export interface SchemaColumn { name: string; sqlType: string; nullable: boolean }
export interface VectorField { field: string; dimensions: number; metric: "cosine" | "euclidean" | "dot-product"; binding: string }
export interface VectorIndex {
  upsert(values: { id: string; values: number[]; namespace: string }[]): Promise<{ mutationId: string }>;
  deleteByIds(ids: string[]): Promise<{ mutationId: string }>;
  query(values: number[], options: { topK: number; namespace: string; returnMetadata: "none"; returnValues: false }): Promise<{ matches: { id: string; score: number }[] }>;
}
export interface SchemaTable { database: string; table: string; columns: SchemaColumn[]; primaryKey: string[]; indexes?: { name: string; columns: string[]; unique: boolean }[]; vectorFields: string[]; vectors?: VectorField[] }
export interface SchemaManifest { version: "1"; dialect: "sqlite"; sourceHash?: string; tables: SchemaTable[] }
export interface DoWhereCondition { type?: string; key?: string; value?: unknown }
export interface DoOrderCondition { key?: string; descending?: boolean }
export interface DoRequestBody {
  database?: string; table?: string; prefix?: string; indexKey?: string;
  where?: DoWhereCondition[]; orderBy?: DoOrderCondition[]; limit?: number;
  nearest?: { key: string; value: unknown };
  value?: Record<string, unknown>; count?: boolean; bookmark?: string;
}
export type CrudRequest = DoRequestBody & { database: string; table: string };

export interface DoStorage {
  setAlarm?(time: number): Promise<void>;
  sql: { exec(sql: string, ...values: unknown[]): { toArray(): Record<string, unknown>[] } };
  transactionSync<T>(callback: () => T): T;
}
export interface DoIdentity { environment: string; database: string; userId: string; topic?: string }
/** generationはシャード構成を変更する度に更新する。データDOのキーは変わらない。 */
export interface SharedHubConfig { binding: string; shards: number; generation: string }
export interface SharedHubOptions extends SharedHubConfig {
  authorize: (context: import("hono").Context, scope: {topic: string; database: string; table: string; method: DoCrudMethod}) => boolean | Promise<boolean>;
}
export interface DoRevision { version: string; database: string; before: SchemaManifest | null; after: SchemaManifest; sql: string[]; hash: string }
export interface DoConfig { shared?: SharedHubConfig; schemaManifest: SchemaManifest; revisions: DoRevision[]; maxScanRows?: number; source?: (identity: DoIdentity) => MigrationSource | undefined }
export interface MigrationSource {
  /** 全書込み経路を遮断した永続epoch。各読み取りでも同じ遮断を照合する。 */
  seal(): Promise<string>;
  page(table: string, after: string, limit: number, epoch: string): Promise<Record<string, unknown>[]>;
  document(table: string, id: string, epoch: string): Promise<Record<string, unknown> | undefined>;
}
export interface DoNamespace { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } }
export interface DurableObjectWorkersOptions extends WorkersOptions { shared?: SharedHubOptions; binding: string; databases: string[]; serverAccessToken?: string; serverAccessHeader?: string }
