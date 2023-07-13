/**
 * Define Function data for FirebaseFunctions.
 * 
 * FirebaseFunctions用のFunctionのデータを定義します。
 */
export class FunctionsData {
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
   */
  constructor(readonly id: string, readonly func: (region: string[], data: { [key: string]: string }) => Function, readonly data: { [key: string]: string } = {}) {}
}
