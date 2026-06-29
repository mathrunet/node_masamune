import { ModelFieldValueConverter } from "./model_field_value_converter";
import { ModelServerCommandBaseConverter } from "./converters/model_server_command_base_converter";
import { ModelCounterConverter } from "./converters/model_counter_converter";
import { ModelTimestampConverter } from "./converters/model_timestamp_converter";
import { ModelDateConverter } from "./converters/model_date_converter";
import { ModelLocaleConverter } from "./converters/model_locale_converter";
import { ModelLocalizedValueConverter } from "./converters/model_localized_value_converter";
import { ModelUriConverter } from "./converters/model_uri_converter";
import { ModelImageUriConverter } from "./converters/model_image_uri_converter";
import { ModelBasicConverter } from "./converters/basic_converter";
import { ModelEnumConverter } from "./converters/enum_converter";
import { ModelGeoValueConverter } from "./converters/model_geo_value_converter";
import { ModelVectorValueConverter } from "./converters/model_vector_value_converter";
import { ModelRefBaseConverter } from "./converters/model_ref_base_converter";
import { ModelSearchConverter } from "./converters/model_search_converter";
import { ModelTokenConverter } from "./converters/model_token_converter";
import { ModelVideoUriConverter } from "./converters/model_video_uri_converter";
import { ModelNullConverter } from "./converters/null_converter";
import { ModelTimeConverter } from "./converters/model_time_converter";
import { ModelTimeRangeConverter } from "./converters/model_time_range_converter";
import { ModelTimestampRangeConverter } from "./converters/model_timestamp_range_converter";
import { ModelDateRangeConverter } from "./converters/model_date_range_converter";

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