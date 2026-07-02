import {
  isRulesConfig,
  RulesEngine,
  type RulesConfig,
  type RulesDatabaseTokenAccess,
  type RulesDatabaseTokenAuthorization,
  type WorkersRulesOption,
} from "@mathrunet/masamune_cloudflare";

export {
  buildDatabaseRulesPath,
  buildRulesPath,
  expandRulesOperation,
  filterAllowedScope,
  normalizeHttpMethodToRulesOperation,
  normalizeRulesOperation,
  resolveDatabaseTokenAccess,
  resolveDatabaseTokenAuthorization,
  RulesEngine,
} from "@mathrunet/masamune_cloudflare";

export type TidbDatabaseTokenAuthorization = RulesDatabaseTokenAuthorization;
export type TidbDatabaseTokenAccess = RulesDatabaseTokenAccess;

export function createTidbRulesEngine(
  config?: RulesConfig | WorkersRulesOption | null | undefined,
): RulesEngine {
  return new RulesEngine(isRulesConfig(config) ? config : {
    version: "1",
    rules: {
      "database/**": {
        read: "deny",
        write: "deny",
      },
    },
  });
}
