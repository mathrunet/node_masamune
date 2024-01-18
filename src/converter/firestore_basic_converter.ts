import { FirestoreModelFieldValueConverter } from "../lib/firestore_model_field_value_converter";

/**
 * Normal FirestoreConverter.
 * 
 * 通常のFirestoreConverter。
 */
export class FirestoreBasicConverter extends FirestoreModelFieldValueConverter {
  type: string = "Object";

  convertFrom(
    key: string,
    value: any,
    original: { [field: string]: any }): { [field: string]: any } | null {
    return null;
  }
}
