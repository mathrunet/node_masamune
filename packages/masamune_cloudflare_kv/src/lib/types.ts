import {
  RulesConfig,
  RulesEntry,
  RulesOperation,
  RulesOperationAlias,
  RulesOperationKey,
  WorkersAuthContext,
  WorkersOptions,
} from "@mathrunet/masamune_cloudflare";

export type {
  RulesConfig,
  RulesEntry,
  RulesOperation,
  RulesOperationAlias,
  RulesOperationKey,
};

export interface CloudflareKvWorkersOptions extends WorkersOptions {
  bindingName?: string | undefined;
}

export interface CloudflareKvRequestBody {
  value?: Record<string, unknown> | undefined;
}

export type AuthenticationContext = WorkersAuthContext;
