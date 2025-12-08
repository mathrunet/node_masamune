import { DocumentReference, Timestamp } from "firebase-admin/firestore";

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
     * Firestoreで管理可能な型から[ModelFieldValue]に変換します。
     * 
     * [key]と[value]から[DynamicMap]の値を生成して返してください。[original]は変換前の[DynamicMap]を渡します。
     * 
     * 変更がない場合は[Null]を返してください。
     */
    abstract convertFrom(
        key: string,
        value: any,
        original: { [field: string]: any },
        firestoreInstance: FirebaseFirestore.Firestore
    ): { [field: string]: any } | null;
    /**
     * Convert from [ModelFieldValue] to Firestore manageable type.
     * 
     * Generate and return a [DynamicMap] value from [key] and [value]. [original] is passed the [DynamicMap] before conversion.
     * 
     * Return [Null] if there are no changes.
     * 
     * [ModelFieldValue]からFirestoreで管理可能な型に変換します。
     * 
     * [key]と[value]から[DynamicMap]の値を生成して返してください。[original]は変換前の[DynamicMap]を渡します。
     * 
     * 変更がない場合は[Null]を返してください。
     */
    abstract convertTo(
        key: string,
        value: any,
        original: { [field: string]: any },
        firestoreInstance: FirebaseFirestore.Firestore
    ): { [field: string]: any } | null;
    
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
