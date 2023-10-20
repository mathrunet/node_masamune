
/**
 * Class for generating values for `ModelFieldValue` in katana_model.
 * 
 * katana_modelの`ModelFieldValue`用の値を生成するためのクラス。
 */
export class ModelFieldValue {
    /**
     * Class for generating data for `ModelCounter`.
     * 
     * `ModelCounter`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {number} value
     * Data value.
     * 
     * データの値。
     * 
     * @param {number} increment
     * Increment value.
     * 
     * インクリメントする値。
     * 
     * @returns { [key: string]: any }
     * Data for `ModelCounter`.
     * 
     * `ModelCounter`用のデータ。
     */
    static modelCounter({
        key, value, increment,
    }: {
        key: string, value: number, increment?: number | undefined, 
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        res[key] = value;
        res[`#${key}`] = {
            "@increment": increment ?? 0,
            "@target": key,
            "@type": "ModelCounter",
            "@value": value,
        };
        return res;
    }
}