import { FirestoreModelFieldValueConverter } from "./firestore_model_field_value_converter";
import { FirestoreModelCommandBaseConverter } from "./converters/firestore_model_command_base_converter";
import { FirestoreModelCounterConverter } from "./converters/firestore_model_counter_converter";
import { FirestoreModelTimestampConverter } from "./converters/firestore_model_timestamp_converter";
import { FirestoreModelDateConverter } from "./converters/firestore_model_date_converter";
import { FirestoreModelLocaleConverter } from "./converters/firestore_model_locale_converter";
import { FirestoreModelLocalizedValueConverter } from "./converters/firestore_model_localized_value_converter";
import { FirestoreModelUriConverter } from "./converters/firestore_model_uri_converter";
import { FirestoreModelImageUriConverter } from "./converters/firestore_model_image_uri_converter";
import { FirestoreBasicConverter } from "./converters/firestore_basic_converter";
import { FirestoreEnumConverter } from "./converters/firestore_enum_converter";
import { FirestoreModelGeoValueConverter } from "./converters/firestore_model_geo_value_converter";
import { FirestoreModelRefConverter } from "./converters/firestore_model_ref_converter";
import { FirestoreModelSearchConverter } from "./converters/firestore_model_search_converter";
import { FirestoreModelTokenConverter } from "./converters/firestore_model_token_converter";
import { FirestoreModelVideoUriConverter } from "./converters/firestore_model_video_uri_converter";
import { FirestoreNullConverter } from "./converters/firestore_null_converter";
import { FirestoreModelTimeConverter } from "./converters/firestore_model_time_converter";
import { FirestoreModelTimeRangeConverter } from "./converters/firestore_model_time_range_converter";
import { FirestoreModelTimestampRangeConverter } from "./converters/firestore_model_timestamp_range_converter";
import { FirestoreModelDateRangeConverter } from "./converters/firestore_model_date_range_converter";

/**
 * List of converters for converting Firestore values.
 * 
 * Firestoreの値を変換するためのコンバーター一覧。
 */
const defaultConverters: FirestoreModelFieldValueConverter[] = [
    new FirestoreModelCommandBaseConverter(),
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
    new FirestoreModelRefConverter(),
    new FirestoreEnumConverter(),
    new FirestoreNullConverter(),
    new FirestoreBasicConverter(),
];

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
            for (const converter of defaultConverters) {
                replaced = converter.convertFrom(key, val, data, firestoreInstance);
                console.log(`ConvertFrom(${converter.type}): ${key} : ${val} to ${replaced}`);
                if (replaced !== null) {
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
            for (const converter of defaultConverters) {
                replaced = converter.convertTo(key, val, data, firestoreInstance);
                console.log(`ConvertTo(${converter.type}): ${key} : ${val} to ${replaced}`);
                if (replaced !== null) {
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

export { defaultConverters }