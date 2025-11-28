import * as admin from "firebase-admin";

/**
 * ModelCounter interface.
 * 
 * katana_modelの`ModelCounter`用のインターフェース。
 */
export interface ModelCounter {
    "@increment": number;
    "@target": string;
    "@type": string;
    "@value": number;
}

/**
 * ModelTimestamp interface.
 * 
 * katana_modelの`ModelTimestamp`用のインターフェース。
 */
export interface ModelTimestamp {
    "@target": string;
    "@type": string;
    "@time": number;
}

/**
 * ModelDate interface.
 * 
 * katana_modelの`ModelDate`用のインターフェース。
 */
export interface ModelDate {
    "@target": string;
    "@type": string;
    "@time": number;
}

/**
 * ModelTime interface.
 * 
 * katana_modelの`ModelTime`用のインターフェース。
 */
export interface ModelTime {
    "@target": string;
    "@type": string;
    "@time": number;
}

/**
 * ModelTimestampRange interface.
 * 
 * katana_modelの`ModelTimestampRange`用のインターフェース。
 */
export interface ModelTimestampRange {
    "@type": string;
    "@start": number;
    "@end": number;
    "@target": string;
}

/**
 * ModelDateRange interface.
 * 
 * katana_modelの`ModelDateRange`用のインターフェース。
 */
export interface ModelDateRange {
    "@type": string;
    "@start": number;
    "@end": number;
    "@target": string;
}

/**
 * ModelTimeRange interface.
 * 
 * katana_modelの`ModelTimeRange`用のインターフェース。
 */
export interface ModelTimeRange {
    "@type": string;
    "@start": number;
    "@end": number;
    "@target": string;
}

/**
 * ModelLocale interface.
 * 
 * katana_modelの`ModelLocale`用のインターフェース。
 */
export interface ModelLocale {
    "@target": string;
    "@type": string;
    "@language": string;
    "@country": string;
}

/**
 * ModelLocalizedValue interface.
 * 
 * katana_modelの`ModelLocalizedValue`用のインターフェース。
 */
export interface ModelLocalizedValue {
    "@target": string;
    "@type": string;
    "@localized": {[field:string]: any},
}

/**
 * ModelUri interface.
 * 
 * katana_modelの`ModelUri`用のインターフェース。
 */
export interface ModelUri {
    "@target": string;
    "@type": string;
    "@uri": string;
}

/**
 * ModelImageUri interface.
 * 
 * katana_modelの`ModelImageUri`用のインターフェース。
 */
export interface ModelImageUri {
    "@target": string;
    "@type": string;
    "@uri": string;
}

/**
 * ModelVideoUri interface.
 * 
 * katana_modelの`ModelVideoUri`用のインターフェース。
 */
export interface ModelVideoUri {
    "@target": string;
    "@type": string;
    "@uri": string;
}

/**
 * ModelSearch interface.
 * 
 * katana_modelの`ModelSearch`用のインターフェース。
 */
export interface ModelSearch {
    "@type": string;
    "@list": string[];
    "@target": string;
}

/**
 * ModelToken interface.
 * 
 * katana_modelの`ModelToken`用のインターフェース。
 */
export interface ModelToken {
    "@type": string;
    "@list": string[];
    "@target": string;
}

/**
 * ModelGeoValue interface.
 * 
 * katana_modelの`ModelGeoValue`用のインターフェース。
 */
