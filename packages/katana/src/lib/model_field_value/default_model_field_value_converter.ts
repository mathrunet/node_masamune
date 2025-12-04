import { FirestoreModelFieldValueConverter, ModelFieldValueConverter } from "./model_field_value_converter";
import { FirestoreModelServerCommandBaseConverter, ModelServerCommandBaseConverter } from "./converters/model_server_command_base_converter";
import { FirestoreModelCounterConverter, ModelCounterConverter } from "./converters/model_counter_converter";
import { FirestoreModelTimestampConverter, ModelTimestampConverter } from "./converters/model_timestamp_converter";
import { FirestoreModelDateConverter, ModelDateConverter } from "./converters/model_date_converter";
import { FirestoreModelLocaleConverter, ModelLocaleConverter } from "./converters/model_locale_converter";
import { FirestoreModelLocalizedValueConverter, ModelLocalizedValueConverter } from "./converters/model_localized_value_converter";
import { FirestoreModelUriConverter, ModelUriConverter } from "./converters/model_uri_converter";
import { FirestoreModelImageUriConverter, ModelImageUriConverter } from "./converters/model_image_uri_converter";
import { FirestoreBasicConverter, ModelBasicConverter } from "./converters/basic_converter";
import { FirestoreEnumConverter, ModelEnumConverter } from "./converters/enum_converter";
import { FirestoreModelGeoValueConverter, ModelGeoValueConverter } from "./converters/model_geo_value_converter";
import { FirestoreModelVectorValueConverter, ModelVectorValueConverter } from "./converters/model_vector_value_converter";
import { FirestoreModelRefBaseConverter, ModelRefBaseConverter } from "./converters/model_ref_base_converter";
import { FirestoreModelSearchConverter, ModelSearchConverter } from "./converters/model_search_converter";
import { FirestoreModelTokenConverter, ModelTokenConverter } from "./converters/model_token_converter";
import { FirestoreModelVideoUriConverter, ModelVideoUriConverter } from "./converters/model_video_uri_converter";
import { FirestoreNullConverter, ModelNullConverter } from "./converters/null_converter";
import { FirestoreModelTimeConverter, ModelTimeConverter } from "./converters/model_time_converter";
import { FirestoreModelTimeRangeConverter, ModelTimeRangeConverter } from "./converters/model_time_range_converter";
import { FirestoreModelTimestampRangeConverter, ModelTimestampRangeConverter } from "./converters/model_timestamp_range_converter";
import { FirestoreModelDateRangeConverter, ModelDateRangeConverter } from "./converters/model_date_range_converter";

/**
 * List of converters for converting [ModelFieldValue] to Firestore manageable type.
 * 
 * [ModelFieldValue]をFirestoreで管理可能な型に変換するためのコンバーター一覧。
 */
const defaultConverters: ModelFieldValueConverter[] = [
    new ModelServerCommandBaseConverter(),
    new ModelCounterConverter(),
    new ModelTimestampConverter(),
    new ModelTimestampRangeConverter(),
    new ModelDateConverter(),
    new ModelDateRangeConverter(),
    new ModelTimeConverter(),
    new ModelTimeRangeConverter(),
    new ModelLocaleConverter(),
    new ModelLocalizedValueConverter(),
    new ModelUriConverter(),
    new ModelImageUriConverter(),
    new ModelVideoUriConverter(),
    new ModelSearchConverter(),
    new ModelTokenConverter(),
    new ModelGeoValueConverter(),
    new ModelVectorValueConverter(),
    new ModelRefBaseConverter(),
    new ModelEnumConverter(),
    new ModelNullConverter(),
    new ModelBasicConverter(),
];

/**
 * List of converters for converting Firestore values.
 * 
 * Firestoreの値を変換するためのコンバーター一覧。
 */
