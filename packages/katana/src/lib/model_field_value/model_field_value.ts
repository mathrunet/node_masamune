import * as firestore from "firebase-admin/firestore";
import { DocumentModel } from "../exntensions/firestore.extension";

/**
 * The source of ModelFieldValue.
 * 
 * ModelFieldValueのソース。
 */
export type ModelFieldValueSource = "user" | "server";

/**
 * Class for generating values for `ModelFieldValue` in katana_model.
 * 
 * katana_modelの`ModelFieldValue`用の値を生成するためのクラス。
 */
export class ModelFieldValue {
    constructor(type: string, source?: ModelFieldValueSource) {
        this["@type"] = type;
        this["@source"] = source ?? "user";
    }
    "@type": string;
    "@source": ModelFieldValueSource;
}


/**
 * ModelServerCommandBase interface.
 * 
 * katana_modelの`ModelServerCommandBase`用のインターフェース。
 */
export class ModelServerCommandBase extends ModelFieldValue {
    constructor(
        {
            command,
            publicParameters,
            privateParameters,
            source
        }: {
            command: string,
            publicParameters: { [field: string]: any },
            privateParameters: { [field: string]: any },
            source?: ModelFieldValueSource
        }) {
        super("ModelServerCommandBase", source);
        this["@command"] = command;
        this["@public"] = publicParameters;
        this["@private"] = privateParameters;
    }
    "@command": string;
    "@public": { [field: string]: any };
    "@private": { [field: string]: any };

    /**
     * Get the value of the command.
     * 
     * コマンドの値を取得します。
     * 
     * @returns The value of the command.
     */
    value(): string {
        return this["@command"] as string;
    }
}

/**
 * ModelCounter interface.
 * 
 * katana_modelの`ModelCounter`用のインターフェース。
 */
export class ModelCounter extends ModelFieldValue {
    constructor(value: number, increment?: number, source?: ModelFieldValueSource) {
        super("ModelCounter", source);
        this["@value"] = value;
        this["@increment"] = increment ?? 0;
    }
    "@increment": number;
    "@value": number;

    /**
     * Get the value of the counter.
     * 
     * カウンターの値を取得します。
     * 
     * @returns The value of the counter.
     */
    value(): number {
        return (this["@value"] as number) + (this["@increment"] as number);
    }
}

/**
 * ModelTimestamp interface.
 * 
 * katana_modelの`ModelTimestamp`用のインターフェース。
 */
export class ModelTimestamp extends ModelFieldValue {
    constructor(time?: Date, source?: ModelFieldValueSource) {
        super("ModelTimestamp", source);
        this["@time"] = time?.getTime() ?? Date.now();
    }
    "@time": number;

    /**
     * Get the value of the timestamp.
     * 
     * タイムスタンプの値を取得します。
     * 
     * @returns 
     */
    value(): Date {
        return new Date((this["@time"] as number) / 1000.0);
    }
}

/**
 * ModelDate interface.
 * 
 * katana_modelの`ModelDate`用のインターフェース。
 */
export class ModelDate extends ModelFieldValue {
    constructor(date?: Date, source?: ModelFieldValueSource) {
        super("ModelDate", source);
        date ??= new Date();
        date = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        this["@time"] = date.getTime();
    }
    "@time": number;

    /**
     * Get the value of the timestamp.
     * 
     * タイムスタンプの値を取得します。
     * 
     * @returns 
     */
    value(): Date {
        return new Date((this["@time"] as number) / 1000.0);
    }
}

/**
 * ModelTime interface.
 * 
 * katana_modelの`ModelTime`用のインターフェース。
 */
export class ModelTime extends ModelFieldValue {
    constructor(time?: Date, source?: ModelFieldValueSource) {
        super("ModelTime", source);
        time ??= new Date();
        const now = new Date();
        time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
        this["@time"] = time.getTime();
    }
    "@time": number;

    /**
     * Get the value of the timestamp.
     * 
     * タイムスタンプの値を取得します。
     * 
     * @returns 
     */
    value(): Date {
        return new Date((this["@time"] as number) / 1000.0);
    }
}

/**
 * ModelTimestampRange interface.
 * 
 * katana_modelの`ModelTimestampRange`用のインターフェース。
 */
export class ModelTimestampRange extends ModelFieldValue {
    constructor(start?: Date, end?: Date, source?: ModelFieldValueSource) {
        super("ModelTimestampRange", source);
        start ??= new Date();
        end ??= new Date();
        if (start > end) {
            const temp = start;
            start = end;
            end = temp;
        }
        this["@start"] = start.getTime();
        this["@end"] = end.getTime();
    }
    "@start": number;
    "@end": number;


    /**
     * Get the value of the timestamp.
     * 
     * タイムスタンプの値を取得します。
     * 
     * @returns 
     */
    value(): { start: Date, end: Date } {
        return {
            start: new Date((this["@start"] as number) / 1000.0),
            end: new Date((this["@end"] as number) / 1000.0),
        };
    }
}

