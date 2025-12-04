import * as firestore from "firebase-admin/firestore";
import { FirestoreModelFieldValueConverterUtils, ModelFieldValueConverterUtils } from "../model_field_value/default_model_field_value_converter";
import { ModelGeoValue, ModelRefBase, ModelTimestamp, ModelVectorValue } from "../model_field_value/model_field_value";
import { VectorValue } from "@google-cloud/firestore";

/**
 * Document model.
 * 
 * ドキュメントモデル。
 * 
 * @param {firestore.DocumentSnapshot<AppModelType, DbModelType>} source
 * Source document snapshot.
 * 
 * ソースドキュメントスナップショット。
 * 
 * @param {AppModelType | undefined} data
 * Data.
 * 
 * データ。
 * 
 * @returns {DocumentModel<AppModelType, DbModelType>}
 * Document model.
 * 
 * ドキュメントモデル。
 */
export class DocumentModel<AppModelType, DbModelType extends firestore.DocumentData> implements firestore.DocumentSnapshot<AppModelType, DbModelType> {
    constructor(
        source: firestore.DocumentSnapshot<AppModelType, DbModelType>,
        data: AppModelType | undefined,
    ) {
        this._source = source;
        this._data = data;
        this.exists = source.exists;
        this.ref = source.ref;
        this.id = source.id;
        this.createTime = source.createTime;
        this.updateTime = source.updateTime;
        this.readTime = source.readTime;
    }
    data(): AppModelType | undefined {
        return this._data;
    }
    get(fieldPath: string | firestore.FieldPath) {
        return this._source.get(fieldPath);
    }
    isEqual(other: firestore.DocumentSnapshot<AppModelType, DbModelType>): boolean {
        return this._source.isEqual(other);
    }
    protected _data: AppModelType | undefined;
    protected _source: firestore.DocumentSnapshot<AppModelType, DbModelType>;
    readonly exists: boolean;
    readonly ref: firestore.DocumentReference<AppModelType, DbModelType>;
    readonly id: string;
    readonly createTime?: firestore.Timestamp;
    readonly updateTime?: firestore.Timestamp;
    readonly readTime: firestore.Timestamp;
}


/**
 * Query document model.
 * 
 * クエリドキュメントモデル。
 * 
 * @param {firestore.QueryDocumentSnapshot<AppModelType, DbModelType>} source
 * Source query document snapshot.
 * 
 * ソースクエリドキュメントスナップショット。
 * 
 * @param {AppModelType | undefined} data
 * Data.
 * 
 * データ。
 * 
 * @returns {QueryDocumentModel<AppModelType, DbModelType>}
 * Query document model.
 * 
 * クエリドキュメントモデル。
 */
export class QueryDocumentModel<AppModelType, DbModelType extends firestore.DocumentData> extends DocumentModel<AppModelType, DbModelType> implements firestore.QueryDocumentSnapshot<AppModelType, DbModelType> {
    constructor(
        source: firestore.QueryDocumentSnapshot<AppModelType, DbModelType>,
        data: AppModelType | undefined,
    ) {
        super(source, data);
        this.createTime = source.createTime;
        this.updateTime = source.updateTime;
    }
    data(): AppModelType {
        return this._data ?? {} as AppModelType;
    }
    get(fieldPath: string | firestore.FieldPath) {
        return this._source.get(fieldPath);
    }
    isEqual(other: firestore.QueryDocumentSnapshot<AppModelType, DbModelType>): boolean {
        return this._source.isEqual(other);
    }
    readonly createTime: firestore.Timestamp;
    readonly updateTime: firestore.Timestamp;
}

/**
 * Document change model.
 * 
 * ドキュメント変更モデル。
 * 
 * @param {firestore.DocumentChange<AppModelType, DbModelType>} source
 * Source document change.
 * 
 * ソースドキュメント変更。
 * 
 * @param {QueryDocumentModel<AppModelType, DbModelType>} doc
 * Document model.
 * 
 * ドキュメントモデル。
 * 
 * @returns {DocumentChangeModel<AppModelType, DbModelType>}
 * Document change model.
 * 
 * ドキュメント変更モデル。
 */
