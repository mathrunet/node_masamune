import type { WorkersOptions, WorkersAuthContext } from "@mathrunet/masamune_cloudflare";
export type { RulesConfig } from "@mathrunet/masamune_cloudflare";
export type AuthenticationContext = WorkersAuthContext;
export type D1CrudMethod = "GET" | "POST" | "PUT" | "DELETE";
export interface SchemaColumn { name: string; sqlType: string; nullable: boolean }
export interface SchemaTable { database: string; table: string; columns: SchemaColumn[]; primaryKey: string[]; indexes?: { name: string; columns: string[]; unique: boolean }[]; vectorFields: string[]; vectors?: VectorField[] }
export interface SchemaManifest { version: "1"; dialect: "sqlite"; sourceHash?: string; tables: SchemaTable[] }
/** D1のbinding API。Node依存やSDKをWorkerへ持ち込まない。 */
export interface D1Result { success: boolean; results?: Record<string, unknown>[]; meta?: Record<string, unknown> }
export interface D1Statement { bind(...values: unknown[]): D1Statement; all(): Promise<D1Result> }
export interface D1Session { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<D1Result[]>; getBookmark(): string | null }
export interface D1Binding { withSession(bookmark?: string): D1Session }
export interface D1WorkersOptions extends WorkersOptions {
  schemaManifest: SchemaManifest;
  /** 物理論理名→binding名。リクエストからbinding名は受け取らない。 */
  bindings: Record<string, string>;
  databasePrefix?: string;
  serverAccessToken?: string;
  serverAccessHeader?: string;
  maxScanRows?: number;
}
export interface D1WhereCondition { type?: string; key?: string; value?: unknown }
export interface D1OrderCondition { key?: string; descending?: boolean }
export interface D1RequestBody {
  database?: string; table?: string; prefix?: string; indexKey?: string;
  where?: D1WhereCondition[]; orderBy?: D1OrderCondition[]; limit?: number;
  nearest?: { key: string; value: unknown };
  value?: Record<string, unknown>; count?: boolean; bookmark?: string;
}
export type CrudRequest = D1RequestBody & { database: string; table: string };

/** Vectorizeは検索index。ベクトルの正本はD1 JSONカラム。 */
export interface VectorField { field: string; dimensions: number; metric: "cosine" | "euclidean" | "dot-product"; binding: string }
export interface VectorIndex {
  upsert(values: { id: string; values: number[]; namespace: string }[]): Promise<{ mutationId: string }>;
  deleteByIds(ids: string[]): Promise<{ mutationId: string }>;
  query(values: number[], options: { topK: number; namespace: string; returnMetadata: "none"; returnValues: false }): Promise<{ matches: { id: string; score: number }[] }>;
}
