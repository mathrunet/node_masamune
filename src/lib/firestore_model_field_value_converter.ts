import { DocumentReference, Timestamp } from "firebase-admin/firestore";

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