const defaultFirestoreConverters: FirestoreModelFieldValueConverter[] = [
    new FirestoreModelServerCommandBaseConverter(),
    new FirestoreModelCounterConverter(),
    new FirestoreModelTimestampConverter(),
    new FirestoreModelTimestampRangeConverter(),
    new FirestoreModelDateConverter(),
    new FirestoreModelDateRangeConverter(),
    new FirestoreModelTimeConverter(),
    new FirestoreModelTimeRangeConverter(),
    new FirestoreModelLocaleConverter(),
    new FirestoreModelLocalizedValueConverter(),
    new FirestoreModelUriConverter(),
    new FirestoreModelImageUriConverter(),
    new FirestoreModelVideoUriConverter(),
    new FirestoreModelSearchConverter(),
    new FirestoreModelTokenConverter(),
    new FirestoreModelGeoValueConverter(),
    new FirestoreModelVectorValueConverter(),
    new FirestoreModelRefBaseConverter(),
    new FirestoreEnumConverter(),
    new FirestoreNullConverter(),
    new FirestoreBasicConverter(),
];
export class ModelFieldValueConverterUtils {
    /**
     * Convert data to [ModelFieldValue].
     * 
     * データを[ModelFieldValue]に変換します。
     * 
     * @param data
     * Data to convert.
     * 
     * 変換するデータ。
     * 
     * @returns { [field: string]: any }
     * Data converted to [ModelFieldValue].
     * 
     * [ModelFieldValue]に変換されたデータ。
     */
    static convertFrom({ data }: { data: { [field: string]: any } }): { [field: string]: any } {
        const update: { [field: string]: any } = {};
        var replaced: { [field: string]: any } | null = null;
        for (const key in data) {
            const val = data[key];
            for (const converter of defaultConverters) {
                replaced = converter.convertFrom(key, val, data);
                if (replaced !== null) {
                    // console.log(`ConvertFrom(${converter.type}): ${key} : ${val} to ${replaced}`);
                    break;
                }
            }
            if (replaced !== null) {
                for (const k in replaced) {
                    const v = replaced[k];
                    if (k.startsWith("#") && !v) {
                        continue;
                    }
                    update[k] = v;
                }
            } else {
                if (key.startsWith("#") && !val) {
                    continue;
                }
                update[key] = val;
            }
        }

        return update;
    }

    /**
     * Convert data to Firestore manageable type.
     * 
     * データをFirestoreで管理可能な型に変換します。
     * 
     * @param data
     * Data to convert.
     * 
     * 変換するデータ。
     * 
     * @returns { [field: string]: any }
     * Data converted to Firestore manageable type.
     * 
     * Firestoreで管理可能な型に変換されたデータ。
     */
    static convertTo({ data }: { data: { [field: string]: any } }): { [field: string]: any } {
        const update: { [field: string]: any } = {};
        var replaced: { [field: string]: any } | null = null;
        for (const key in data) {
            const val = data[key];
            for (const converter of defaultConverters) {
                replaced = converter.convertTo(key, val, data);
                if (replaced !== null) {
                    // console.log(`ConvertTo(${converter.type}): ${key} : ${val} to ${replaced}`);
                    break;
                }
            }
            if (replaced !== null) {
                for (const k in replaced) {
                    const v = replaced[k];
                    update[k] = v;
                }
            } else {
                update[key] = val;
            }
        }
        return update;
    }
}

/**
 * Utility class for converting data using default converters.
 * 
 * デフォルトのコンバーターを使用してデータを変換するユーティリティクラス。
 */
export class FirestoreModelFieldValueConverterUtils {
    /**
     * Convert data to [ModelFieldValue].
     * 
     * データを[ModelFieldValue]に変換します。
     * 
     * @param data
     * Data to convert.
     * 
     * 変換するデータ。
     * 
     * @returns { [field: string]: any }
     * Data converted to [ModelFieldValue].
     * 
     * [ModelFieldValue]に変換されたデータ。
     */
    static convertFrom({ data, firestoreInstance }: { data: { [field: string]: any }, firestoreInstance: FirebaseFirestore.Firestore }): { [field: string]: any } {
        const update: { [field: string]: any } = {};
        var replaced: { [field: string]: any } | null = null;
        for (const key in data) {
            const val = data[key];
            for (const converter of defaultFirestoreConverters) {
                replaced = converter.convertFrom(key, val, data, firestoreInstance);
                if (replaced !== null) {
                    // console.log(`FirestoreConvertFrom(${converter.type}): ${key} : ${val} to ${replaced}`);
                    break;
                }
            }
            if (replaced !== null) {
                for (const k in replaced) {
                    const v = replaced[k];
                    update[k] = v;
                }
            } else {
                update[key] = val;
            }
        }
        return update;
    }

    /**
     * Convert data to Firestore manageable type.
     * 
     * データをFirestoreで管理可能な型に変換します。
     * 
     * @param data
     * Data to convert.
     * 
     * 変換するデータ。
     * 
     * @returns { [field: string]: any }
     * Data converted to Firestore manageable type.
     * 
     * Firestoreで管理可能な型に変換されたデータ。
     */
    static convertTo({ data, firestoreInstance }: { data: { [field: string]: any }, firestoreInstance: FirebaseFirestore.Firestore }): { [field: string]: any } {
        const update: { [field: string]: any } = {};
        var replaced: { [field: string]: any } | null = null;
        for (const key in data) {
            const val = data[key];
            for (const converter of defaultFirestoreConverters) {
                replaced = converter.convertTo(key, val, data, firestoreInstance);
                if (replaced !== null) {
                    // console.log(`FirestoreConvertTo(${converter.type}): ${key} : ${val} to ${replaced}`);
                    break;
                }
            }
            if (replaced !== null) {
                for (const k in replaced) {
                    const v = replaced[k];
                    update[k] = v;
                }
            } else {
                update[key] = val;
            }
        }
        return update;
    }
}

export { defaultFirestoreConverters as defaultConverters }