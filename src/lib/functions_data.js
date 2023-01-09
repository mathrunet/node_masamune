"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FunctionsData = void 0;
/**
 * Define Function data for FirebaseFunctions.
 *
 * FirebaseFunctions用のFunctionのデータを定義します。
 */
class FunctionsData {
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
    constructor(id, func) {
        this.id = id;
        this.func = func;
    }
}
exports.FunctionsData = FunctionsData;