export class DocumentChangeModel<AppModelType, DbModelType extends firestore.DocumentData> implements firestore.DocumentChange<AppModelType, DbModelType> {
    constructor(
        source: firestore.DocumentChange<AppModelType, DbModelType>,
        doc: QueryDocumentModel<AppModelType, DbModelType>,
    ) {
        this._source = source;
        this.type = source.type;
        this.doc = doc;
        this.oldIndex = source.oldIndex;
        this.newIndex = source.newIndex;
    }
    isEqual(other: firestore.DocumentChange<AppModelType, DbModelType>): boolean {
        return this._source.isEqual(other);
    }
    private _source: firestore.DocumentChange<AppModelType, DbModelType>;
    readonly type: firestore.DocumentChangeType;
    readonly doc: QueryDocumentModel<AppModelType, DbModelType>;
    readonly oldIndex: number;
    readonly newIndex: number;
}

/**
 * Collection model.
 * 
 * コレクションモデル。
 * 
 * @param {firestore.QuerySnapshot<AppModelType, DbModelType>} source
 * Source query snapshot.
 * 
 * ソースクエリスナップショット。
 * 
 * @param {Array<QueryDocumentModel<AppModelType, DbModelType>>} data
 * Data.
 * 
 * データ。
 * 
 * @param {DocumentChangeModel<AppModelType, DbModelType>[]} changes
 * Changes.
 * 
 * 変更内容。
 * 
 * @returns {CollectionModel<AppModelType, DbModelType>}
 * Collection model.
 * 
 * コレクションモデル。
 */
export class CollectionModel<AppModelType, DbModelType extends firestore.DocumentData> implements firestore.QuerySnapshot<AppModelType, DbModelType> {
    constructor(
        source: firestore.QuerySnapshot<AppModelType, DbModelType>,
        data: Array<QueryDocumentModel<AppModelType, DbModelType>>,
        changes: DocumentChangeModel<AppModelType, DbModelType>[],
    ) {
        this._source = source;
        this.docs = data;
        this.query = source.query;
        this.size = source.size;
        this.empty = source.empty;
        this.readTime = source.readTime;
        this._changes = changes;
    }

    private _changes: DocumentChangeModel<AppModelType, DbModelType>[];
    private _source: firestore.QuerySnapshot<AppModelType, DbModelType>;

    docChanges(): DocumentChangeModel<AppModelType, DbModelType>[] {
        return this._changes;
    }
    forEach(callback: (result: QueryDocumentModel<AppModelType, DbModelType>) => void, thisArg?: any): void {
        for (const doc of this.docs) {
            callback(doc);
        }
    }
    isEqual(other: firestore.QuerySnapshot<AppModelType, DbModelType>): boolean {
        return this._source.isEqual(other);
    }
    readonly query: firestore.Query<AppModelType, DbModelType>;
    readonly docs: Array<QueryDocumentModel<AppModelType, DbModelType>>;
    readonly size: number;
    readonly empty: boolean;
    readonly readTime: firestore.Timestamp;

}