/**
 * ModelDateRange interface.
 * 
 * katana_modelの`ModelDateRange`用のインターフェース。
 */
export class ModelDateRange extends ModelFieldValue {
    constructor(start?: Date, end?: Date, source?: ModelFieldValueSource) {
        super("ModelDateRange", source);
        start ??= new Date();
        end ??= new Date();
        start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        end = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        if (start > end) {
            const temp = start;
            start = end;
            end = temp;
        }
        this["@start"] = start.getTime();
        this["@end"] = end.getTime();
    }
    "@start": number;
    "@end": number;

    /**
     * Get the value of the timestamp.
     * 
     * タイムスタンプの値を取得します。
     * 
     * @returns 
     */
    value(): { start: Date, end: Date } {
        return {
            start: new Date((this["@start"] as number) / 1000.0),
            end: new Date((this["@end"] as number) / 1000.0),
        };
    }
}

/**
 * ModelTimeRange interface.
 * 
 * katana_modelの`ModelTimeRange`用のインターフェース。
 */
export class ModelTimeRange extends ModelFieldValue {
    constructor(start?: Date, end?: Date, source?: ModelFieldValueSource) {
        super("ModelTimeRange", source);
        const now = new Date();
        start ??= new Date();
        end ??= new Date();
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds());
        if (start > end) {
            const temp = start;
            start = end;
            end = temp;
        }
        this["@start"] = start.getTime();
        this["@end"] = end.getTime();
    }
    "@start": number;
    "@end": number;

    /**
     * Get the value of the timestamp.
     * 
     * タイムスタンプの値を取得します。
     * 
     * @returns 
     */
    value(): { start: Date, end: Date } {
        return {
            start: new Date((this["@start"] as number) / 1000.0),
            end: new Date((this["@end"] as number) / 1000.0),
        };
    }
}

/**
 * ModelLocale interface.
 * 
 * katana_modelの`ModelLocale`用のインターフェース。
 */
export class ModelLocale extends ModelFieldValue {
    constructor(language: string, country?: string, source?: ModelFieldValueSource) {
        super("ModelLocale", source);
        this["@language"] = language;
        this["@country"] = country;
    }
    "@language": string;
    "@country"?: string;

    /**
     * Get the value of the locale.
     * 
     * ロケールの値を取得します。
     * 
     * @returns The value of the locale.
     */
    value(): string {
        if (this["@country"]) {
            return `${this["@language"]}_${this["@country"]}`;
        }
        return this["@language"];
    }
}

/**
 * ModelLocalizedValue interface.
 * 
 * katana_modelの`ModelLocalizedValue`用のインターフェース。
 */
export class ModelLocalizedValue extends ModelFieldValue {
    constructor(localized: ModelLocalizedLocaleVaue[], source?: ModelFieldValueSource) {
        super("ModelLocalizedValue", source);
        this["@localized"] = localized;
    }
    "@localized": ModelLocalizedLocaleVaue[];

    /**
     * Get the value of the localized value.
     * 
     * ローカライズされた値の値を取得します。
     * 
     * @returns The value of the localized value.
     */
    value(): ModelLocalizedLocaleVaue[] {
        return this["@localized"];
    }

    /**
     * Get the value of the localized value for the specified locale.
     * 
     * 指定されたロケールのローカライズされた値の値を取得します。
     * 
     * @param locale The locale to get the value for.
     * @returns The value of the localized value for the specified locale.
     */
    get(locale: string): ModelLocalizedLocaleVaue | null {
        return this["@localized"].find((e) => e.language === locale) ?? null;
    }
}

/**
 * The value of ModelLocalizedValue.
 * 
 * ModelLocalizedValueの値。
 */
export class ModelLocalizedLocaleVaue {
    constructor(
        {
            language,
            country,
            value
        }: {
            language: string,
            country?: string,
            value: string | number | boolean | { [field: string]: any } | string[] | number[] | boolean[]
        }) {
        this.language = language;
        this.country = country;
        this.value = value;
    }
    language: string;
    country?: string;
    value: string | number | boolean | { [field: string]: any } | string[] | number[] | boolean[];
}

/**
 * ModelUri interface.
 * 
 * katana_modelの`ModelUri`用のインターフェース。
 */
export class ModelUri extends ModelFieldValue {
    constructor(uri: string, source?: ModelFieldValueSource) {
        super("ModelUri", source);
        this["@uri"] = uri;
    }
    "@uri": string;

    /**
     * Get the value of the uri.
     * 
     * URIの値を取得します。
     * 
     * @returns The value of the uri.
     */
    value(): string {
        return this["@uri"] as string;
    }
}

/**
 * ModelImageUri interface.
 * 
 * katana_modelの`ModelImageUri`用のインターフェース。
 */
export class ModelImageUri extends ModelFieldValue {
    constructor(uri: string, source?: ModelFieldValueSource) {
        super("ModelImageUri", source);
        this["@uri"] = uri;
    }
    "@uri": string;

