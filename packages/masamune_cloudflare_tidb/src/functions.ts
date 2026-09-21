import { WorkersData, WorkersOptions } from "@mathrunet/masamune_cloudflare";
import { TidbWorkersOptions } from "./lib/types";
import { registerDirectTidb } from "./lib/direct_route";

/** TiDB直結のCRUD。DDLはkatana migrateで管理する。 */
export const Functions = {
  tidb: (options: TidbWorkersOptions) => new WorkersData({
    path: "/tidb",
    func: (hono, resolved) => registerDirectTidb(hono, resolved as TidbWorkersOptions),
    options: options as unknown as WorkersOptions,
  }),
} as const;
