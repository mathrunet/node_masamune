import {
  RulesConfig,
  RulesEntry,
  RulesOperation,
  RulesOperationAlias,
  RulesOperationKey,
  WorkersAuthContext,
  WorkersOptions,
} from "@mathrunet/masamune_cloudflare";
import type { MasamuneVectorField, MasamuneVectorIndex } from "@mathrunet/masamune_cloudflare";

export type {
  RulesConfig,
  RulesEntry,
  RulesOperation,
  RulesOperationAlias,
  RulesOperationKey,
};

export interface CloudflareKvWorkersOptions extends WorkersOptions {
  bindingName?: string | undefined;
  coordinatorBinding?: string | undefined;
  vectors?: KvVectorField[] | undefined;
  serverAccessToken?: string | undefined;
  serverAccessHeader?: string | undefined;
}

export interface KvVectorField extends MasamuneVectorField {
  /** 対象key prefix。空文字は全documentを対象にする。 */
  prefix?: string;
}

export type VectorIndex = MasamuneVectorIndex;

export interface CloudflareKvRequestBody {
  value?: Record<string, unknown> | undefined;
  nearest?: { key: string; value: unknown } | undefined;
  limit?: number | undefined;
}

export interface CloudflareKvNamespace {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list?(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{ keys: { name: string }[]; cursor?: string; list_complete: boolean }>;
}

export interface KvVectorCoordinatorNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export type AuthenticationContext = WorkersAuthContext;
