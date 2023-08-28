

/**
 * Define Function data for FirebaseFunctions.
 * 
 * Write code to generate FirebaseFunctions at `build`.
 * 
 * FirebaseFunctions用のFunctionのデータを定義を行うためのベースクラス。
 * 
 * `build`にてFirebaseFunctionsを生成するためのコードを記述します。
 */
export abstract class FunctionsBase {
    /**
     * Define Function data for FirebaseFunctions.
     * 
     * Write code to generate FirebaseFunctions at `build`.
     * 
     * FirebaseFunctions用のFunctionのデータを定義を行うためのベースクラス。
     * 
     * `build`にてFirebaseFunctionsを生成するためのコードを記述します。
     */
    constructor() { }

    /**
     * @param id 
     * Describe the method names used in Functions.
     * 
     * Functionsで利用されるメソッド名を記述します。
     */
    abstract id: string;

    /**
     * Specify the data to be passed to the process.
     * 
     * 処理に渡すデータを指定します。
     */
    abstract data: { [key: string]: string };

    /**
     * Write code to generate FirebaseFunctions.
     * 
     * FirebaseFunctionsを生成するためのコードを記述します。
     */
    abstract build(region: string[], data: { [key: string]: string }):  Function;
}