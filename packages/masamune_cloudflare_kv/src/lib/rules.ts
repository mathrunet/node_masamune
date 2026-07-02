import {
  isRulesConfig,
  RulesEngine,
  type RulesConfig,
  type WorkersRulesOption,
} from "@mathrunet/masamune_cloudflare";

export {
  normalizeHttpMethodToRulesOperation,
  normalizeRulesOperation,
  RulesEngine,
} from "@mathrunet/masamune_cloudflare";

export function createCloudflareKvRulesEngine(
  config?: RulesConfig | WorkersRulesOption | null | undefined,
): RulesEngine {
  return new RulesEngine(isRulesConfig(config) ? config : {
    version: "1",
    rules: {
      "**": {
        read: "deny",
        write: "deny",
      },
    },
  });
}
