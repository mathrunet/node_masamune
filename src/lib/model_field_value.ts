
/**
 * Class for generating values for `ModelFieldValue` in katana_model.
 * 
 * katana_modelの`ModelFieldValue`用の値を生成するためのクラス。
 */
export class ModelFieldValue {
    /**
     * Generates text data for Like search.
     * 
     * Like検索用のテキストデータを生成します。
     * 
     * @param {string} text
     * Text to be searched.
     * 
     * 検索対象のテキスト。
     *  
     * @returns 
     */
    static searchable({
        text,
    }: {
        text: string,
    }) {
        const res: { [key: string]: any } = {};
        const search: { [key: string]: boolean } = {};
        text.toLowerCase().replace(/\./g, "").toHankakuNumericAndAlphabet().toZenkakuKatakana().toKatakana().splitByCharacterAndBigram().forEach((e) => {
            const trimed = e.trim();
            if (trimed.length <= 0) {
                return;
            }
            search[trimed] = true;
        });
        res["@search"] = search;
        return res;
    }
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