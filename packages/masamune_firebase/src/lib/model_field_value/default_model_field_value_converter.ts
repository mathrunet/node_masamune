import { FirestoreModelFieldValueConverter } from "./model_field_value_converter";
import { FirestoreModelServerCommandBaseConverter } from "./converters/model_server_command_base_converter";
import { FirestoreModelCounterConverter } from "./converters/model_counter_converter";
import { FirestoreModelTimestampConverter } from "./converters/model_timestamp_converter";
import { FirestoreModelDateConverter } from "./converters/model_date_converter";
import { FirestoreModelLocaleConverter } from "./converters/model_locale_converter";
import { FirestoreModelLocalizedValueConverter } from "./converters/model_localized_value_converter";
import { FirestoreModelUriConverter } from "./converters/model_uri_converter";
import { FirestoreModelImageUriConverter } from "./converters/model_image_uri_converter";
import { FirestoreBasicConverter } from "./converters/basic_converter";
import { FirestoreEnumConverter } from "./converters/enum_converter";
import { FirestoreModelGeoValueConverter } from "./converters/model_geo_value_converter";
import { FirestoreModelVectorValueConverter } from "./converters/model_vector_value_converter";
import { FirestoreModelRefBaseConverter } from "./converters/model_ref_base_converter";
import { FirestoreModelSearchConverter } from "./converters/model_search_converter";
import { FirestoreModelTokenConverter } from "./converters/model_token_converter";
import { FirestoreModelVideoUriConverter } from "./converters/model_video_uri_converter";
import { FirestoreNullConverter } from "./converters/null_converter";
import { FirestoreModelTimeConverter } from "./converters/model_time_converter";
import { FirestoreModelTimeRangeConverter } from "./converters/model_time_range_converter";
import { FirestoreModelTimestampRangeConverter } from "./converters/model_timestamp_range_converter";
import { FirestoreModelDateRangeConverter } from "./converters/model_date_range_converter";
import { ModelFieldValueConverterUtils } from "@mathrunet/masamune";

export { FirestoreModelFieldValueConverter } from "./model_field_value_converter";
export { FirestoreModelServerCommandBaseConverter } from "./converters/model_server_command_base_converter";
export { FirestoreModelCounterConverter } from "./converters/model_counter_converter";
export { FirestoreModelTimestampConverter } from "./converters/model_timestamp_converter";
export { FirestoreModelDateConverter } from "./converters/model_date_converter";
export { FirestoreModelLocaleConverter } from "./converters/model_locale_converter";
export { FirestoreModelLocalizedValueConverter } from "./converters/model_localized_value_converter";
export { FirestoreModelUriConverter } from "./converters/model_uri_converter";
export { FirestoreModelImageUriConverter } from "./converters/model_image_uri_converter";
export { FirestoreBasicConverter } from "./converters/basic_converter";
export { FirestoreEnumConverter } from "./converters/enum_converter";
export { FirestoreModelGeoValueConverter } from "./converters/model_geo_value_converter";
export { FirestoreModelVectorValueConverter } from "./converters/model_vector_value_converter";
export { FirestoreModelRefBaseConverter } from "./converters/model_ref_base_converter";
export { FirestoreModelSearchConverter } from "./converters/model_search_converter";
export { FirestoreModelTokenConverter } from "./converters/model_token_converter";
export { FirestoreModelVideoUriConverter } from "./converters/model_video_uri_converter";
export { FirestoreNullConverter } from "./converters/null_converter";
export { FirestoreModelTimeConverter } from "./converters/model_time_converter";
export { FirestoreModelTimeRangeConverter } from "./converters/model_time_range_converter";
export { FirestoreModelTimestampRangeConverter } from "./converters/model_timestamp_range_converter";
export { FirestoreModelDateRangeConverter } from "./converters/model_date_range_converter";


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
            replaced = null;
            for (const converter of defaultFirestoreConverters) {
                replaced = converter.convertFrom(key, val, data, firestoreInstance);
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
        return ModelFieldValueConverterUtils.convertFrom({
            data: update
        });
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
        data = ModelFieldValueConverterUtils.convertTo({
            data: data
        });
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