import { FunctionsBase } from "./functions_base";

/**
 * Define Function data for FirebaseFunctions.
 * 
 * FirebaseFunctions用のFunctionのデータを定義します。
 */
export class FunctionsData extends FunctionsBase {
  /**
   * Define Function data for FirebaseFunctions.
   * 
   * FirebaseFunctions用のFunctionのデータを定義します。
   * 
   * @param id 
   * Describe the method names used in Functions.
   * 
   * Functionsで利用されるメソッド名を記述します。
   * 
   * @param func 
   * Specify the actual contents of the process.
   * 
   * 実際の処理の中身を指定します。
   * 
   * @param data
   * Specify the data to be passed to the process.
   * 
   * 処理に渡すデータを指定します。
   */
  constructor(
    readonly id: string,
    readonly func: (region: string[], timeoutSeconds: number, data: { [key: string]: string }) => Function,
    readonly timeoutSeconds: number = 60,
    readonly data: { [key: string]: string } = {},
  ) {
    super();
  }

  build(
    region: string[],
    data: { [key: string]: string; },
  ): Function {
    return this.func(region, this.timeoutSeconds, data);
  }
}
