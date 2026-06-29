
/**
 * Base class for converting [ModelFieldValue] for use in Firestore.
 * 
 * Firestoreで利用するための[ModelFieldValue]の変換を行うベースクラス。
 */
export abstract class ModelFieldValueConverter {
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
     * Firestoreで管理可能な型から[ModelFieldValue]に変換します。
     * 
     * @param key
     * @param value
     * @param original
     * @returns
     */
    abstract convertFrom(
        key: string,
        value: any,
        original: { [field: string]: any },
    ): { [field: string]: any } | null;
    /**
     * Convert from [ModelFieldValue] to Firestore manageable type.
     * 
     * [ModelFieldValue]からFirestoreで管理可能な型に変換します。
     * 
     * @param key
     * @param value
     * @param original
     * @returns
     */
    abstract convertTo(
        key: string,
        value: any,
        original: { [field: string]: any },
    ): { [field: string]: any } | null;
}
