import { FunctionsBase } from "./functions_base";
export { FunctionsOptions, SchedulerFunctionsOptions, PubsubFunctionsOptions, PathFunctionsOptions, RelationPathFunctionsOptions } from "./functions_base";

/**
 * Define Function data for FirebaseFunctions.
 * 
 * FirebaseFunctions用のFunctionのデータを定義します。
 */
export class FunctionsData extends FunctionsBase {
  build(region: string[]): Function {
    if (!this.func) {
      return () => { };
    }
    return this.func(
      region,
      this.options,
      this.data,
    );
  }
}
