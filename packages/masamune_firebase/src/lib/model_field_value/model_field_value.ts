import * as firestore from "firebase-admin/firestore";
import { ModelFieldValueSource, ModelRefBase } from "@mathrunet/masamune";
import { DocumentModel } from "../exntensions/firestore.extension";


/**
 * ModelRefFirebase interface.
 * 
 * katana_modelの`ModelRefFirebase`用のインターフェース。
 */
export class ModelRefFirebase extends ModelRefBase<DocumentModel<firestore.DocumentData, firestore.DocumentData>> {
    constructor(ref: string, doc?: firestore.DocumentReference | undefined, source?: ModelFieldValueSource) {
        super("ModelRefBase", source);
        this["@ref"] = ref;
        this["@doc"] = doc;
    }
    "@doc": firestore.DocumentReference | undefined;

    /**
     * Get the value of the ref.
     * 
     * リファレンスの値を取得します。
     * 
     * @returns The value of the ref.
     */
    value(): string {
        return this["@ref"] as string;
    }

    /**
     * Load the document.
     * 
     * ドキュメントを読み込みます。
     * 
     * @returns The value of the ref.
     */
    async load(): Promise<DocumentModel<firestore.DocumentData, firestore.DocumentData> | undefined | null> {
        const res = await this["@doc"]?.load();
        if (!res) {
            throw new Error("Failed to load document");
        }
        return res;
    }

    /**
     * Save the document.
     * 
     * ドキュメントを保存します。
     * 
     * @param data The data to save.
     * @param options The options to save.
     * @returns The value of the ref.
     */
    async save(data: firestore.PartialWithFieldValue<firestore.DocumentData>, options: firestore.SetOptions): Promise<void> {
        await this["@doc"]?.save(data, options);
    }

    /**
     * Delete the document.
     * 
     * ドキュメントを削除します。
     * 
     * @returns The value of the ref.
     */
    async delete(): Promise<void> {
        await this["@doc"]?.delete();
    }

    /**
     * Get the id of the ref.
     * 
     * リファレンスのIDを取得します。
     * 
     * @returns The id of the ref.
     */
    get id(): string {
        const doc = this["@doc"];
        if (!doc) {
            return this["@ref"]?.split("/").pop() ?? "";
        }
        return doc.id;
    }

    /**
     * Get the ref of the document.
     * 
     * ドキュメントのリファレンスを取得します。
     * 
     * @returns The ref of the document.
     */
    get ref(): firestore.DocumentReference | undefined {
        return this["@doc"];
    }

}
