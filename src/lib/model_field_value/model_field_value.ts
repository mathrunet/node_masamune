
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
        text.toLowerCase().replace(/\./g, "").toHankakuNumericAndAlphabet().toZenkakuKatakana().toKatakana().removeOnlyEmoji().splitByCharacterAndBigram().forEach((e) => {
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

    /**
     * Class for generating data for `ModelTimestamp`.
     * 
     * `ModelTimestamp`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {Date} date
     * Date and time.
     * 
     * 日時。
     * 
     * @returns { [key: string]: any }
     * Data for `ModelCounter`.
     * 
     * `ModelCounter`用のデータ。
     */
    static modelTimestamp({
        key, date,
    }: {
        key: string, date?: Date | undefined, 
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        date ??= new Date();
        res[key] = date;
        res[`#${key}`] = {
            "@time": date.getTime(),
            "@target": key,
            "@type": "ModelTimestamp",
        };
        return res;
    }
    /**
     * Class for generating data for `ModelDate`.
     * 
     * `ModelDate`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {Date} date
     * Date and time.
     * 
     * 日時。
     * 
     * @returns { [key: string]: any }
     * Data for `ModelDate`.
     * 
     * `ModelDate`用のデータ。
     */
    static modelDate({
        key, date,
    }: {
        key: string, date?: Date | undefined,
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        date ??= new Date();
        date.setHours(0, 0, 0, 0);
        res[key] = date;
        res[`#${key}`] = {
            "@time": date.getTime(),
            "@target": key,
            "@type": "ModelDate",
        };
        return res;
    }
    /**
     * Class for generating data for `ModelLocale`.
     * 
     * `ModelLocale`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {string} language
     * Language.
     * 
     * 言語。
     * 
     * @param {string} country
     * Country.
     * 
     * 国。
     * 
     * @returns { [key: string]: any }
     * Data for `ModelLocale`.
     * 
     * `ModelLocale`用のデータ。
     */
    static modelLocale({
        key, language, country,
    }: {
        key: string, language: string, country: string,
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        res[key] = `${language}_${country}`;
        res[`#${key}`] = {
            "@country": country,
            "@language": language,
            "@target": key,
            "@type": "ModelLocale",
        };
        return res;
    }
    /**
     * Class for generating data for `ModelUri`.
     * 
     * `ModelUri`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {string} uri
     * URI.
     * 
     * @returns { [key: string]: any }
     * Data for `ModelUri`.
     * 
     * `ModelUri`用のデータ。
     */
    static modelUri({
        key, uri,
    }: {
        key: string, uri: string,
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        res[key] = uri;
        res[`#${key}`] = {
            "@target": key,
            "@type": "ModelUri",
            "@uri": uri,
        };
        return res;
    }
    /**
     * Class for generating data for `ModelImageUri`.
     * 
     * `ModelImageUri`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {string} uri
     * URI.
     * 
     * @returns { [key: string]: any }
     * Data for `ModelImageUri`.
     * 
     * `ModelImageUri`用のデータ。
     */
    static modelImageUri({
        key, uri,
    }: {
        key: string, uri: string,
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        res[key] = uri;
        res[`#${key}`] = {
            "@target": key,
            "@type": "ModelImageUri",
            "@uri": uri,
        };
        return res;
    }
    /**
     * Class for generating data for `ModelVideoUri`.
     * 
     * `ModelVideoUri`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {string} uri
     * URI.
     * 
     * @returns { [key: string]: any }
     * Data for `ModelVideoUri`.
     * 
     * `ModelVideoUri`用のデータ。
     */
    static modelVideoUri({
        key, uri,
    }: {
        key: string, uri: string,
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        res[key] = uri;
        res[`#${key}`] = {
            "@target": key,
            "@type": "ModelVideoUri",
            "@uri": uri,
        };
        return res;
    }
}