declare module "firebase-admin/firestore" {
    interface DocumentReference<AppModelType, DbModelType extends firestore.DocumentData> {
        /**
         * Load the document.
         * 
         * ドキュメントを読み込みます。
         * 
         * @returns {Promise<DocumentModel<AppModelType, DbModelType>>}
         * Document model.
         * 
         * ドキュメントモデル。
         */
        load(): Promise<DocumentModel<AppModelType, DbModelType>>;
        /**
         * Save the document.
         * 
         * ドキュメントを保存します。
         * 
         * @param {firestore.PartialWithFieldValue<AppModelType>} data
         * Data to save.
         * 
         * 保存するデータ。
         * 
         * @param {firestore.SetOptions} options
         * Options for saving.
         * 
         * 保存オプション。
         * 
         * @returns {Promise<firestore.WriteResult>}
         * Write result.
         * 
         * 書き込み結果。
         */
        save(
            data: firestore.PartialWithFieldValue<AppModelType>,
            options: firestore.SetOptions
        ): Promise<firestore.WriteResult>;
        /**
         * Save the document.
         * 
         * ドキュメントを保存します。
         * 
         * @param data Data to save.
         * 
         * 保存するデータ。
         * 
         * @returns {Promise<firestore.WriteResult>}
         * Write result.
         * 
         * 書き込み結果。
         */
        save(data: firestore.WithFieldValue<AppModelType>): Promise<firestore.WriteResult>;        
        /**
         * Convert to ModelRefBase.
         * 
         * ModelRefBaseに変換します。
         * 
         * @returns {ModelRefBase}
         * ModelRefBase.
         * 
         * ModelRefBase。
         */
        toModelRefBase(): ModelRefBase;
    }
    interface Query<AppModelType, DbModelType extends firestore.DocumentData> {
        /**
         * Load the collection.
         * 
         * コレクションを読み込みます。
         * 
         * @returns {Promise<CollectionModel<AppModelType, DbModelType>>}
         * Collection model.
         * 
         * コレクションモデル。
         */
        load(): Promise<CollectionModel<AppModelType, DbModelType>>;
    }
    interface Timestamp {
        /**
         * Convert to ModelTimestamp.
         * 
         * ModelTimestampに変換します。
         * 
         * @returns {ModelTimestamp}
         * ModelTimestamp.
         * 
         * ModelTimestamp。
         */
        toModelTimestamp(): ModelTimestamp;
    }
    interface GeoPoint {
        /**
         * Convert to ModelGeoValue.
         * 
         * ModelGeoValueに変換します。
         * 
         * @returns {ModelGeoValue}
         * ModelGeoValue.
         * 
         * ModelGeoValue。
         */
        toModelGeoValue(): ModelGeoValue;
    }
}
declare module "@google-cloud/firestore" {
    interface VectorValue {
        /**
         * Convert to ModelVectorValue.
         * 
         * ModelVectorValueに変換します。
         * 
         * @returns {ModelVectorValue}
         * ModelVectorValue.
         * 
         * ModelVectorValue。
         */
        toModelVectorValue(): ModelVectorValue;
    }
}

/**
 * Load the document.
 * 
 * ドキュメントを読み込みます。
 */
(firestore.DocumentReference.prototype as any).load = async function<AppModelType extends { [field: string]: any }, DbModelType extends firestore.DocumentData>(
    this: firestore.DocumentReference<AppModelType, DbModelType>
): Promise<DocumentModel<AppModelType, DbModelType>> {
    const result = await this.get();
    const data = result.data() as { [field: string]: any } | undefined ?? {};
    const firestoreInstance = result.ref.firestore;
    const converted = ModelFieldValueConverterUtils.convertFrom({
        data: FirestoreModelFieldValueConverterUtils.convertFrom({
            data: data,
            firestoreInstance: firestoreInstance,
        }),
    });
    return new DocumentModel(result, converted as AppModelType);
};
/**
 * Save the document.
 * 
 * ドキュメントを保存します。
 * 
 * @param {firestore.PartialWithFieldValue<T>} data
 * Data to save.
 * 
 * 保存するデータ。
 * 
 * @param {firestore.SetOptions} options
 * Options for saving.
 * 
 * 保存オプション。
 */
(firestore.DocumentReference.prototype as any).save = async function<AppModelType extends { [field: string]: any }, DbModelType extends firestore.DocumentData>(
    this: firestore.DocumentReference<AppModelType, DbModelType>,
    data: firestore.WithFieldValue<AppModelType>
): Promise<firestore.WriteResult> {
    const update = data as { [field: string]: any } | undefined ?? {};
    const firestoreInstance = this.firestore;
    const converted = FirestoreModelFieldValueConverterUtils.convertTo({
        data: ModelFieldValueConverterUtils.convertTo({
            data: update,
        }),
        firestoreInstance: firestoreInstance,
    });
    return await this.set(converted as firestore.WithFieldValue<AppModelType>);
};

/**
 * Convert to ModelRefBase.
 * 
 * ModelRefBaseに変換します。
 * 
 * @returns {ModelRefBase}
 * ModelRefBase.
 * 
 * ModelRefBase。
 */