export interface ModelGeoValue {
    "@type": string;
    "@latitude": number;
    "@longitude": number;
    "@target": string;
}

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
        const modelCounter: ModelCounter = {
            "@increment": increment ?? 0,
            "@target": key,
            "@type": "ModelCounter",
            "@value": value,
        };
        res[`#${key}`] = modelCounter;
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
        const modelTimestamp: ModelTimestamp = {
            "@time": date.getTime(),
            "@target": key,
            "@type": "ModelTimestamp",
        };
        res[`#${key}`] = modelTimestamp;
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
        const modelDate: ModelDate = {
            "@time": date.getTime(),
            "@target": key,
            "@type": "ModelDate",
        };
        res[`#${key}`] = modelDate;
        return res;
    }
    /**
     * Class for generating data for `ModelTime`.
     * 
     * `ModelTime`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {Date} date
     * Date and time.
     * 
     * 時間。
     * 
     * @returns { [key: string]: any }
     * Data for `ModelTime`.
     * 
     * `ModelTime`用のデータ。
     */
    static modelTime({
        key, date,
    }: {
        key: string, date?: Date | undefined,
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        date ??= new Date();
        res[key] = date;
        const modelTime: ModelTime = {
            "@time": date.getTime(),
            "@target": key,
            "@type": "ModelTime",
        };
        res[`#${key}`] = modelTime;
        return res;
    }
    /**
     * Class for generating data for `ModelTimestampRange`.
     * 
     * `ModelTimestampRange`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {Date} start
     * Start date and time.
     * 
     * 開始日時。
     * 
     * @param {Date} end
     * End date and time.
     * 
     * 終了日時。
     * 
     * @returns { [key: string]: any }
     * Data for `ModelTimestampRange`.
     * 
     * `ModelTimestampRange`用のデータ。
     */
    static modelTimestampRange({
        key, start, end,
    }: {
        key: string, start?: Date | undefined, end?: Date | undefined,
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        start ??= new Date();
        end ??= new Date();
        if(start.getTime() > end.getTime()) {
            const temp = start;
            start = end;
            end = temp;
        }
        res[key] = { start, end };
        const modelTimestampRange: ModelTimestampRange = {
            "@start": start.getTime(),
            "@end": end.getTime(),
            "@target": key,
            "@type": "ModelTimestampRange",
        };
        res[`#${key}`] = modelTimestampRange;
        return res;
    }
    /**
     * Class for generating data for `ModelDateRange`.
     * 
     * `ModelDateRange`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {Date} start
     * Start date and time.
     * 
     * 開始日時。
     * 
     * @param {Date} end
     * End date and time.
     * 
     * 終了日時。
     * 
     * @returns { [key: string]: any }
     * Data for `ModelDateRange`.
     * 
     * `ModelDateRange`用のデータ。
     */
    static modelDateRange({
        key, start, end,
    }: {
        key: string, start?: Date | undefined, end?: Date | undefined,
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        start ??= new Date();
        end ??= new Date();
        if(start.getTime() > end.getTime()) {
            const temp = start;
            start = end;
            end = temp;
        }
        res[key] = { start, end };
        const modelDateRange: ModelDateRange = {
            "@start": start.getTime(),
            "@end": end.getTime(),
            "@target": key,
            "@type": "ModelDateRange",
        };
        res[`#${key}`] = modelDateRange;
        return res;
    }
    /**
     * Class for generating data for `ModelTimeRange`.
     * 
     * `ModelTimeRange`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {Date} start
     * Start date and time.
     * 
     * 開始日時。
     * 
     * @param {Date} end
     * End date and time.
     * 
     * 終了日時。
     * 
     * @returns { [key: string]: any }
     * Data for `ModelTimeRange`.
     * 
     * `ModelTimeRange`用のデータ。
     */
    static modelTimeRange({
        key, start, end,
    }: {
        key: string, start?: Date | undefined, end?: Date | undefined,
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        start ??= new Date();
        end ??= new Date();
        if(start.getTime() > end.getTime()) {
            const temp = start;
            start = end;
            end = temp;
        }
        res[key] = { start, end };
        const modelTimeRange: ModelTimeRange = {
            "@start": start.getTime(),
            "@end": end.getTime(),
            "@target": key,
            "@type": "ModelTimeRange",
        };
        res[`#${key}`] = modelTimeRange;
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
        const modelLocale: ModelLocale = {
            "@country": country,
            "@language": language,
            "@target": key,
            "@type": "ModelLocale",
        };
        res[`#${key}`] = modelLocale;
        return res;
    }
    /**
     * Class for generating data for `ModelLocalizedValue`.
     * 
     * `ModelLocalizedValue`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {string} value
     * Value.
     * 
     * 値。
     * 
     * @returns { [key: string]: any }
     * Data for `ModelLocalizedValue`.
     * 
     * `ModelLocalizedValue`用のデータ。
     */
    static modelLocalizedValue({
        key, localized,
    }: {
        key: string, localized: {[field:string]: any},
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        res[key] = localized;
        const modelLocalizedValue: ModelLocalizedValue = {
            "@localized": localized,
            "@target": key,
            "@type": "ModelLocalizedValue",
        };
        res[`#${key}`] = modelLocalizedValue;
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
        const modelUri: ModelUri = {
            "@target": key,
            "@type": "ModelUri",
            "@uri": uri,
        };
        res[`#${key}`] = modelUri;
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
        const modelImageUri: ModelImageUri ={
            "@target": key,
            "@type": "ModelImageUri",
            "@uri": uri,
        };
        res[`#${key}`] = modelImageUri;
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
        const modelVideoUri: ModelVideoUri ={
            "@target": key,
            "@type": "ModelVideoUri",
            "@uri": uri,
        };
        res[`#${key}`] = modelVideoUri;
        return res;
    }
    /**
     * Class for generating data for `ModelSearch`.
     * 
     * `ModelSearch`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {string[]} list
     * List of search values.
     * 
     * 検索対象のリスト。
     * 
     * @returns { [key: string]: any }
     * Data for `ModelSearch`.
     * 
     * `ModelSearch`用のデータ。
     */
    static modelSearch({
        key, list,
    }: {
        key: string, list?: string[] | undefined,
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        res[key] = list;
        const modelSearch: ModelSearch = {
            "@list": list ?? [],
            "@type": "ModelSearch",
            "@target": key,
        };
        res[`#${key}`] = modelSearch;
        return res;
    }
    /**
     * Class for generating data for `ModelToken`.
     * 
     * `ModelToken`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {string[]} list
     * List of token values.
     * 
     * トークンのリスト。
     * 
     * @returns { [key: string]: any }
     * Data for `ModelToken`.
     * 
     * `ModelToken`用のデータ。
     */
    static modelToken({
        key, list,
    }: {
        key: string, list?: string[] | undefined,
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        res[key] = list;
        const modelToken: ModelToken = {
            "@list": list ?? [],
            "@type": "ModelToken",
            "@target": key,
        };
        res[`#${key}`] = modelToken;
        return res;
    }
    /**
     * Class for generating data for `ModelGeoValue`.
     * 
     * `ModelGeoValue`用のデータを生成するためのクラス。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {string[]} list
     * List of token values.
     * 
     * トークンのリスト。
     * 
     * @returns { [key: string]: any }
     * Data for `ModelToken`.
     * 
     * `ModelToken`用のデータ。
     */
    static modelGeoValue({
        key, latitude, longitude,
    }: {
        key: string, latitude?: number | undefined, longitude?: number | undefined,
    }): { [key: string]: any } {
        const res: { [key: string]: any } = {};
        res[key] = new admin.firestore.GeoPoint(latitude ?? 0, longitude ?? 0);
        const modelGeoValue: ModelGeoValue = {
            "@latitude": latitude ?? 0,
            "@longitude": longitude ?? 0,
            "@type": "ModelGeoValue",
            "@target": key,
        };
        res[`#${key}`] = modelGeoValue;
        return res;
    }
}