    /**
     * Get the value of the uri.
     * 
     * URIの値を取得します。
     * 
     * @returns The value of the uri.
     */
    value(): string {
        return this["@uri"] as string;
    }
}

/**
 * ModelVideoUri interface.
 * 
 * katana_modelの`ModelVideoUri`用のインターフェース。
 */
export class ModelVideoUri extends ModelFieldValue {
    constructor(uri: string, source?: ModelFieldValueSource) {
        super("ModelVideoUri", source);
        this["@uri"] = uri;
    }
    "@uri": string;

    /**
     * Get the value of the uri.
     * 
     * URIの値を取得します。
     * 
     * @returns The value of the uri.
     */
    value(): string {
        return this["@uri"] as string;
    }
}

/**
 * ModelSearch interface.
 * 
 * katana_modelの`ModelSearch`用のインターフェース。
 */
export class ModelSearch extends ModelFieldValue {
    constructor(list: string[], source?: ModelFieldValueSource) {
        super("ModelSearch", source);
        this["@list"] = list;
    }
    "@list": string[];

    /**
     * Get the value of the search.
     * 
     * 検索の値を取得します。
     * 
     * @returns The value of the search.
     */
    value(): string[] {
        return this["@list"] as string[];
    }
}

/**
 * ModelToken interface.
 * 
 * katana_modelの`ModelToken`用のインターフェース。
 */
export class ModelToken extends ModelFieldValue {
    constructor(list: string[], source?: ModelFieldValueSource) {
        super("ModelToken", source);
        this["@list"] = list;
    }
    "@list": string[];

    /**
     * Get the value of the token.
     * 
     * トークンの値を取得します。
     * 
     * @returns The value of the token.
     */
    value(): string[] {
        return this["@list"] as string[];
    }
}

/**
 * ModelGeoValue interface.
 * 
 * katana_modelの`ModelGeoValue`用のインターフェース。
 */
export class ModelGeoValue extends ModelFieldValue {
    constructor(latitude: number, longitude: number, source?: ModelFieldValueSource) {
        super("ModelGeoValue", source);
        this["@latitude"] = latitude;
        this["@longitude"] = longitude;
    }
    "@latitude": number;
    "@longitude": number;

    /**
     * Get the value of the geo value.
     * 
     * 地理値の値を取得します。
     * 
     * @returns The value of the geo value.
     */
    value(): { latitude: number, longitude: number } {
        return {
            latitude: this["@latitude"] as number,
            longitude: this["@longitude"] as number
        };
    }
}

/**
 * ModelVectorValue interface.
 * 
 * katana_modelの`ModelVectorValue`用のインターフェース。
 */
export class ModelVectorValue extends ModelFieldValue {
    constructor(vector: number[], source?: ModelFieldValueSource) {
        super("ModelVectorValue", source);
        this["@vector"] = vector;
    }
    "@vector": number[];

    /**
     * Get the value of the vector value.
     * 
     * ベクトル値の値を取得します。
     * 
     * @returns The value of the vector value.
     */
    value(): number[] {
        return this["@vector"] as number[];
    }
}

/**
 * ModelRefBase interface.
 * 
 * katana_modelの`ModelRefBase`用のインターフェース。
 */
export class ModelRefBase extends ModelFieldValue {
    constructor(ref: string, doc?: firestore.DocumentReference | undefined, source?: ModelFieldValueSource) {
        super("ModelRefBase", source);
        this["@ref"] = ref;
        this["@doc"] = doc;
    }
    "@ref": string;
    "@doc": firestore.DocumentReference | undefined;

    /**
     * Get the value of the ref.
     * 
     * リファレンスの値を取得します。
     * 
     * @returns The value of the ref.
     */
    value(): string {
        return this["@ref"] as string;
    }

    /**
     * Load the document.
     * 
     * ドキュメントを読み込みます。
     * 
     * @returns The value of the ref.
     */
    async load(): Promise<DocumentModel<firestore.DocumentData, firestore.DocumentData>> {
        const res = await this["@doc"]?.load();
        if (!res) {
            throw new Error("Failed to load document");
        }
        return res;
    }

    /**
     * Save the document.
     * 
     * ドキュメントを保存します。
     * 
     * @param data The data to save.
     * @param options The options to save.
     * @returns The value of the ref.
     */
    async save(data: firestore.PartialWithFieldValue<firestore.DocumentData>, options: firestore.SetOptions): Promise<void> {
        await this["@doc"]?.save(data, options);
    }

    /**
     * Delete the document.
     * 
     * ドキュメントを削除します。
     * 
     * @returns The value of the ref.
     */
    async delete(): Promise<void> {
        await this["@doc"]?.delete();
    }

    /**
     * Get the id of the ref.
     * 
     * リファレンスのIDを取得します。
     * 
     * @returns The id of the ref.
     */
    get id(): string {
        const doc = this["@doc"];
        if (!doc) {
            return this["@ref"]?.split("/").pop() ?? "";
        }
        return doc.id;
    }

}