(firestore.DocumentReference.prototype as any).toModelRefBase = function<AppModelType extends { [field: string]: any }, DbModelType extends firestore.DocumentData>(
    this: firestore.DocumentReference<AppModelType, DbModelType>
): ModelRefBase {
    return new ModelRefBase(this.path.replace(/\/+$/, ""));
};

/**
 * Save the document.
 * 
 * ドキュメントを保存します。
 * 
 * @param {firestore.PartialWithFieldValue<T>} data
 * Data to save.
 * 
 * 保存するデータ。
 * 
 * @param {firestore.SetOptions} options
 * Options for saving.
 * 
 * 保存オプション。
 */
(firestore.DocumentReference.prototype as any).save = async function<AppModelType extends { [field: string]: any }, DbModelType extends firestore.DocumentData>(
    this: firestore.DocumentReference<AppModelType, DbModelType>,
    data: firestore.PartialWithFieldValue<AppModelType>,
    options: firestore.SetOptions
): Promise<firestore.WriteResult> {
    const update = data as { [field: string]: any } | undefined ?? {};
    const firestoreInstance = this.firestore;
    const converted = FirestoreModelFieldValueConverterUtils.convertTo({
        data: ModelFieldValueConverterUtils.convertTo({
            data: update,
        }),
        firestoreInstance: firestoreInstance,
    });
    return await this.set(converted as firestore.PartialWithFieldValue<AppModelType>, options);
};

/**
 * Load the collection.
 * 
 * コレクションを読み込みます。
 */
(firestore.Query.prototype as any).load = async function<AppModelType extends { [field: string]: any }, DbModelType extends firestore.DocumentData>(
    this: firestore.Query<AppModelType, DbModelType>
): Promise<CollectionModel<AppModelType, DbModelType>> {
    const result = await this.get();
    const docs: QueryDocumentModel<AppModelType, DbModelType>[] = [];
    const changes: DocumentChangeModel<AppModelType, DbModelType>[] = [];
    for (const doc of result.docs) {
        const data = doc.data() as { [field: string]: any } | undefined ?? {};
        const firestoreInstance = doc.ref.firestore;
        const converted = ModelFieldValueConverterUtils.convertFrom({
            data: FirestoreModelFieldValueConverterUtils.convertFrom({
                data: data,
                firestoreInstance: firestoreInstance,
            }),
        });
        docs.push(new QueryDocumentModel(doc, converted as AppModelType));
    }
    for (const doc of result.docChanges()) {
        const data = doc.doc.data() as { [field: string]: any } | undefined ?? {};
        const firestoreInstance = doc.doc.ref.firestore;
        const converted = ModelFieldValueConverterUtils.convertFrom({
            data: FirestoreModelFieldValueConverterUtils.convertFrom({
                data: data,
                firestoreInstance: firestoreInstance,
            }),
        });
        changes.push(new DocumentChangeModel(doc, new QueryDocumentModel(doc.doc, converted as AppModelType)));
    }
    return new CollectionModel(result,  docs, changes);
};

/**
 * Convert to ModelTimestamp.
 * 
 * ModelTimestampに変換します。
 * 
 * @returns {ModelTimestamp}
 * ModelTimestamp.
 * 
 * ModelTimestamp。
 */
(firestore.Timestamp.prototype as any).toModelTimestamp = function(): ModelTimestamp {
    return new ModelTimestamp(this.toDate());
};

/**
 * Convert to ModelGeoValue.
 * 
 * ModelGeoValueに変換します。
 * 
 * @returns {ModelGeoValue}
 * ModelGeoValue.
 * 
 * ModelGeoValue。
 */
(firestore.GeoPoint.prototype as any).toModelGeoValue = function(): ModelGeoValue {
    return new ModelGeoValue(this.latitude, this.longitude);
};

/**
 * Convert to ModelVectorValue.
 * 
 * ModelVectorValueに変換します。
 * 
 * @returns {ModelVectorValue}
 * ModelVectorValue.
 * 
 * ModelVectorValue。
 */
(VectorValue.prototype as any).toModelVectorValue = function(): ModelVectorValue {
    return new ModelVectorValue(this.toArray());
};