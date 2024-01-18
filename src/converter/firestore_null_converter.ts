import { FirestoreModelFieldValueConverter } from "../lib/firestore_model_field_value_converter";

/**
 * FirestoreConverter for [Null].
 * 
 * [Null]用のFirestoreConverter。
 */
export class FirestoreNullConverter extends FirestoreModelFieldValueConverter {
  type: string = "Null";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    return null;
  }
}
