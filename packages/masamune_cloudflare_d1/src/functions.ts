import { D1Client } from "./lib/client";
import { drainVectors } from "./lib/vector";
import { WorkersData, WorkersOptions, ScheduleProcessWorkdersBase } from "@mathrunet/masamune_cloudflare";
import { D1WorkersOptions } from "./lib/types";
import { registerD1 } from "./lib/route";

/** D1直結のCRUD。DDLはkatana migrateで管理する。 */
export const Functions = {
  d1: (options: D1WorkersOptions) => new WorkersData({
    path: "/d1",
    func: (hono, resolved) => registerD1(hono, resolved as D1WorkersOptions),
    options: options as unknown as WorkersOptions,
  }),
} as const;

/** cronからoutboxを回収する。複数起動しても世代別IDによって冪等。 */
export class D1VectorSchedule extends ScheduleProcessWorkdersBase {
  constructor(private readonly config: D1WorkersOptions) { super(); }
  async process(_event: Parameters<ScheduleProcessWorkdersBase["process"]>[0], rawEnv: unknown, _ctx: Parameters<ScheduleProcessWorkdersBase["process"]>[2]): Promise<void> {
    const env = rawEnv as Record<string, unknown>;
    const databases = [...new Set(this.config.schemaManifest.tables.filter(t => t.vectors?.length).map(t => t.database))];
    for(const database of databases) {
      if((env.FLAVOR === "dev") !== database.startsWith("dev_")) continue;
      const binding = env[this.config.bindings[database]] as import("./lib/types").D1Binding;
      if(!binding) throw new Error("D1 bindingがありません。");
      const client = new D1Client(binding.withSession("first-primary"), this.config.schemaManifest, database);
      const result = await drainVectors(client, env);
      if(result.failed) throw new Error(`Vectorize再試行失敗: ${result.failed}件`);
    }
  }
}
