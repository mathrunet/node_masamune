import * as firestore from "firebase-admin/firestore";

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
    constructor(command: string, publicParameters: { [field: string]: any }, privateParameters: { [field: string]: any }, source?: ModelFieldValueSource) {
        super("ModelServerCommandBase", source);
        this["@command"] = command;
        this["@public"] = publicParameters;
        this["@private"] = privateParameters;
    }
    "@command": string;
    "@public": { [field: string]: any };
    "@private": { [field: string]: any };
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
}

/**
 * ModelRefBase interface.
 * 
 * katana_modelの`ModelRefBase`用のインターフェース。
 */
export class ModelRefBase extends ModelFieldValue {
    constructor(ref: string, source?: ModelFieldValueSource) {
        super("ModelRefBase", source);
        this["@ref"] = ref;
    }
    "@ref": string;
}