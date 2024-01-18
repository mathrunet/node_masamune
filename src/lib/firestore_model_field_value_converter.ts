import { DocumentReference, Timestamp } from "firebase-admin/firestore";
import { FirestoreModelCommandBaseConverter } from "../converter/firestore_model_command_base_converter";
import { FirestoreModelCounterConverter } from "../converter/firestore_model_counter_converter";
import { FirestoreModelTimestampConverter } from "../converter/firestore_model_timestamp_converter";
import { FirestoreModelDateConverter } from "../converter/firestore_model_date_converter";
import { FirestoreModelLocaleConverter } from "../converter/firestore_model_locale_converter";
import { FirestoreModelLocalizedValueConverter } from "../converter/firestore_model_localized_value_converter";
import { FirestoreModelUriConverter } from "../converter/firestore_model_uri_converter";
import { FirestoreModelImageUriConverter } from "../converter/firestore_model_image_uri_converter";
import { FirestoreBasicConverter } from "../converter/firestore_basic_converter";
import { FirestoreEnumConverter } from "../converter/firestore_enum_converter";
import { FirestoreModelGeoValueConverter } from "../converter/firestore_model_geo_value_converter";
import { FirestoreModelRefConverter } from "../converter/firestore_model_ref_converter";
import { FirestoreModelSearchConverter } from "../converter/firestore_model_search_converter";
import { FirestoreModelTokenConverter } from "../converter/firestore_model_token_converter";
import { FirestoreModelVideoUriConverter } from "../converter/firestore_model_video_uri_converter";
import { FirestoreNullConverter } from "../converter/firestore_null_converter";

/**
 * Base class for converting [ModelFieldValue] for use in Firestore.
 * 
 * Firestoreで利用するための[ModelFieldValue]の変換を行うベースクラス。
 */
export abstract class FirestoreModelFieldValueConverter {
    /**
     * Base class for converting [ModelFieldValue] for use in Firestore.
     * 
     * Firestoreで利用するための[ModelFieldValue]の変換を行うベースクラス。
     */
    constructor() { }

    /**
     * List of converters for converting Firestore values.
     * 
     * Firestoreの値を変換するためのコンバーター一覧。
     */
    static readonly defaultConverters: FirestoreModelFieldValueConverter[] = [
        // new FirestoreModelCommandBaseConverter(),
        // new FirestoreModelCounterConverter(),
        new FirestoreModelTimestampConverter(),
        new FirestoreModelDateConverter(),
        // new FirestoreModelLocaleConverter(),
        // new FirestoreModelLocalizedValueConverter(),
        // new FirestoreModelUriConverter(),
        // new FirestoreModelImageUriConverter(),
        // new FirestoreModelVideoUriConverter(),
        // new FirestoreModelSearchConverter(),
        // new FirestoreModelTokenConverter(),
        // new FirestoreModelGeoValueConverter(),
        new FirestoreModelRefConverter(),
        // new FirestoreEnumConverter(),
        // new FirestoreNullConverter(),
        // new FirestoreBasicConverter(),
    ];

    /**
     * The type of [ModelFieldValue] that can be converted.
     * 
     * 変換可能な[ModelFieldValue]の型。
     */
    abstract type: string;
    /**
     * Convert from Firestore manageable type to [ModelFieldValue].
     * 
     * Generate and return a [DynamicMap] value from [key] and [value]. [original] is passed the [DynamicMap] before conversion.
     * 
     * Return [Null] if there are no changes.
     * 
     * [FirestoreModelAdapterBase] is passed to [adapter].
     * 
     * Firestoreで管理可能な型から[ModelFieldValue]に変換します。
     * 
     * [key]と[value]から[DynamicMap]の値を生成して返してください。[original]は変換前の[DynamicMap]を渡します。
     * 
     * 変更がない場合は[Null]を返してください。
     * 
     * [adapter]に[FirestoreModelAdapterBase]が渡されます。
     */
    abstract convertFrom(
        key: string,
        value: any,
        original: { [field: string]: any }): { [field: string]: any } | null;
    
    /**
     * Generate a header for ModelFieldValue.
     * 
     * ModelFieldValue用のヘッダーを生成します。
     * 
     * @returns { { [field: string]: any } }
     * Header for ModelFieldValue.
     * 
     * ModelFieldValue用のヘッダー。
     */
    header(): { [field: string]: any } {
        return {
            "@source": "server",
            "@type": this.type,
        };
    };
}

/**
 * Class for generating values for `ModelFieldValue` for Firestore.
 * 
 * Firestore用の`ModelFieldValue`用の値を生成するためのクラス。
 */
export class FirestoreModelFieldValue {
    /**
     * Generate data for `ModelRef`.
     * 
     * `ModelRef`用のデータを生成します。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {DocumentReference} ref
     * Document reference data.
     * 
     * ドキュメントのリファレンスデータ。
     *  
     * @returns { [key: string]: any }
     * Data for `ModelRef`.
     * 
     * `ModelRef`用のデータ。
     */
    static documentReferenceToModelRef({
        key, ref,
    }: {
        key: string, ref: DocumentReference,
    }) {
        const res: { [key: string]: any } = {};
        res[key] = {
            "@ref": ref.path,
            "@type": "ModelRefBase",
        };
        return res;
    }

    /**
     * Generate data for `ModelTimestamp`.
     * 
     * `ModelTimestamp`用のデータを生成します。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {Timestamp} timestamp
     * Time stamp data.
     * 
     * タイムスタンプデータ。
     *  
     * @returns { [key: string]: any }
     * Data for `ModelTimestamp`.
     * 
     * `ModelTimestamp`用のデータ。
     */
    static timestampToModelTimestamp({
        key, timestamp,
    }: {
        key: string, timestamp: Timestamp,
    }) {
        const res: { [key: string]: any } = {};
        res[key] = {
            "@timestamp": timestamp.toMillis(),
            "@type": "ModelTimestamp",
        };
        return res;
    }


    /**
     * Generate data for `ModelGeoValue`.
     * 
     * `ModelGeoValue`用のデータを生成します。
     * 
     * @param {string} key
     * Data key.
     * 
     * データのキー。
     * 
     * @param {Timestamp} timestamp
     * Time stamp data.
     * 
     * タイムスタンプデータ。
     *  
     * @returns { [key: string]: any }
     * Data for `ModelGeoValue`.
     * 
     * `ModelGeoValue`用のデータ。
     */
    static geoPointToModelGeoValue({
        key, timestamp,
    }: {
        key: string, timestamp: Timestamp,
    }) {
        const res: { [key: string]: any } = {};
        res[key] = {
            "@timestamp": timestamp.toMillis(),
            "@type": "ModelTimestamp",
        };
        return res;
    }
}